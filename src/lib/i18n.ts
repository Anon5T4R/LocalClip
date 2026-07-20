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

  // Transformações: o histórico NÃO muda, só a cópia. O "hint" explica isso.
  "tf.hint": "Copiar transformado (o item guardado não muda)",
  "tf.upper": "MAIÚSCULAS",
  "tf.lower": "minúsculas",
  "tf.title": "Capitalizado",
  "tf.trim": "Remover espaços das pontas",
  "tf.joinLines": "Juntar linhas",
  "tf.squish": "Colapsar espaços",

  "toast.copied": "Copiado — Ctrl+V onde quiser",
  "toast.copyFailed": "Não consegui copiar: {error}",
  "toast.cleared": "Histórico limpo",

  "time.now": "agora",
  "time.min": "{n} min",
  "time.hour": "{n} h",

  "dlg.ok": "OK",
  "dlg.cancel": "Cancelar",
  "dlg.clear": "Limpar",
  "dlg.delete": "Apagar",
  "dlg.confirm": "Confirmar",

  // Dados e armazenamento
  "settings.storage": "Dados e armazenamento",
  "settings.storagePath": "Pasta de dados",
  "settings.storageOpen": "Abrir pasta",
  "settings.storageSize": "Tamanho do banco",
  "settings.storageCounts":
    "{n} itens ({pinned} fixados, {images} imagens ocupando {imgSize})",
  "settings.clearImages": "Apagar as imagens",
  "settings.clearImagesHint":
    "As imagens são o que engorda o histórico — cada print vira um PNG inteiro dentro do banco. Some só com as imagens NÃO fixadas: todo texto fica, e imagem fixada também.",
  "settings.clearImagesConfirm":
    "Apagar {n} imagens do histórico? Os textos ficam, e as imagens fixadas também.",
  "settings.deleteOld": "Apagar itens antigos",
  "settings.deleteOldHint":
    "Apaga itens mais velhos que o prazo escolhido. Itens fixados NUNCA são apagados, por mais antigos que sejam.",
  "settings.deleteOldConfirm":
    "Apagar os itens com mais de {days} dias? Os fixados ficam, mesmo os antigos.",
  "settings.days": "{n} dias",
  "toast.cleaned": "{n} itens apagados",
  "toast.storageFailed": "Falha: {error}",

  "settings.title": "Configurações",
  "settings.theme": "Tema",
  "settings.themeSystem": "Sistema",
  "settings.themeLight": "Claro",
  "settings.themeDark": "Escuro",
  "settings.themeNature": "Natureza",
  "settings.themeDarkBlue": "Azul escuro",
  "settings.themeCalmGreen": "Verde calmo",
  "settings.themePastelPink": "Rosa pastel",
  "settings.themePunkPrincess": "PunkPrincess",
  "settings.language": "Idioma",
  "settings.retention": "Itens no histórico",
  "settings.autostart": "Iniciar com o sistema",
  "settings.closeToTray": "Fechar minimiza pra bandeja",
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

  "tf.hint": "Copy transformed (the stored item stays as is)",
  "tf.upper": "UPPERCASE",
  "tf.lower": "lowercase",
  "tf.title": "Title Case",
  "tf.trim": "Trim surrounding spaces",
  "tf.joinLines": "Join lines",
  "tf.squish": "Collapse whitespace",

  "toast.copied": "Copied — Ctrl+V anywhere",
  "toast.copyFailed": "Couldn't copy: {error}",
  "toast.cleared": "History cleared",

  "time.now": "now",
  "time.min": "{n} min",
  "time.hour": "{n} h",

  "dlg.ok": "OK",
  "dlg.cancel": "Cancel",
  "dlg.clear": "Clear",
  "dlg.delete": "Delete",
  "dlg.confirm": "Confirm",

  "settings.storage": "Data & storage",
  "settings.storagePath": "Data folder",
  "settings.storageOpen": "Open folder",
  "settings.storageSize": "Database size",
  "settings.storageCounts": "{n} items ({pinned} pinned, {images} images taking {imgSize})",
  "settings.clearImages": "Delete the images",
  "settings.clearImagesHint":
    "Images are what makes the history heavy — every screenshot becomes a whole PNG inside the database. Only NON-pinned images go: all text stays, and pinned images stay too.",
  "settings.clearImagesConfirm":
    "Delete {n} images from the history? The texts stay, and so do the pinned images.",
  "settings.deleteOld": "Delete old items",
  "settings.deleteOldHint":
    "Deletes items older than the chosen period. Pinned items are NEVER deleted, however old they are.",
  "settings.deleteOldConfirm":
    "Delete items older than {days} days? Pinned ones stay, even the old ones.",
  "settings.days": "{n} days",
  "toast.cleaned": "{n} items deleted",
  "toast.storageFailed": "Failed: {error}",

  "settings.title": "Settings",
  "settings.theme": "Theme",
  "settings.themeSystem": "System",
  "settings.themeLight": "Light",
  "settings.themeDark": "Dark",
  "settings.themeNature": "Nature",
  "settings.themeDarkBlue": "Dark blue",
  "settings.themeCalmGreen": "Calm green",
  "settings.themePastelPink": "Pastel pink",
  "settings.themePunkPrincess": "PunkPrincess",
  "settings.language": "Language",
  "settings.retention": "Items in history",
  "settings.autostart": "Start with the system",
  "settings.closeToTray": "Closing minimizes to tray",
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

  "tf.hint": "Copiar transformado (el elemento guardado no cambia)",
  "tf.upper": "MAYÚSCULAS",
  "tf.lower": "minúsculas",
  "tf.title": "Capitalizado",
  "tf.trim": "Quitar espacios de los extremos",
  "tf.joinLines": "Unir líneas",
  "tf.squish": "Colapsar espacios",

  "toast.copied": "Copiado — Ctrl+V donde quieras",
  "toast.copyFailed": "No se pudo copiar: {error}",
  "toast.cleared": "Historial limpiado",

  "time.now": "ahora",
  "time.min": "{n} min",
  "time.hour": "{n} h",

  "dlg.ok": "OK",
  "dlg.cancel": "Cancelar",
  "dlg.clear": "Limpiar",
  "dlg.delete": "Eliminar",
  "dlg.confirm": "Confirmar",

  "settings.storage": "Datos y almacenamiento",
  "settings.storagePath": "Carpeta de datos",
  "settings.storageOpen": "Abrir carpeta",
  "settings.storageSize": "Tamaño de la base",
  "settings.storageCounts": "{n} elementos ({pinned} fijados, {images} imágenes ocupando {imgSize})",
  "settings.clearImages": "Eliminar las imágenes",
  "settings.clearImagesHint":
    "Las imágenes son lo que engorda el historial — cada captura se guarda como un PNG entero dentro de la base. Solo se van las imágenes NO fijadas: todo el texto se conserva, y las imágenes fijadas también.",
  "settings.clearImagesConfirm":
    "¿Eliminar {n} imágenes del historial? Los textos se conservan, y las imágenes fijadas también.",
  "settings.deleteOld": "Eliminar elementos antiguos",
  "settings.deleteOldHint":
    "Elimina elementos más viejos que el plazo elegido. Los elementos fijados NUNCA se eliminan, por antiguos que sean.",
  "settings.deleteOldConfirm":
    "¿Eliminar los elementos con más de {days} días? Los fijados se conservan, incluso los antiguos.",
  "settings.days": "{n} días",
  "toast.cleaned": "{n} elementos eliminados",
  "toast.storageFailed": "Error: {error}",

  "settings.title": "Configuración",
  "settings.theme": "Tema",
  "settings.themeSystem": "Sistema",
  "settings.themeLight": "Claro",
  "settings.themeDark": "Oscuro",
  "settings.themeNature": "Naturaleza",
  "settings.themeDarkBlue": "Azul oscuro",
  "settings.themeCalmGreen": "Verde tranquilo",
  "settings.themePastelPink": "Rosa pastel",
  "settings.themePunkPrincess": "PunkPrincess",
  "settings.language": "Idioma",
  "settings.retention": "Elementos en el historial",
  "settings.autostart": "Iniciar con el sistema",
  "settings.closeToTray": "Cerrar minimiza a la bandeja",
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
