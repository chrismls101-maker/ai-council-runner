/** Relative time label for dashboard session rows. */
export function formatRelativeTime(ms: number, now = Date.now()): string {
  const delta = Math.max(0, now - ms);
  const sec = Math.floor(delta / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return min === 1 ? "1 minute ago" : `${min} minutes ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr === 1 ? "1 hour ago" : `${hr} hours ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return day === 1 ? "1 day ago" : `${day} days ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return month === 1 ? "1 month ago" : `${month} months ago`;
  const year = Math.floor(day / 365);
  return year === 1 ? "1 year ago" : `${year} years ago`;
}
