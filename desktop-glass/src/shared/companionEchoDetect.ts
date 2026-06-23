/**
 * Glass Companion — echo suppression when mic picks up Aletheia's TTS.
 */

function tokenizeForEcho(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\bslash\b/g, "/")
    .replace(/[^\w\s/]/g, "")
    .replace(/\//g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function isLikelyEcho(incoming: string, lastSpoken: string): boolean {
  if (!lastSpoken.trim()) return false;
  const tokenize = tokenizeForEcho;
  const a = new Set(tokenize(incoming));
  const b = new Set(tokenize(lastSpoken));
  if (a.size === 0 || b.size === 0) return false;
  let overlap = 0;
  for (const t of a) {
    if (b.has(t)) overlap++;
  }
  return overlap / Math.max(a.size, b.size) > 0.6;
}
