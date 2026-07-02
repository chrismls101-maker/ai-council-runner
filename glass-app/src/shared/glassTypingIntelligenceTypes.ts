export type TypingIntelligenceInputType = "ai_prompt" | "email" | "message" | "general";

export type TypingIntelligenceState = {
  active: boolean;
  currentFieldText: string;
  currentFieldBounds: { x: number; y: number; width: number; height: number } | null;
  rewrite: string | null;
  appContext: string | null;
  status: "idle" | "watching" | "rewriting" | "showing";
  /** Words in the field text being watched or rewritten. */
  sourceWordCount: number;
  /** Words in the rewrite suggestion (0 until showing). */
  rewriteWordCount: number;
};

export function detectTypingIntelligenceInputType(
  appName: string,
  text: string,
): TypingIntelligenceInputType {
  const app = appName.trim();
  if (/claude|chatgpt|perplexity/i.test(app)) return "ai_prompt";
  if (/^mail$|mimestream/i.test(app)) return "email";
  if (text.includes("@")) return "email";
  if (/^slack$|discord|messages/i.test(app)) return "message";
  return "general";
}

export function countTypingIntelligenceWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function formatTypingIntelligenceWordCount(source: number, rewrite?: number | null): string {
  if (rewrite != null && rewrite > 0) {
    return `${source} → ${rewrite} words`;
  }
  return source === 1 ? "1 word" : `${source} words`;
}
