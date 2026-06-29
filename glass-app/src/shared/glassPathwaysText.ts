const PLACEHOLDER_ARRAY_ITEMS = new Set([
  "item 1",
  "item 2",
  "item 3",
  "item 4",
  "mistake 1",
  "mistake 2",
  "done when…",
  "done when...",
  "concrete action 1",
  "how aletheia can help",
  "review item",
]);

/** Strip obvious placeholder strings from model-generated arrays. */
export function sanitizeGuidanceArray(items: string[]): string[] {
  return items.filter((item) => !PLACEHOLDER_ARRAY_ITEMS.has(item.trim().toLowerCase()));
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}
