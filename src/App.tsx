import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import SettingsModal from "./components/SettingsModal";
import Toasts from "./components/Toasts";
import { localeTag, t } from "./lib/i18n";
import { formatWhen, textPreview } from "./lib/util";
import { useUi } from "./state/ui";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

interface ItemRow {
  id: number;
  kind: "text" | "image";
  content: string;
  pinned: boolean;
  createdMs: number;
}

export default function App() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ItemRow[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);
  const pushToast = useUi((s) => s.pushToast);

  const reload = async (q: string) => {
    if (!isTauri) return;
    try {
      setItems(await invoke<ItemRow[]>("list_items", { query: q }));
    } catch {
      /* banco iniciando */
    }
  };

  useEffect(() => {
    void reload(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Item novo capturado → recarrega; atalho global → foca a busca.
  useEffect(() => {
    if (!isTauri) return;
    const un1 = listen("clip-changed", () => void reload(query));
    const un2 = listen("focus-search", () => {
      searchRef.current?.focus();
      searchRef.current?.select();
    });
    return () => {
      for (const un of [un1, un2]) void un.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const copy = async (item: ItemRow) => {
    try {
      await invoke("copy_item", { id: item.id });
      pushToast("ok", t("toast.copied"));
      await reload(query);
    } catch (e) {
      pushToast("error", t("toast.copyFailed", { error: String(e) }));
    }
  };

  const clearAll = async () => {
    if (!window.confirm(t("top.clearConfirm"))) return;
    await invoke("clear_all").catch(() => {});
    pushToast("info", t("toast.cleared"));
    await reload(query);
  };

  const labels = { now: t("time.now"), min: t("time.min"), hour: t("time.hour") };

  return (
    <div className="app">
      <div className="topbar">
        <input
          ref={searchRef}
          className="search"
          value={query}
          placeholder={t("top.search")}
          spellCheck={false}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQuery("");
          }}
        />
        <button title={t("top.clear")} onClick={() => void clearAll()}>
          🗑
        </button>
        <button title={t("top.settingsTitle")} onClick={() => setSettingsOpen(true)}>
          ⚙
        </button>
      </div>

      <div className="list">
        {items.length === 0 && (
          <div className="muted list-msg">{query ? t("list.noResults") : t("list.empty")}</div>
        )}
        {items.map((item) => (
          <div key={item.id} className={`clip-item ${item.pinned ? "pinned" : ""}`}>
            <button
              className="clip-body"
              title={t("item.copy")}
              onClick={() => void copy(item)}
            >
              {item.kind === "image" ? (
                <img className="clip-img" src={item.content} alt={t("item.image")} />
              ) : (
                <span className="clip-text">{textPreview(item.content)}</span>
              )}
              <span className="clip-when muted">
                {formatWhen(item.createdMs, localeTag(), labels)}
              </span>
            </button>
            <div className="clip-actions">
              <button
                className={item.pinned ? "active" : ""}
                title={item.pinned ? t("item.unpin") : t("item.pin")}
                onClick={() => {
                  void invoke("toggle_pin", { id: item.id }).then(() => reload(query));
                }}
              >
                {item.pinned ? "📌" : "📍"}
              </button>
              <button
                title={t("item.delete")}
                onClick={() => {
                  void invoke("delete_item", { id: item.id }).then(() => reload(query));
                }}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      <SettingsModal />
      <Toasts />
    </div>
  );
}
