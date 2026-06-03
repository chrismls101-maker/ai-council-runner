/** User explicitly wants markdown output. */
export function promptRequestsMarkdown(prompt: string): boolean {
  return /\b(in markdown|as markdown|markdown format|\.md\b|code block)\b/i.test(prompt);
}

/** Strip decorative markdown noise for artifact display. */
export function cleanArtifactText(text: string, options?: { preserveCodeBlocks?: boolean }): string {
  if (!text?.trim()) return "";

  let out = text.trim();
  const blocks: string[] = [];

  if (options?.preserveCodeBlocks) {
    out = out.replace(/```[\s\S]*?```/g, (m) => {
      blocks.push(m);
      return `\u0000CODE${blocks.length - 1}\u0000`;
    });
  }

  out = out
    .replace(/^#{1,6}\s*\*{0,2}([^*\n]+)\*{0,2}\s*$/gm, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^Final Action Plan\s*$/gim, "")
    .replace(/^Objective\s*$/gim, "")
    .replace(/^Recommended Action\s*$/gim, "")
    .replace(/^Decision Quality\s*$/gim, "")
    .replace(/^Risk Flags\s*$/gim, "")
    .replace(/^Do This First\s*$/gim, "")
    .replace(/^Do This Next\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (options?.preserveCodeBlocks) {
    out = out.replace(/\u0000CODE(\d+)\u0000/g, (_, i) => blocks[Number(i)] ?? "");
  }

  return out;
}

export function cleanSectionLabel(label: string): string {
  return cleanArtifactText(label).replace(/:$/, "").trim();
}
