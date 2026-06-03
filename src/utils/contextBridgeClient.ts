import {
  MAX_ATTACHED_CONTEXT_ITEMS,
  MAX_CONTEXT_ITEM_CHARS,
  MAX_EXTERNAL_CONTEXT_CHARS,
  type AttachedContextItem,
} from "../types/contextBridge";

export function computeAttachmentTruncationHints(
  items: AttachedContextItem[],
): AttachedContextItem[] {
  if (items.length === 0) return items;

  const capped = items.slice(0, MAX_ATTACHED_CONTEXT_ITEMS);
  let remaining = MAX_EXTERNAL_CONTEXT_CHARS;
  const slots = capped.length;

  return capped.map((item, index) => {
    const slotsLeft = slots - index;
    const perItemBudget = Math.min(
      MAX_CONTEXT_ITEM_CHARS,
      Math.max(200, Math.floor(remaining / slotsLeft)),
    );
    const willTruncate =
      item.contentText.length > perItemBudget ||
      item.contentText.length > MAX_CONTEXT_ITEM_CHARS;
    remaining -= Math.min(item.contentText.length, perItemBudget);
    return { ...item, willTruncate };
  });
}

export function wouldRunTruncateContext(items: AttachedContextItem[]): boolean {
  return computeAttachmentTruncationHints(items).some((item) => item.willTruncate);
}

export function totalAttachedContextChars(items: AttachedContextItem[]): number {
  return items.reduce((sum, item) => sum + item.contentText.length, 0);
}
