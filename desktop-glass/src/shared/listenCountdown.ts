/** Seconds shown on-screen before listening capture begins. */
export const LISTEN_START_COUNTDOWN_SECONDS = 10;

/** Skip countdown in fast Playwright E2E; keep it for live QA and normal use. */
export function shouldSkipListenCountdown(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.IIVO_GLASS_E2E === "1" && env.IIVO_GLASS_LIVE_E2E !== "1";
}
