/** Command-bar / voice ask timeout before showing a fallback error card. */
export const GLASS_ASK_TIMEOUT_MS = 45_000;

export const VOICE_ASK_STATUS = {
  listening: "Listening…",
  transcribing: "Transcribing…",
  looking: "Looking…",
  thinking: "IIVO is thinking…",
  timeout: "This is taking longer than expected. You can cancel and try again.",
} as const;

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
