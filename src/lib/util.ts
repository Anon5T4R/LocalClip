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
