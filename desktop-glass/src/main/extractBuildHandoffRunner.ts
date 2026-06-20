/**
 * Open Cursor / Claude / Glass with a master build prompt preloaded.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { clipboard, shell } from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  CLAUDE_DESKTOP_APP_PATHS,
  CLAUDE_DESKTOP_BUNDLE_ID,
  EXTRACT_BUILD_ACCESSIBILITY_HINT,
  EXTRACT_BUILD_APP_NAMES,
  EXTRACT_BUILD_CLAUDE_WEB_URL,
  extractBuildClaudeDesktopNotice,
  extractBuildClaudeWebNotice,
  extractBuildHandoffNotice,
  isExtractBuildTarget,
  type ExtractBuildTarget,
} from "../shared/extractBuildHandoff.ts";
import { prefillCommandBar } from "./windows.ts";

const execFileAsync = promisify(execFile);

const MAC_BROWSERS = [
  "Google Chrome",
  "Arc",
  "Brave Browser",
  "Microsoft Edge",
  "Safari",
] as const;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAccessibilityDenied(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /not authorized|assistive access|1002|-1743|-25211/i.test(msg);
}

function handoffError(err: unknown, fallback: string): string {
  if (isAccessibilityDenied(err)) return EXTRACT_BUILD_ACCESSIBILITY_HINT;
  return fallback;
}

export function isClaudeDesktopInstalled(): boolean {
  if (process.platform !== "darwin") return false;
  const home = os.homedir();
  return CLAUDE_DESKTOP_APP_PATHS.some((candidate) => {
    const resolved = candidate.startsWith("~/")
      ? path.join(home, candidate.slice(2))
      : candidate;
    return fs.existsSync(resolved);
  });
}

async function activateMacApp(appName: string): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  try {
    await execFileAsync("osascript", ["-e", `tell application "${appName}" to activate`]);
    return true;
  } catch {
    return false;
  }
}

async function launchClaudeDesktop(): Promise<boolean> {
  if (!isClaudeDesktopInstalled()) return false;
  try {
    await execFileAsync("open", ["-a", "Claude"]);
    return true;
  } catch {
    try {
      await execFileAsync("osascript", [
        "-e",
        `tell application id "${CLAUDE_DESKTOP_BUNDLE_ID}" to activate`,
      ]);
      return true;
    } catch {
      return false;
    }
  }
}

async function activateRunningBrowser(): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  const script = `
    set browserNames to {"Google Chrome", "Arc", "Brave Browser", "Microsoft Edge", "Safari"}
    repeat with bn in browserNames
      tell application "System Events"
        if exists process (bn as text) then
          tell application (bn as text) to activate
          return "ok"
        end if
      end tell
    end repeat
    return ""
  `;
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script]);
    return stdout.trim() === "ok";
  } catch {
    return false;
  }
}

async function pasteFromClipboard(): Promise<void> {
  await execFileAsync("osascript", [
    "-e",
    'tell application "System Events" to keystroke "v" using command down',
  ]);
}

async function pasteIntoClaudeDesktop(): Promise<void> {
  await execFileAsync("osascript", [
    "-e",
    `tell application "System Events" to tell process "${EXTRACT_BUILD_APP_NAMES.claude}" to keystroke "v" using command down`,
  ]);
}

async function openCursorComposer(): Promise<void> {
  await execFileAsync("osascript", [
    "-e",
    `tell application "System Events" to tell process "${EXTRACT_BUILD_APP_NAMES.cursor}" to keystroke "i" using command down`,
  ]);
}

async function openClaudeWeb(): Promise<void> {
  if (process.platform === "darwin") {
    await execFileAsync("open", [EXTRACT_BUILD_CLAUDE_WEB_URL]);
    return;
  }
  await shell.openExternal(EXTRACT_BUILD_CLAUDE_WEB_URL);
}

async function handoffToClaudeDesktop(): Promise<ExtractBuildHandoffResult> {
  const launched = await launchClaudeDesktop();
  if (!launched) {
    return {
      ok: true,
      pasted: false,
      error: "Prompt copied — open the Claude app and paste (⌘V)",
    };
  }
  await delay(900);
  try {
    await pasteIntoClaudeDesktop();
    return { ok: true, pasted: true, notice: extractBuildClaudeDesktopNotice() };
  } catch (err) {
    return {
      ok: true,
      pasted: false,
      error: handoffError(err, "Prompt copied — click Claude's message box and paste (⌘V)"),
      needsAccessibilitySettings: isAccessibilityDenied(err),
    };
  }
}

async function handoffToClaudeWeb(): Promise<ExtractBuildHandoffResult> {
  try {
    await openClaudeWeb();
    await delay(2200);
    await activateRunningBrowser();
    await delay(350);
    await pasteFromClipboard();
    return { ok: true, pasted: true, notice: extractBuildClaudeWebNotice() };
  } catch (err) {
    return {
      ok: true,
      pasted: false,
      error: handoffError(
        err,
        "Prompt copied — click Claude's message box in your browser and paste (⌘V)",
      ),
      needsAccessibilitySettings: isAccessibilityDenied(err),
    };
  }
}

export interface ExtractBuildHandoffResult {
  ok: boolean;
  pasted: boolean;
  notice?: string;
  error?: string;
  needsAccessibilitySettings?: boolean;
}

export async function runExtractBuildHandoff(
  target: ExtractBuildTarget,
  prompt: string,
): Promise<ExtractBuildHandoffResult> {
  if (!isExtractBuildTarget(target)) {
    return { ok: false, pasted: false, error: "Unknown build destination" };
  }

  const text = prompt.trim();
  if (!text) return { ok: false, pasted: false, error: "Prompt is empty" };

  if (target === "glass") {
    prefillCommandBar(text);
    return { ok: true, pasted: true, notice: extractBuildHandoffNotice("glass") };
  }

  clipboard.writeText(text);

  if (process.platform !== "darwin") {
    if (target === "claude") {
      await shell.openExternal(EXTRACT_BUILD_CLAUDE_WEB_URL);
    }
    return {
      ok: true,
      pasted: false,
      error: "Prompt copied — paste manually on this platform",
    };
  }

  if (target === "cursor") {
    const activated = await activateMacApp(EXTRACT_BUILD_APP_NAMES.cursor);
    if (!activated) {
      return {
        ok: true,
        pasted: false,
        error: "Prompt copied — open Cursor, open Composer (⌘I), and paste (⌘V)",
      };
    }
    await delay(500);
    try {
      await openCursorComposer();
      await delay(450);
      await pasteFromClipboard();
      return { ok: true, pasted: true, notice: extractBuildHandoffNotice("cursor") };
    } catch (err) {
      return {
        ok: true,
        pasted: false,
        error: handoffError(err, "Prompt copied — open Cursor Composer (⌘I) and paste (⌘V)"),
        needsAccessibilitySettings: isAccessibilityDenied(err),
      };
    }
  }

  // Claude — desktop app when installed; browser only if Claude.app is missing
  if (isClaudeDesktopInstalled()) {
    return handoffToClaudeDesktop();
  }
  return handoffToClaudeWeb();
}

/** @internal test helper */
export function _macBrowserNamesForTest(): readonly string[] {
  return MAC_BROWSERS;
}
