/** Countdown removed — listening starts immediately on request. */
export const LISTEN_START_COUNTDOWN_SECONDS = 0;

/** Always skip the pre-listen countdown overlay. */
export function shouldSkipListenCountdown(_env: NodeJS.ProcessEnv = process.env): boolean {
  return true;
}
