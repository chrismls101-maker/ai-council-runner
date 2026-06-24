const MAX_SUGGESTION_CHARS = 120;

/** Strip fences / newlines — ghost text is single-line suffix only. */
export function parseGhostSuggestion(raw: string, linePrefix: string): string {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```\w*\n?/, "").replace(/\n?```$/, "").trim();
  }
  const firstLine = text.split(/\r?\n/)[0]?.trim() ?? "";
  if (!firstLine) return "";

  if (linePrefix.trim() && firstLine.startsWith(linePrefix)) {
    return firstLine.slice(linePrefix.length).slice(0, MAX_SUGGESTION_CHARS);
  }
  if (firstLine.length <= MAX_SUGGESTION_CHARS) return firstLine;
  return firstLine.slice(0, MAX_SUGGESTION_CHARS);
}
