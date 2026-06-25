/** Command-bar / voice ask timeout before showing a fallback error card. */
export const GLASS_ASK_TIMEOUT_MS = 45_000;

/** Optional dev override: IIVO_GLASS_ASK_TIMEOUT_MS=1000 */
export function resolveGlassAskTimeoutMs(): number {
  const raw = process.env.IIVO_GLASS_ASK_TIMEOUT_MS?.trim();
  if (!raw) return GLASS_ASK_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1_000) return GLASS_ASK_TIMEOUT_MS;
  return parsed;
}

/** After this long with no answer, escalate the thinking copy to "Still working…". */
export const GLASS_ASK_STILL_WORKING_MS = 6_000;

export const VOICE_ASK_STATUS = {
  listening: "Listening…",
  transcribing: "Transcribing…",
  looking: "Looking…",
  thinking: "IIVO is thinking…",
  stillWorking: "Still working…",
  timeout: "This is taking longer than expected. You can cancel and try again.",
} as const;

export type GlassAskPhase = "thinking" | "looking";

/**
 * Resolve the status label to show while an ask is in flight, escalating from
 * the phase label → "Still working…" → timeout copy as time passes. Keeps Voice
 * Mode from feeling dead during 3–13s waits even without token streaming.
 */
export function voiceAskStatusForElapsed(
  elapsedMs: number,
  phase: GlassAskPhase = "thinking",
): string {
  if (elapsedMs >= resolveGlassAskTimeoutMs()) return VOICE_ASK_STATUS.timeout;
  if (elapsedMs >= GLASS_ASK_STILL_WORKING_MS) return VOICE_ASK_STATUS.stillWorking;
  return phase === "looking" ? VOICE_ASK_STATUS.looking : VOICE_ASK_STATUS.thinking;
}

/**
 * Extract the first sentence of an answer for an early preview as soon as the
 * leading text is available (bridge for not-yet-streaming responses).
 */
export function firstSentencePreview(text: string, maxLen = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const match = clean.match(/^.*?[.!?](\s|$)/);
  const sentence = (match ? match[0] : clean).trim();
  if (sentence.length <= maxLen) return sentence;
  return `${sentence.slice(0, maxLen).trim()}…`;
}

/** Minimum time the thinking overlay card stays visible before the answer replaces it. */
export const THINKING_CARD_MIN_MS = 300;

/** Minimum time the looking overlay card stays visible before thinking replaces it. */
export const LOOKING_CARD_MIN_MS = 300;

export async function waitForMinThinkingDuration(startedAtMs: number): Promise<void> {
  const remaining = THINKING_CARD_MIN_MS - (Date.now() - startedAtMs);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

export async function waitForMinLookingDuration(startedAtMs: number): Promise<void> {
  const remaining = LOOKING_CARD_MIN_MS - (Date.now() - startedAtMs);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}
