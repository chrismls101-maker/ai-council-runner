/** Minimum time the thinking overlay card stays visible before a response replaces it. */
export const THINKING_CARD_MIN_MS = 300;

export async function waitForMinThinkingDuration(startedAtMs: number): Promise<void> {
  const remaining = THINKING_CARD_MIN_MS - (Date.now() - startedAtMs);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}
