/** Glass IDE — active editor context for voice + agent prompts. */

export interface GlassIdeEditorContext {
  relativePath: string | null;
  language: string | null;
  selectionStartLine: number;
  selectionEndLine: number;
  selectionStartColumn: number;
  selectionEndColumn: number;
  selectedText: string;
  cursorLine: number;
  cursorColumn: number;
  updatedAt: number;
}

export type GlassIdeEditorVoiceIntent =
  | { kind: "open_file"; query: string }
  | { kind: "explain_selection"; prompt: string }
  | { kind: "what_changed"; prompt: string }
  | { kind: "coder"; prompt: string };

const OPEN_FILE_PATTERNS: RegExp[] = [
  /^open (?:the |this )?(.+?) file$/i,
  /^open (?:file )?(.+)$/i,
  /^go to (?:the |this )?(.+?)(?: file)?$/i,
  /^show (?:me )?(?:the |this )?(.+?)(?: file)?$/i,
];

const EXPLAIN_PATTERNS: RegExp[] = [
  /^explain (?:this function|this code|this|that|the selection|what this does)/i,
  /^what does (?:this|that|it) do\??$/i,
  /^describe (?:this function|this code|this)/i,
];

const WHAT_CHANGED_PATTERNS: RegExp[] = [
  /^what changed here\??$/i,
  /^what did (?:you|we) change\??$/i,
  /^show (?:me )?what changed\??$/i,
  /^summarize (?:this |the )?change/i,
];

export function emptyGlassIdeEditorContext(): GlassIdeEditorContext {
  return {
    relativePath: null,
    language: null,
    selectionStartLine: 0,
    selectionEndLine: 0,
    selectionStartColumn: 0,
    selectionEndColumn: 0,
    selectedText: "",
    cursorLine: 0,
    cursorColumn: 0,
    updatedAt: 0,
  };
}

export function buildExplainSelectionPrompt(ctx: GlassIdeEditorContext): string {
  const file = ctx.relativePath ?? "the active file";
  const range = ctx.selectedText.trim()
    ? `lines ${ctx.selectionStartLine}–${ctx.selectionEndLine}`
    : `line ${ctx.cursorLine}`;
  const excerpt = ctx.selectedText.trim()
    ? `\n\nSelected code:\n\`\`\`\n${ctx.selectedText.trim()}\n\`\`\``
    : "";
  return `Explain the code at ${file} (${range}). Be concise and practical.${excerpt}`;
}

export function buildWhatChangedPrompt(ctx: GlassIdeEditorContext): string {
  const file = ctx.relativePath ?? "the active file";
  return `Summarize what changed in ${file} and why it matters. Focus on the diff at line ${ctx.cursorLine || 1}.`;
}

export function enrichPromptWithEditorContext(
  prompt: string,
  ctx: GlassIdeEditorContext | null | undefined,
): string {
  if (!ctx?.relativePath) return prompt;
  const bits = [`Active file: ${ctx.relativePath}`];
  if (ctx.selectedText.trim()) {
    bits.push(`Selection (L${ctx.selectionStartLine}–${ctx.selectionEndLine}):\n${ctx.selectedText.trim()}`);
  } else if (ctx.cursorLine > 0) {
    bits.push(`Cursor: line ${ctx.cursorLine}`);
  }
  return `${prompt.trim()}\n\n---\nGlass IDE context\n${bits.join("\n")}`;
}

export function matchGlassIdeEditorVoiceIntent(
  text: string,
  ctx: GlassIdeEditorContext | null | undefined,
): GlassIdeEditorVoiceIntent | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  for (const pattern of OPEN_FILE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      return { kind: "open_file", query: match[1].trim() };
    }
  }

  if (EXPLAIN_PATTERNS.some((p) => p.test(trimmed))) {
    return { kind: "explain_selection", prompt: buildExplainSelectionPrompt(ctx ?? emptyGlassIdeEditorContext()) };
  }

  if (WHAT_CHANGED_PATTERNS.some((p) => p.test(trimmed))) {
    return { kind: "what_changed", prompt: buildWhatChangedPrompt(ctx ?? emptyGlassIdeEditorContext()) };
  }

  return null;
}

/** Resolve a fuzzy file query against project relative paths. */
export function resolveGlassIdeFileQuery(
  query: string,
  relativePaths: string[],
): string | null {
  const q = query.trim().toLowerCase().replace(/\\/g, "/");
  if (!q) return null;

  const normalized = relativePaths.map((p) => p.replace(/\\/g, "/"));
  const exact = normalized.find((p) => p.toLowerCase() === q || p.toLowerCase().endsWith(`/${q}`));
  if (exact) return exact;

  const basename = q.split("/").pop() ?? q;
  const byBase = normalized.filter((p) => p.split("/").pop()?.toLowerCase() === basename);
  if (byBase.length === 1) return byBase[0];

  const partial = normalized.filter((p) => p.toLowerCase().includes(q));
  if (partial.length === 1) return partial[0];

  return null;
}
