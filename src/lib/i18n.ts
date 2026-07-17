import { useSyncExternalStore } from "react";

/** i18n leve da UI (padrão da suíte, ver docs/planos/padrao-apps.md). */

export type Locale = "pt" | "en" | "es";

export const LOCALE_LABELS: Record<Locale, string> = {
  pt: "Português",
  en: "English",
  es: "Español",
};

export const LOCALE_TAGS: Record<Locale, string> = {
  pt: "pt-BR",
  en: "en-US",
  es: "es",
};

const LOCALE_KEY = "localclip.locale";

const pt = {
  "top.search": "Buscar no histórico…",
  "filter.all": "Tudo",
  "filter.text": "Texto",
  "filter.image": "Imagens",
  "top.clear": "Limpar histórico",
  "top.clearConfirm": "Limpar o histórico? (fixados ficam)",
  "top.settingsTitle": "Configurações",

  "list.empty": "Nada copiado ainda — o histórico enche sozinho conforme você copia.",
  "list.noResults": "Nada encontrado.",
  "item.copy": "Copiar de novo (clique)",
  "item.pin": "Fixar",
  "item.unpin": "Desafixar",
  "item.delete": "Excluir",
  "item.image": "Imagem",

  "toast.copied": "Copiado — Ctrl+V onde quiser",
  "toast.copyFailed": "Não consegui copiar: {error}",
  "toast.cleared": "Histórico limpo",

  "time.now": "agora",
  "time.min": "{n} min",
  "time.hour": "{n} h",

  "dlg.ok": "OK",
  "dlg.cancel": "Cancelar",

  "settings.title": "Configurações",
  "settings.theme": "Tema",
  "settings.themeSystem": "Sistema",
  "settings.themeLight": "Claro",
  "settings.themeDark": "Escuro",
  "settings.language": "Idioma",
  "settings.retention": "Itens no histórico",
  "settings.privacy":
    "Privacidade: tudo fica NESTA máquina (SQLite local, retenção de 500 itens; fixados não expiram). Conteúdo marcado como sensível (LocalKeys e gerenciadores de senha usam a flag ExcludeClipboardContentFromMonitorProcessing) NÃO é capturado.",
  "settings.shortcut": "Atalho global: Ctrl+Shift+V mostra/esconde o popup.",
  "settings.about":
    " — histórico de área de transferência 100% local: texto e imagem, busca, fixados, re-copiar com um clique. Parte da suíte Local.",
} as const;

export type MessageKey = keyof typeof pt;

const en: Record<MessageKey, string> = {
  "top.search": "Search history…",
  "filter.all": "All",
  "filter.text": "Text",
  "filter.image": "Images",
  "top.clear": "Clear history",
  "top.clearConfirm": "Clear the history? (pinned items stay)",
  "top.settingsTitle": "Settings",

  "list.empty": "Nothing copied yet — the history fills up as you copy.",
  "list.noResults": "Nothing found.",
  "item.copy": "Copy again (click)",
  "item.pin": "Pin",
  "item.unpin": "Unpin",
  "item.delete": "Delete",
  "item.image": "Image",

  "toast.copied": "Copied — Ctrl+V anywhere",
  "toast.copyFailed": "Couldn't copy: {error}",
  "toast.cleared": "History cleared",

  "time.now": "now",
  "time.min": "{n} min",
  "time.hour": "{n} h",

  "dlg.ok": "OK",
  "dlg.cancel": "Cancel",

  "settings.title": "Settings",
  "settings.theme": "Theme",
  "settings.themeSystem": "System",
  "settings.themeLight": "Light",
  "settings.themeDark": "Dark",
  "settings.language": "Language",
  "settings.retention": "Items in history",
  "settings.privacy":
    "Privacy: everything stays on THIS machine (local SQLite, 500-item retention; pinned items never expire). Content flagged as sensitive (LocalKeys and password managers use the ExcludeClipboardContentFromMonitorProcessing flag) is NOT captured.",
  "settings.shortcut": "Global shortcut: Ctrl+Shift+V shows/hides the popup.",
  "settings.about":
    " — 100% local clipboard history: text and images, search, pinned items, one-click re-copy. Part of the Local suite.",
};

const es: Record<MessageKey, string> = {
  "top.search": "Buscar en el historial…",
  "filter.all": "Todo",
  "filter.text": "Texto",
  "filter.image": "Imágenes",
  "top.clear": "Limpiar historial",
  "top.clearConfirm": "¿Limpiar el historial? (los fijados se quedan)",
  "top.settingsTitle": "Configuración",

  "list.empty": "Nada copiado todavía — el historial se llena mientras copias.",
  "list.noResults": "No se encontró nada.",
  "item.copy": "Copiar de nuevo (clic)",
  "item.pin": "Fijar",
  "item.unpin": "Desfijar",
  "item.delete": "Eliminar",
  "item.image": "Imagen",

  "toast.copied": "Copiado — Ctrl+V donde quieras",
  "toast.copyFailed": "No se pudo copiar: {error}",
  "toast.cleared": "Historial limpiado",

  "time.now": "ahora",
  "time.min": "{n} min",
  "time.hour": "{n} h",

  "dlg.ok": "OK",
  "dlg.cancel": "Cancelar",

  "settings.title": "Configuración",
  "settings.theme": "Tema",
  "settings.themeSystem": "Sistema",
  "settings.themeLight": "Claro",
  "settings.themeDark": "Oscuro",
  "settings.language": "Idioma",
  "settings.retention": "Elementos en el historial",
  "settings.privacy":
    "Privacidad: todo se queda en ESTA máquina (SQLite local, retención de 500 elementos; los fijados no caducan). El contenido marcado como sensible (LocalKeys y los gestores de contraseñas usan la bandera ExcludeClipboardContentFromMonitorProcessing) NO se captura.",
  "settings.shortcut": "Atajo global: Ctrl+Shift+V muestra/oculta el popup.",
  "settings.about":
    " — historial de portapapeles 100% local: texto e imágenes, búsqueda, fijados, recopiar con un clic. Parte de la suite Local.",
};

const DICTS: Record<Locale, Record<MessageKey, string>> = { pt, en, es };

export function detectLocale(): Locale {
  const l = (typeof navigator !== "undefined" ? navigator.language : "pt").toLowerCase();
  if (l.startsWith("en")) return "en";
  if (l.startsWith("es")) return "es";
  return "pt";
}

function loadLocale(): Locale {
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(LOCALE_KEY) : null;
  return v === "pt" || v === "en" || v === "es" ? v : detectLocale();
}

let current: Locale = loadLocale();
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}

export function localeTag(): string {
  return LOCALE_TAGS[current];
}

export function setLocale(locale: Locale) {
  if (locale === current) return;
  current = locale;
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    /* localStorage indisponível */
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale);
}

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let msg: string = DICTS[current][key] ?? pt[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      msg = msg.split(`{${k}}`).join(String(v));
    }
  }
  return msg;
}
