export function formatRelativeTime(date: Date | string): string {
  const then = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(then.getTime())) return "";

  const diffSec = Math.round((then.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  const absSec = Math.abs(diffSec);
  if (absSec < 60) return rtf.format(diffSec, "second");

  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");

  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, "hour");

  const diffDay = Math.round(diffHr / 24);
  return rtf.format(diffDay, "day");
}

export function formatDatePretty(date: Date | string): string {
  const then = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(then.getTime())) return "";
  return then.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
