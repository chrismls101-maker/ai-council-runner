/**
 * IIVO Glass — Voice Mode ↔ transcription bridge (renderer singleton).
 *
 * When Voice Mode is active it OWNS submission so it can route the finished
 * transcript (direct / visual / debrief). The existing mic auto-send-after-
 * silence path defers to this handler instead of issuing its own
 * `submit-command`, which prevents a double submit and lets "I'm done" reach the
 * debrief route.
 *
 * No state is persisted; this is purely an in-process handoff.
 */

type AutoSubmitHandler = (draftText: string) => boolean;

let handler: AutoSubmitHandler | null = null;

/** Register Voice Mode's auto-submit handler (called on START). */
export function setVoiceModeAutoSubmit(fn: AutoSubmitHandler): void {
  handler = fn;
}

/** Clear the handler (called on STOP_EVERYTHING / unmount). */
export function clearVoiceModeAutoSubmit(): void {
  handler = null;
}

/** True while Voice Mode owns submission. */
export function isVoiceModeActive(): boolean {
  return handler != null;
}

/**
 * Hand a finalized mic draft to Voice Mode. Returns true when Voice Mode
 * consumed it (caller must not also submit). Returns false when Voice Mode is
 * inactive so the legacy path proceeds.
 */
export function voiceModeHandleAutoSubmit(draftText: string): boolean {
  if (!handler) return false;
  if (!draftText.trim()) return false;
  return handler(draftText);
}
