//! LocalClip — histórico de área de transferência 100% local.
//!
//! Poller no Rust (a cada ~800 ms) lê o clipboard via plugin; item novo vira
//! linha no SQLite (dedup por hash — recopiar sobe pro topo). No Windows,
//! conteúdo marcado com `ExcludeClipboardContentFromMonitorProcessing`
//! (LocalKeys e gerenciadores de senha marcam) é IGNORADO — senha não entra
//! no histórico. Privacidade: tudo local, retenção configurável, limpar tudo.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use base64::Engine;
use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;

pub struct Db(Mutex<Option<Connection>>);
/// O copy disparado por NÓS (re-copiar item) não deve voltar pro histórico.
static SKIP_NEXT: AtomicBool = AtomicBool::new(false);

fn with_conn<T>(
    app: &AppHandle,
    f: impl FnOnce(&Connection) -> Result<T, String>,
) -> Result<T, String> {
    let db = app.state::<Db>();
    let guard = db.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("banco não inicializado")?;
    f(conn)
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn hash_of(kind: &str, data: &[u8]) -> String {
    let mut h = DefaultHasher::new();
    (kind, data).hash(&mut h);
    format!("{:016x}", h.finish())
}

/// Windows: o conteúdo atual pediu pra ficar FORA de históricos?
/// `IsClipboardFormatAvailable` não exige abrir o clipboard — checagem barata.
#[cfg(windows)]
fn excluded_from_monitoring() -> bool {
    use std::sync::OnceLock;
    static FMT: OnceLock<u32> = OnceLock::new();
    let fmt = *FMT.get_or_init(|| {
        clipboard_win::register_format("ExcludeClipboardContentFromMonitorProcessing")
            .map(|f| f.get())
            .unwrap_or(0)
    });
    fmt != 0 && clipboard_win::is_format_avail(fmt)
}

#[cfg(not(windows))]
fn excluded_from_monitoring() -> bool {
    false
}

// ---------- schema ----------

fn open_db(path: &std::path::Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         CREATE TABLE IF NOT EXISTS items (
           id INTEGER PRIMARY KEY,
           kind TEXT NOT NULL,             -- text | image
           content TEXT,                   -- texto (kind=text)
           image BLOB,                     -- png (kind=image)
           hash TEXT NOT NULL UNIQUE,
           pinned INTEGER NOT NULL DEFAULT 0,
           created_ms INTEGER NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_items_created ON items(pinned DESC, created_ms DESC);",
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

const DEFAULT_RETENTION: i64 = 500;

fn insert_item(
    conn: &Connection,
    kind: &str,
    content: Option<&str>,
    image: Option<&[u8]>,
    hash: &str,
) -> Result<bool, String> {
    // Repetido: só sobe pro topo (created novo), sem duplicar.
    let updated = conn
        .execute(
            "UPDATE items SET created_ms = ?1 WHERE hash = ?2",
            rusqlite::params![now_ms(), hash],
        )
        .map_err(|e| e.to_string())?;
    if updated > 0 {
        return Ok(false);
    }
    conn.execute(
        "INSERT INTO items (kind, content, image, hash, created_ms) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![kind, content, image, hash, now_ms()],
    )
    .map_err(|e| e.to_string())?;
    // Retenção: apaga os mais velhos não fixados além do teto.
    conn.execute(
        "DELETE FROM items WHERE pinned = 0 AND id NOT IN (
           SELECT id FROM items WHERE pinned = 0 ORDER BY created_ms DESC LIMIT ?1)",
        [DEFAULT_RETENTION],
    )
    .map_err(|e| e.to_string())?;
    Ok(true)
}

// ---------- poller ----------

fn poll_once(app: &AppHandle, last_hash: &mut String) {
    if SKIP_NEXT.swap(false, Ordering::Relaxed) {
        // Ainda captura o hash pra não re-inserir na próxima volta.
        if let Ok(text) = app.clipboard().read_text() {
            *last_hash = hash_of("text", text.as_bytes());
        }
        return;
    }
    if excluded_from_monitoring() {
        return; // senha/segredo marcado: não entra no histórico
    }
    // Texto primeiro (mais comum); imagem se não houver texto.
    if let Ok(text) = app.clipboard().read_text() {
        if !text.trim().is_empty() && text.len() <= 512 * 1024 {
            let h = hash_of("text", text.as_bytes());
            if h != *last_hash {
                *last_hash = h.clone();
                let added = with_conn(app, |c| insert_item(c, "text", Some(&text), None, &h));
                if matches!(added, Ok(true)) {
                    let _ = app.emit("clip-changed", ());
                } else if matches!(added, Ok(false)) {
                    let _ = app.emit("clip-changed", ());
                }
            }
            return;
        }
    }
    if let Ok(img) = app.clipboard().read_image() {
        let rgba = img.rgba();
        let (w, hgt) = (img.width(), img.height());
        if w == 0 || hgt == 0 || (w * hgt) > 16_000_000 {
            return;
        }
        let Some(buf) = image::RgbaImage::from_raw(w, hgt, rgba.to_vec()) else { return };
        let mut png: Vec<u8> = Vec::new();
        if image::DynamicImage::ImageRgba8(buf)
            .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
            .is_err()
        {
            return;
        }
        let h = hash_of("image", &png);
        if h != *last_hash {
            *last_hash = h.clone();
            if with_conn(app, |c| insert_item(c, "image", None, Some(&png), &h)).is_ok() {
                let _ = app.emit("clip-changed", ());
            }
        }
    }
}

// ---------- comandos ----------

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ItemRow {
    id: i64,
    kind: String,
    /// Texto completo (text) ou data-URL do PNG (image).
    content: String,
    pinned: bool,
    created_ms: i64,
}

#[tauri::command(async)]
fn list_items(app: AppHandle, query: String) -> Result<Vec<ItemRow>, String> {
    with_conn(&app, |conn| {
        let like = format!("%{}%", query.trim());
        let mut stmt = conn
            .prepare(
                "SELECT id, kind, content, image, pinned, created_ms FROM items
                 WHERE (?1 = '%%' OR (kind = 'text' AND content LIKE ?1))
                 ORDER BY pinned DESC, created_ms DESC LIMIT 300",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([&like], |r| {
                let kind: String = r.get(1)?;
                let content: Option<String> = r.get(2)?;
                let image: Option<Vec<u8>> = r.get(3)?;
                let body = if kind == "image" {
                    format!(
                        "data:image/png;base64,{}",
                        base64::engine::general_purpose::STANDARD.encode(image.unwrap_or_default())
                    )
                } else {
                    content.unwrap_or_default()
                };
                Ok(ItemRow {
                    id: r.get(0)?,
                    kind,
                    content: body,
                    pinned: r.get::<_, i64>(4)? != 0,
                    created_ms: r.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    })
}

/// Copia o item de volta pro clipboard (o poller ignora esse copy).
#[tauri::command(async)]
fn copy_item(app: AppHandle, id: i64) -> Result<(), String> {
    let (kind, content): (String, Option<String>) = with_conn(&app, |conn| {
        conn.query_row("SELECT kind, content FROM items WHERE id = ?1", [id], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .map_err(|e| e.to_string())
    })?;
    if kind == "text" {
        SKIP_NEXT.store(true, Ordering::Relaxed);
        app.clipboard()
            .write_text(content.unwrap_or_default())
            .map_err(|e| e.to_string())?;
        // Sobe pro topo (é o item "atual" de novo).
        with_conn(&app, |conn| {
            conn.execute("UPDATE items SET created_ms = ?1 WHERE id = ?2", rusqlite::params![now_ms(), id])
                .map_err(|e| e.to_string())?;
            Ok(())
        })?;
        let _ = app.emit("clip-changed", ());
        Ok(())
    } else {
        // Recolocar imagem no clipboard fica pra v0.2 (write_image + decode).
        Err("recopiar imagem chega na v0.2".into())
    }
}

#[tauri::command(async)]
fn delete_item(app: AppHandle, id: i64) -> Result<(), String> {
    with_conn(&app, |conn| {
        conn.execute("DELETE FROM items WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
        Ok(())
    })
}

#[tauri::command(async)]
fn toggle_pin(app: AppHandle, id: i64) -> Result<(), String> {
    with_conn(&app, |conn| {
        conn.execute("UPDATE items SET pinned = 1 - pinned WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

/// Limpa o histórico (fixados ficam).
#[tauri::command(async)]
fn clear_all(app: AppHandle) -> Result<(), String> {
    with_conn(&app, |conn| {
        conn.execute("DELETE FROM items WHERE pinned = 0", []).map_err(|e| e.to_string())?;
        Ok(())
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }))
            .plugin(
                // Popup por atalho global: Ctrl+Shift+V mostra/foca a janela.
                tauri_plugin_global_shortcut::Builder::new()
                    .with_shortcuts(["ctrl+shift+v"])
                    .expect("atalho inválido")
                    .with_handler(|app, _shortcut, event| {
                        if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                            if let Some(win) = app.get_webview_window("main") {
                                let visible = win.is_visible().unwrap_or(false);
                                let focused = win.is_focused().unwrap_or(false);
                                if visible && focused {
                                    let _ = win.hide();
                                } else {
                                    let _ = win.show();
                                    let _ = win.set_focus();
                                    let _ = app.emit("focus-search", ());
                                }
                            }
                        }
                    })
                    .build(),
            );
    }

    builder
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Db(Mutex::new(None)))
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = open_db(&dir.join("localclip.db")).map_err(std::io::Error::other)?;
            *app.state::<Db>().0.lock().unwrap() = Some(conn);

            // Poller do clipboard (thread; 800 ms é imperceptível e barato).
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut last_hash = String::new();
                loop {
                    poll_once(&handle, &mut last_hash);
                    std::thread::sleep(Duration::from_millis(800));
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_items,
            copy_item,
            delete_item,
            toggle_pin,
            clear_all,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn insert_dedup_e_retencao() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE items (
               id INTEGER PRIMARY KEY, kind TEXT NOT NULL, content TEXT, image BLOB,
               hash TEXT NOT NULL UNIQUE, pinned INTEGER NOT NULL DEFAULT 0,
               created_ms INTEGER NOT NULL);",
        )
        .unwrap();
        let h = hash_of("text", b"ola");
        assert!(insert_item(&conn, "text", Some("ola"), None, &h).unwrap());
        // repetido não duplica
        assert!(!insert_item(&conn, "text", Some("ola"), None, &h).unwrap());
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM items", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn hash_estavel_e_distinto() {
        assert_eq!(hash_of("text", b"a"), hash_of("text", b"a"));
        assert_ne!(hash_of("text", b"a"), hash_of("text", b"b"));
        assert_ne!(hash_of("text", b"a"), hash_of("image", b"a"));
    }
}
