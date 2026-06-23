/**
 * OSC sequence helpers shared by the terminal panel.
 */

const OSC7_CWD_RE = /\x1b\]7;file:\/\/[^/]*([^\x07\x1b]*)(?:\x07|\x1b\\)/g;

/** Extract the last OSC 7 cwd report from a PTY chunk, if any. */
export function extractOsc7Cwd(data: string): string | null {
  OSC7_CWD_RE.lastIndex = 0;
  let last: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = OSC7_CWD_RE.exec(data)) !== null) {
    try {
      const path = decodeURIComponent(match[1]);
      if (path) last = path;
    } catch {
      /* malformed percent-encoding */
    }
  }
  return last;
}
