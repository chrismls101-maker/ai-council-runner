/**
 * Voice → Glass Coder intent detection (pure, no Electron).
 */

const CODER_PATTERNS: RegExp[] = [
  /^fix (the |this |that )?(error|bug|issue|problem|crash)/i,
  /^refactor (this|that|the)/i,
  /^add (error handling|types|tests|comments|logging)/i,
  /^(extract|move|rename) (this|the|that)/i,
  /^make (this|that|the) (function|component|class|file)/i,
  /^(clean up|simplify|optimize) (this|the|that)/i,
  /^(delete|remove) (this|the|that)/i,
  /glass coder[,:]? /i,
];

export function isCoderIntent(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return CODER_PATTERNS.some((pattern) => pattern.test(trimmed));
}
