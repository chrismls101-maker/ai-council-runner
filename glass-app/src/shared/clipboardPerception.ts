/**
 * Clipboard perception limits — shared between main loop and ask context.
 */

/** Raw clipboard reads above this are truncated for state + synthesis. */
export const CLIPBOARD_PERCEPTION_MAX_LEN = 10_000;

/** Max chars stored in GlassState and injected into ask context. */
export const CLIPBOARD_CONTEXT_SNIPPET_LEN = 500;

export interface ClipboardCaptureResult {
  text: string | undefined;
  truncated: boolean;
}

/**
 * Normalize clipboard text for passive observation.
 * Empty input clears capture; oversized input keeps a bounded snippet.
 */
export function normalizeClipboardCapture(raw: string): ClipboardCaptureResult {
  const clip = raw.trim();
  if (!clip) {
    return { text: undefined, truncated: false };
  }
  if (clip.length >= CLIPBOARD_PERCEPTION_MAX_LEN) {
    return {
      text: clip.slice(0, CLIPBOARD_CONTEXT_SNIPPET_LEN),
      truncated: true,
    };
  }
  return { text: clip, truncated: false };
}
