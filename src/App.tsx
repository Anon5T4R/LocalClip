import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
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

type TypeFilter = "all" | "text" | "image";

export default function App() {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [items, setItems] = useState<ItemRow[]>([]);
  const [sel, setSel] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
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

  const shown = useMemo(
    () => (typeFilter === "all" ? items : items.filter((i) => i.kind === typeFilter)),
    [items, typeFilter],
  );
  const selClamped = Math.min(sel, Math.max(0, shown.length - 1));

  const copy = async (item: ItemRow) => {
    try {
      await invoke("copy_item", { id: item.id });
      await reload(query);
      // Esconde a janela: devolve o foco pro app anterior (é só apertar Ctrl+V).
      if (isTauri) void getCurrentWindow().hide().catch(() => {});
    } catch (e) {
      pushToast("error", t("toast.copyFailed", { error: String(e) }));
    }
  };

  const remove = (id: number) => void invoke("delete_item", { id }).then(() => reload(query));

  const clearAll = async () => {
    if (!window.confirm(t("top.clearConfirm"))) return;
    await invoke("clear_all").catch(() => {});
    pushToast("info", t("toast.cleared"));
    await reload(query);
  };

  // Navegação por teclado: ↑/↓ mover, Enter copiar (e esconder), Del apagar,
  // Esc limpa a busca ou esconde a janela.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inSearch = document.activeElement === searchRef.current;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => Math.min(shown.length - 1, s + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => Math.max(0, s - 1));
      } else if (e.key === "Enter") {
        if (shown[selClamped]) void copy(shown[selClamped]);
      } else if (e.key === "Delete" && !inSearch) {
        if (shown[selClamped]) remove(shown[selClamped].id);
      } else if (e.key === "Escape") {
        if (query) setQuery("");
        else if (isTauri) void getCurrentWindow().hide().catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, selClamped, query]);

  // Rola a seleção pra dentro da vista.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${selClamped}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selClamped]);

  const labels = { now: t("time.now"), min: t("time.min"), hour: t("time.hour") };

  const typeBtn = (kind: TypeFilter, label: string) => (
    <button
      className={`chip ${typeFilter === kind ? "active" : ""}`}
      onClick={() => setTypeFilter(kind)}
    >
      {label}
    </button>
  );

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
        />
        <button title={t("top.clear")} onClick={() => void clearAll()}>
          🗑
        </button>
        <button title={t("top.settingsTitle")} onClick={() => setSettingsOpen(true)}>
          ⚙
        </button>
      </div>

      <div className="filter-row">
        {typeBtn("all", t("filter.all"))}
        {typeBtn("text", t("filter.text"))}
        {typeBtn("image", t("filter.image"))}
      </div>

      <div className="list" ref={listRef}>
        {shown.length === 0 && (
          <div className="muted list-msg">{query ? t("list.noResults") : t("list.empty")}</div>
        )}
        {shown.map((item, i) => (
          <div
            key={item.id}
            data-idx={i}
            className={`clip-item ${item.pinned ? "pinned" : ""} ${i === selClamped ? "selected" : ""}`}
          >
            <button
              className="clip-body"
              title={t("item.copy")}
              onClick={() => {
                setSel(i);
                void copy(item);
              }}
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
              <button title={t("item.delete")} onClick={() => remove(item.id)}>
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
