/**
 * Plain-text formatting for overlay cards (no raw markdown tokens in UI).
 */

/** Strip markdown heading markers and normalize list bullets for <pre> display. */
export function formatOverlayPlainText(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => {
      const heading = line.match(/^#{1,6}\s+(.*)$/);
      if (heading) return heading[1]!.trim();
      return line.replace(/^[-*]\s+/, "• ");
    })
    .join("\n")
    .trim();
}
