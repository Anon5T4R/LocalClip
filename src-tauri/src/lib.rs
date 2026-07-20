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
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use tauri_plugin_autostart::ManagerExt;
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
         CREATE INDEX IF NOT EXISTS idx_items_created ON items(pinned DESC, created_ms DESC);
         CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

const DEFAULT_RETENTION: i64 = 500;

fn retention(conn: &Connection) -> i64 {
    conn.query_row("SELECT value FROM meta WHERE key = 'retention'", [], |r| {
        r.get::<_, String>(0)
    })
    .ok()
    .and_then(|s| s.parse().ok())
    .filter(|n: &i64| *n >= 10 && *n <= 5000)
    .unwrap_or(DEFAULT_RETENTION)
}

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
    // Retenção: apaga os mais velhos não fixados além do teto (configurável).
    conn.execute(
        "DELETE FROM items WHERE pinned = 0 AND id NOT IN (
           SELECT id FROM items WHERE pinned = 0 ORDER BY created_ms DESC LIMIT ?1)",
        [retention(conn)],
    )
    .map_err(|e| e.to_string())?;
    Ok(true)
}

// ---------- settings (tabela meta) ----------

/// Lê um booleano da `meta`. `None` = a chave nunca foi gravada (instalação
/// antiga ou primeira execução) — quem chama decide o default.
fn setting_bool_opt(conn: &Connection, key: &str) -> Option<bool> {
    conn.query_row("SELECT value FROM meta WHERE key = ?1", [key], |r| {
        r.get::<_, String>(0)
    })
    .ok()
    .map(|s| s == "1" || s == "true")
}

fn set_setting_bool(conn: &Connection, key: &str, value: bool) -> Result<(), String> {
    conn.execute(
        "INSERT INTO meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![key, if value { "1" } else { "0" }],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------- autostart (abrir com o Windows, direto na bandeja) ----------
//
// A intenção do usuário mora no banco (`meta.autostart`), NÃO no registro do
// Windows. O registro é só o efeito — e um efeito que se perde sozinho: o
// `is_enabled()` do plugin só checa se a entrada em `...\CurrentVersion\Run`
// EXISTE, nunca se ela aponta pro exe atual. Se a entrada some (instalador/
// limpador) ou envelhece (o caminho do exe muda), o app pararia de subir no
// logon com a checkbox ainda marcada. Com a intenção no banco,
// `reconcile_autostart` (no setup) reimpõe o registro a cada boot.
// (Padrão da suíte; receita original no LocalAgenda.)

/// Estado desejado pelo usuário. `None` = nunca decidiu (instalação antiga):
/// herda o que já está no SO pra não ligar/desligar nada por conta própria.
fn autostart_intent(app: &AppHandle) -> bool {
    with_conn(app, |c| Ok(setting_bool_opt(c, "autostart")))
        .ok()
        .flatten()
        .unwrap_or_else(|| app.autolaunch().is_enabled().unwrap_or(false))
}

/// O que o SO tem hoje, do ponto de vista de "precisa consertar?".
#[derive(Debug, PartialEq)]
enum OsAutostart {
    /// Entrada presente e apontando pro exe atual — nada a fazer.
    Ok,
    /// Ausente ou apontando pro caminho errado (instalação antiga/movida) —
    /// é o caso a reimpor.
    Broken,
    /// O usuário desligou pelo Gerenciador de Tarefas do Windows. É uma escolha
    /// explícita dele, na UI oficial do SO: obedecemos e desmarcamos a checkbox.
    UserDisabled,
}

/// Espelha o formato que o `auto-launch` grava: `"<exe> <args>"`, sem aspas.
#[cfg(windows)]
fn os_autostart(app: &AppHandle) -> OsAutostart {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
    use winreg::RegKey;

    const RUN: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run";
    const APPROVED: &str =
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";

    let name = &app.package_info().name;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    // Override do Gerenciador de Tarefas: 12 bytes = flag (DWORD) + FILETIME de
    // quando foi desligado. No flag, o bit 0 ligado = desabilitado (2/6 ligado,
    // 3/7 desligado); quando habilitado, o timestamp fica zerado. Checamos os
    // dois: o auto-launch só olha o timestamp, o que não enxerga um flag
    // desligado com timestamp zerado.
    let approved_off = hkcu
        .open_subkey_with_flags(APPROVED, KEY_READ)
        .ok()
        .and_then(|k| k.get_raw_value(name).ok())
        .map(|v| {
            let b = &v.bytes;
            let flag_off = b.first().map(|f| f & 1 != 0).unwrap_or(false);
            let stamped_off = b.len() >= 12 && !b[4..12].iter().all(|x| *x == 0);
            flag_off || stamped_off
        })
        .unwrap_or(false);
    if approved_off {
        return OsAutostart::UserDisabled;
    }

    let current = std::env::current_exe()
        .map(|p| p.display().to_string())
        .unwrap_or_default();
    let expected = format!("{current} --hidden");

    match hkcu
        .open_subkey_with_flags(RUN, KEY_READ)
        .ok()
        .and_then(|k| k.get_value::<String, _>(name).ok())
    {
        Some(v) if v.trim().eq_ignore_ascii_case(expected.trim()) => OsAutostart::Ok,
        _ => OsAutostart::Broken,
    }
}

/// Fora do Windows não há registro pra envelhecer: o `is_enabled()` basta.
#[cfg(not(windows))]
fn os_autostart(app: &AppHandle) -> OsAutostart {
    if app.autolaunch().is_enabled().unwrap_or(false) {
        OsAutostart::Ok
    } else {
        OsAutostart::Broken
    }
}

/// Alinha o SO com a intenção guardada, a cada boot. É isso que conserta a
/// entrada apagada por um instalador ou apontando pro caminho antigo — sem isso
/// o app pararia de subir no logon, calado, com a checkbox marcada.
fn reconcile_autostart(app: &AppHandle) {
    let mut want = autostart_intent(app);
    let state = os_autostart(app);

    // O Gerenciador de Tarefas vence a checkbox: o usuário mandou desligar por
    // lá, então a intenção passa a ser essa (senão reimporíamos todo boot,
    // brigando com ele).
    if want && state == OsAutostart::UserDisabled {
        want = false;
    }
    let _ = with_conn(app, |c| set_setting_bool(c, "autostart", want));

    let mgr = app.autolaunch();
    let res = match (want, &state) {
        (true, OsAutostart::Broken) => mgr.enable(),
        (false, OsAutostart::Ok) => mgr.disable(),
        _ => Ok(()),
    };
    if let Err(e) = res {
        eprintln!("[localclip] falha ao reconciliar o autostart (want={want}, so={state:?}): {e}");
    }
}

// ---------- bandeja ----------

/// Traz a janela de volta da bandeja.
fn open_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Clique no ícone da bandeja: mostra se escondida, esconde se visível.
fn toggle_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
    }
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
    SKIP_NEXT.store(true, Ordering::Relaxed);
    if kind == "text" {
        app.clipboard()
            .write_text(content.unwrap_or_default())
            .map_err(|e| e.to_string())?;
    } else {
        // Imagem: decodifica o PNG guardado → RGBA → Image do Tauri.
        let png: Vec<u8> = with_conn(&app, |conn| {
            conn.query_row("SELECT image FROM items WHERE id = ?1", [id], |r| r.get(0))
                .map_err(|e| e.to_string())
        })?;
        let img = image::load_from_memory(&png).map_err(|e| e.to_string())?.to_rgba8();
        let (w, h) = (img.width(), img.height());
        let tauri_img = tauri::image::Image::new_owned(img.into_raw(), w, h);
        app.clipboard().write_image(&tauri_img).map_err(|e| e.to_string())?;
    }
    // Sobe pro topo (é o item "atual" de novo).
    with_conn(&app, |conn| {
        conn.execute("UPDATE items SET created_ms = ?1 WHERE id = ?2", rusqlite::params![now_ms(), id])
            .map_err(|e| e.to_string())?;
        Ok(())
    })?;
    let _ = app.emit("clip-changed", ());
    Ok(())
}

/// Manda texto ARBITRÁRIO pro clipboard sem encostar no banco.
///
/// Serve às transformações rápidas (MAIÚSCULAS, trim, …): o que vai pro
/// clipboard é o texto transformado, mas o item guardado continua exatamente
/// como o usuário copiou — por isso aqui NÃO tem INSERT nem o UPDATE de
/// created_ms que o `copy_item` faz. Não dá pra reaproveitar o `copy_item`
/// justamente por causa desse UPDATE.
///
/// O SKIP_NEXT é o que impede o texto transformado de voltar como item novo
/// pelo poller — sem ele, cada clique em "MAIÚSCULAS" poluiria o histórico com
/// uma variante do que já está lá.
#[tauri::command(async)]
fn copy_text(app: AppHandle, text: String) -> Result<(), String> {
    SKIP_NEXT.store(true, Ordering::Relaxed);
    app.clipboard().write_text(text).map_err(|e| e.to_string())
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

#[tauri::command(async)]
fn get_retention(app: AppHandle) -> Result<i64, String> {
    with_conn(&app, |conn| Ok(retention(conn)))
}

/// Define quantos itens não fixados manter (10–5000) e apara na hora.
#[tauri::command(async)]
fn set_retention(app: AppHandle, value: i64) -> Result<(), String> {
    let v = value.clamp(10, 5000);
    with_conn(&app, |conn| {
        conn.execute(
            "INSERT INTO meta (key, value) VALUES ('retention', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [v.to_string()],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM items WHERE pinned = 0 AND id NOT IN (
               SELECT id FROM items WHERE pinned = 0 ORDER BY created_ms DESC LIMIT ?1)",
            [v],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })?;
    let _ = app.emit("clip-changed", ());
    Ok(())
}

#[tauri::command(async)]
fn autostart_get(app: AppHandle) -> Result<bool, String> {
    Ok(autostart_intent(&app))
}

#[tauri::command(async)]
fn autostart_set(app: AppHandle, enabled: bool) -> Result<(), String> {
    // A intenção primeiro: se o registro falhar, o reconcile do próximo boot
    // ainda tenta de novo em vez de esquecer o que o usuário pediu.
    with_conn(&app, |c| set_setting_bool(c, "autostart", enabled))?;
    let mgr = app.autolaunch();
    if enabled {
        // NUNCA disable().and_then(enable): disable() erra quando não há entrada.
        let _ = mgr.disable();
        mgr.enable().map_err(|e| e.to_string())
    } else {
        mgr.disable().map_err(|e| e.to_string())
    }
}

#[tauri::command(async)]
fn close_to_tray_get(app: AppHandle) -> Result<bool, String> {
    with_conn(&app, |c| Ok(setting_bool_opt(c, "closeToTray").unwrap_or(false)))
}

#[tauri::command(async)]
fn close_to_tray_set(app: AppHandle, enabled: bool) -> Result<(), String> {
    with_conn(&app, |c| set_setting_bool(c, "closeToTray", enabled))
}

/// Limpa o histórico (fixados ficam).
#[tauri::command(async)]
fn clear_all(app: AppHandle) -> Result<(), String> {
    with_conn(&app, |conn| {
        conn.execute("DELETE FROM items WHERE pinned = 0", []).map_err(|e| e.to_string())?;
        vacuum(conn)
    })
}

// ---------- dados e armazenamento ----------
//
// O que o painel existe pra resolver: o histórico guarda PNG inteiro dentro da
// linha (coluna `image`), e a retenção conta ITENS, não bytes. Quinhentas
// capturas de tela cabem folgado no teto de 500 itens e viram centenas de MB
// sem que nada na UI dê um pio. Aqui o usuário vê o tamanho e escolhe o que
// soltar — sempre preservando o que ele FIXOU, que é o equivalente ao favorito
// do LocalFeed.

/// Sem `VACUUM` o arquivo não encolhe depois do DELETE (o SQLite só marca as
/// páginas como livres), e o painel mostraria o mesmo tamanho de antes — ou
/// seja, o botão pareceria não ter funcionado.
fn vacuum(conn: &Connection) -> Result<(), String> {
    conn.execute_batch("VACUUM").map_err(|e| e.to_string())
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StorageCounts {
    items: i64,
    /// Fixados — NUNCA são apagados por nenhuma limpeza daqui.
    pinned: i64,
    images: i64,
    /// Soma dos PNG guardados nas linhas. É quase sempre o grosso do banco.
    image_bytes: i64,
}

fn storage_counts(conn: &Connection) -> Result<StorageCounts, String> {
    conn.query_row(
        "SELECT COUNT(*),
                COALESCE(SUM(pinned), 0),
                COALESCE(SUM(kind = 'image'), 0),
                COALESCE(SUM(LENGTH(image)), 0)
         FROM items",
        [],
        |r| {
            Ok(StorageCounts {
                items: r.get(0)?,
                pinned: r.get(1)?,
                images: r.get(2)?,
                image_bytes: r.get(3)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StorageInfo {
    dir: String,
    /// db + WAL + SHM: o WAL sozinho pode passar do banco depois de uma rajada.
    db_bytes: u64,
    items: i64,
    pinned: i64,
    images: i64,
    image_bytes: i64,
}

#[tauri::command(async)]
fn storage_info(app: AppHandle) -> Result<StorageInfo, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_bytes = ["localclip.db", "localclip.db-wal", "localclip.db-shm"]
        .iter()
        .filter_map(|n| std::fs::metadata(dir.join(n)).ok())
        .map(|m| m.len())
        .sum();
    let c = with_conn(&app, storage_counts)?;
    Ok(StorageInfo {
        dir: dir.to_string_lossy().into_owned(),
        db_bytes,
        items: c.items,
        pinned: c.pinned,
        images: c.images,
        image_bytes: c.image_bytes,
    })
}

/// Apaga só as imagens não fixadas. É o botão que devolve mais espaço por
/// clique, e o único que o usuário pode apertar sem perder texto nenhum.
fn clear_images(conn: &Connection) -> Result<u64, String> {
    let n = conn
        .execute("DELETE FROM items WHERE kind = 'image' AND pinned = 0", [])
        .map_err(|e| e.to_string())?;
    vacuum(conn)?;
    Ok(n as u64)
}

#[tauri::command(async)]
fn clear_images_cmd(app: AppHandle) -> Result<u64, String> {
    let n = with_conn(&app, clear_images)?;
    let _ = app.emit("clip-changed", ());
    Ok(n)
}

/// Apaga itens não fixados mais velhos que `cutoff_ms`.
fn clear_older_than(conn: &Connection, cutoff_ms: i64) -> Result<u64, String> {
    let n = conn
        .execute("DELETE FROM items WHERE pinned = 0 AND created_ms < ?1", [cutoff_ms])
        .map_err(|e| e.to_string())?;
    vacuum(conn)?;
    Ok(n as u64)
}

#[tauri::command(async)]
fn clear_old_items(app: AppHandle, days: u32) -> Result<u64, String> {
    let cutoff = now_ms() - i64::from(days) * 86_400_000;
    let n = with_conn(&app, |c| clear_older_than(c, cutoff))?;
    let _ = app.emit("clip-changed", ());
    Ok(n)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
                // Um 2º launch com "--hidden" é o logon batendo num app que já
                // está vivo: não estoura a janela na cara do usuário.
                if !args.iter().any(|a| a == "--hidden") {
                    open_main(app);
                }
            }))
            // Autostart: quando ligado, o app entra no logon com "--hidden" pra
            // abrir direto na bandeja (segundo plano), capturando o clipboard
            // sem estourar a janela.
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                Some(vec!["--hidden"]),
            ))
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
        .plugin(tauri_plugin_opener::init())
        .manage(Db(Mutex::new(None)))
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = open_db(&dir.join("localclip.db")).map_err(std::io::Error::other)?;
            *app.state::<Db>().0.lock().unwrap() = Some(conn);

            // Bandeja: sempre presente. Clique esquerdo alterna mostrar/esconder;
            // menu com "Mostrar/Ocultar" e "Sair" ("Sair" SEMPRE fecha de verdade).
            let show = MenuItem::with_id(app, "toggle", "Mostrar/Ocultar", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let _tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("LocalClip")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => toggle_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_main(tray.app_handle());
                    }
                })
                .build(app)?;

            // "Fechar minimiza pra bandeja" (opt-in em Configurações, default
            // desligado): CloseRequested vira hide em vez de sair.
            if let Some(win) = app.get_webview_window("main") {
                let w = win.clone();
                let handle = app.handle().clone();
                win.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        let to_tray = with_conn(&handle, |c| {
                            Ok(setting_bool_opt(c, "closeToTray").unwrap_or(false))
                        })
                        .unwrap_or(false);
                        if to_tray {
                            api.prevent_close();
                            let _ = w.hide();
                        }
                    }
                });
            }

            // Reimpõe o autostart conforme a intenção guardada (conserta entrada
            // apagada ou apontando pro caminho antigo). Fora da thread principal:
            // mexe no registro e não deve segurar a abertura da janela.
            let auto_handle = app.handle().clone();
            std::thread::spawn(move || reconcile_autostart(&auto_handle));

            // Início no logon com "--hidden": se "fechar minimiza pra bandeja"
            // está ligado, esconde a janela e fica só na bandeja capturando o
            // clipboard. Com a opção desligada, a janela abre normal (senão o
            // usuário fecharia no X e o app morreria escondido sem servir).
            if std::env::args().any(|a| a == "--hidden") {
                let hide = with_conn(app.handle(), |c| {
                    Ok(setting_bool_opt(c, "closeToTray").unwrap_or(false))
                })
                .unwrap_or(false);
                if hide {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.hide();
                    }
                }
            }

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
            copy_text,
            delete_item,
            toggle_pin,
            clear_all,
            get_retention,
            set_retention,
            autostart_get,
            autostart_set,
            close_to_tray_get,
            close_to_tray_set,
            storage_info,
            clear_images_cmd,
            clear_old_items,
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

    // ---------- dados e armazenamento ----------
    //
    // A regra que estes testes existem pra defender: NENHUMA limpeza do painel
    // encosta em item fixado. Não basta conferir que o que era pra sumir sumiu —
    // o que importa é quem FICOU.

    /// Banco com os 4 casos que se cruzam: texto/imagem × fixado/solto.
    fn conn_com_mistura() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE items (
               id INTEGER PRIMARY KEY, kind TEXT NOT NULL, content TEXT, image BLOB,
               hash TEXT NOT NULL UNIQUE, pinned INTEGER NOT NULL DEFAULT 0,
               created_ms INTEGER NOT NULL);",
        )
        .unwrap();
        let agora = now_ms();
        let antigo = agora - 30 * 86_400_000; // 30 dias atrás
        let linhas: [(&str, Option<&str>, Option<&[u8]>, i64, i64); 6] = [
            ("text", Some("texto solto novo"), None, 0, agora),
            ("text", Some("texto FIXADO novo"), None, 1, agora),
            ("text", Some("texto solto ANTIGO"), None, 0, antigo),
            ("text", Some("texto FIXADO antigo"), None, 1, antigo),
            ("image", None, Some(&[1, 2, 3, 4][..]), 0, agora),
            ("image", None, Some(&[5, 6, 7, 8, 9][..]), 1, agora),
        ];
        for (i, (kind, content, image, pinned, created)) in linhas.iter().enumerate() {
            conn.execute(
                "INSERT INTO items (kind, content, image, hash, pinned, created_ms)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![kind, content, image, format!("h{i}"), pinned, created],
            )
            .unwrap();
        }
        conn
    }

    fn textos(conn: &Connection) -> Vec<String> {
        let mut st = conn.prepare("SELECT COALESCE(content, kind) FROM items ORDER BY id").unwrap();
        let v: Vec<String> = st.query_map([], |r| r.get(0)).unwrap().map(|r| r.unwrap()).collect();
        v
    }

    #[test]
    fn contagens_batem_com_o_conteudo() {
        let conn = conn_com_mistura();
        let c = storage_counts(&conn).unwrap();
        assert_eq!(c.items, 6);
        assert_eq!(c.pinned, 3);
        assert_eq!(c.images, 2);
        // 4 + 5 bytes de PNG — é este número que explica um banco gordo.
        assert_eq!(c.image_bytes, 9);
    }

    #[test]
    fn contagens_em_banco_vazio_sao_zero_e_nao_erro() {
        // COALESCE: SUM de tabela vazia devolve NULL, que estouraria no get().
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE items (
               id INTEGER PRIMARY KEY, kind TEXT NOT NULL, content TEXT, image BLOB,
               hash TEXT NOT NULL UNIQUE, pinned INTEGER NOT NULL DEFAULT 0,
               created_ms INTEGER NOT NULL);",
        )
        .unwrap();
        let c = storage_counts(&conn).unwrap();
        assert_eq!((c.items, c.pinned, c.images, c.image_bytes), (0, 0, 0, 0));
    }

    #[test]
    fn limpar_imagens_preserva_todo_texto_e_a_imagem_fixada() {
        let conn = conn_com_mistura();
        let n = clear_images(&conn).unwrap();
        assert_eq!(n, 1, "só a imagem SOLTA sai");

        let ficaram = textos(&conn);
        assert_eq!(ficaram.len(), 5);
        // Nenhum texto foi tocado — nem o solto.
        assert!(ficaram.contains(&"texto solto novo".to_string()));
        assert!(ficaram.contains(&"texto FIXADO novo".to_string()));
        assert!(ficaram.contains(&"texto solto ANTIGO".to_string()));
        assert!(ficaram.contains(&"texto FIXADO antigo".to_string()));
        // A imagem fixada sobreviveu.
        let c = storage_counts(&conn).unwrap();
        assert_eq!(c.images, 1);
        assert_eq!(c.image_bytes, 5, "sobrou exatamente o PNG que estava fixado");
    }

    #[test]
    fn limpar_antigos_preserva_os_fixados_por_mais_velhos_que_sejam() {
        let conn = conn_com_mistura();
        let cutoff = now_ms() - 7 * 86_400_000; // "mais de 7 dias"
        let n = clear_older_than(&conn, cutoff).unwrap();
        assert_eq!(n, 1, "só o texto solto e antigo sai");

        let ficaram = textos(&conn);
        // ESTE é o ponto: antigo E fixado continua aqui.
        assert!(
            ficaram.contains(&"texto FIXADO antigo".to_string()),
            "item fixado nunca pode ser apagado por idade"
        );
        assert!(!ficaram.contains(&"texto solto ANTIGO".to_string()));
        assert_eq!(ficaram.len(), 5);
    }

    #[test]
    fn limpar_tudo_deixa_exatamente_os_fixados() {
        let conn = conn_com_mistura();
        conn.execute("DELETE FROM items WHERE pinned = 0", []).unwrap();
        let c = storage_counts(&conn).unwrap();
        assert_eq!(c.items, 3);
        assert_eq!(c.pinned, 3, "o que sobrou é exatamente o conjunto dos fixados");
    }

    #[test]
    fn limpezas_sao_idempotentes() {
        // Apertar duas vezes não pode explodir nem apagar mais nada.
        let conn = conn_com_mistura();
        assert_eq!(clear_images(&conn).unwrap(), 1);
        assert_eq!(clear_images(&conn).unwrap(), 0);
        let cutoff = now_ms() - 7 * 86_400_000;
        assert_eq!(clear_older_than(&conn, cutoff).unwrap(), 1);
        assert_eq!(clear_older_than(&conn, cutoff).unwrap(), 0);
        assert_eq!(storage_counts(&conn).unwrap().pinned, 3);
    }
}
