/** Normalize curly/smart quotes and apostrophes for routing heuristics. */
export function normalizePromptForRouting(text: string): string {
  return text
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/\u00A0/g, " ");
}
