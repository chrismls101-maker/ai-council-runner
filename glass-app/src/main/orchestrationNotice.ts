/** Optional sink for brief user-facing orchestration status (wired from main index). */

let noticeSink: ((message: string) => void) | null = null;
let lastNoticeMessage = "";
let lastNoticeAt = 0;

const NOTICE_DEBOUNCE_MS = 60_000;

export function setOrchestrationNoticeSink(
  sink: ((message: string) => void) | null,
): void {
  noticeSink = sink;
}

export function emitOrchestrationNotice(message: string): void {
  const trimmed = message.trim();
  if (!trimmed || !noticeSink) return;
  const now = Date.now();
  if (trimmed === lastNoticeMessage && now - lastNoticeAt < NOTICE_DEBOUNCE_MS) {
    return;
  }
  lastNoticeMessage = trimmed;
  lastNoticeAt = now;
  noticeSink(trimmed);
}

/** Reset debounce state (tests). */
export function resetOrchestrationNoticeForTests(): void {
  lastNoticeMessage = "";
  lastNoticeAt = 0;
}
