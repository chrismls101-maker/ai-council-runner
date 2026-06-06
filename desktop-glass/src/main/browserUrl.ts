/**
 * Read the active browser tab URL on macOS (Chrome, Safari, Arc, Brave, Edge).
 * Used for media context — not facial recognition.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BROWSER_SCRIPTS: Record<string, string> = {
  "Google Chrome":
    'tell application "Google Chrome" to get URL of active tab of front window',
  Arc: 'tell application "Arc" to get URL of active tab of front window',
  Brave: 'tell application "Brave Browser" to get URL of active tab of front window',
  "Microsoft Edge":
    'tell application "Microsoft Edge" to get URL of active tab of front window',
  Safari: 'tell application "Safari" to get URL of current tab of front window',
};

/** Returns URL of the frontmost browser tab when app is a supported browser. */
export async function getActiveBrowserUrl(appName?: string): Promise<string | undefined> {
  if (process.platform !== "darwin" || !appName?.trim()) return undefined;
  const script = BROWSER_SCRIPTS[appName.trim()];
  if (!script) return undefined;
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script]);
    const url = stdout.trim();
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
  } catch {
    /* browser not running or automation denied */
  }
  return undefined;
}
