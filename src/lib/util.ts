/** Data relativa curta (rótulos vêm traduzidos do caller — testável puro). */
export function formatWhen(
  ms: number,
  localeTag: string,
  labels: { now: string; min: string; hour: string },
): string {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return labels.now;
  if (min < 60) return labels.min.split("{n}").join(String(min));
  const h = Math.floor(min / 60);
  if (h < 24) return labels.hour.split("{n}").join(String(h));
  return new Intl.DateTimeFormat(localeTag, { dateStyle: "short" }).format(new Date(ms));
}

/** Preview de 1 linha pro item de texto (comprime espaços, corta). */
export function textPreview(text: string, max = 200): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

/**
 * Tamanho legível. Base 1024 com rótulo KB/MB/GB porque é o que o Explorer do
 * Windows mostra — bater com o número que o usuário vê na pasta importa mais
 * aqui do que a pureza do KiB.
 */
export function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  // Uma casa decimal só a partir de MB: "1,5 KB" é ruído, "1,5 GB" informa.
  return `${i >= 2 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}
