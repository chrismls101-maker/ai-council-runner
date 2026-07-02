/**
 * Glass this — multi-signal trigger layer.
 */

import { clipboard, globalShortcut, screen } from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { TextOverlayTrigger, TextContentType } from "../shared/textOverlayTypes.ts";
import { isGlassAppName, isPrivacyApp } from "../shared/textOverlayTypes.ts";
import type { GlassUserSettings } from "../shared/glassSettings.ts";
import {
  TEXT_OVERLAY_HOTKEY,
  TEXT_OVERLAY_HOTKEY_FALLBACK,
  textOverlayHotkeyAccelerators,
} from "../shared/textOverlayHotkeys.ts";

const execFileAsync = promisify(execFile);

const CLIPBOARD_POLL_MS = 400;
const SELECTION_POLL_MS = 350;
const CURSOR_POLL_MS = 200;
const DEFAULT_CURSOR_PAUSE_MS = 1_200;
const DEFAULT_SCROLL_PAUSE_MS = 1_500;
/** Cooldown for automatic triggers (cursor pause, scroll pause, ambient). */
const TRIGGER_COOLDOWN_MS = 5_000;
/** Minimum cooldown for user-driven triggers (selection, clipboard, hotkey) — prevents drag-expand re-fires. */
const USER_TRIGGER_COOLDOWN_MS = 2_000;
/** A selection must be stable (unchanged) this long before firing — never fire mid-drag. */
const SELECTION_STABLE_MS = 400;
/** Minimum characters of text under the cursor for a cursor-pause to fire. */
const CURSOR_PAUSE_MIN_TEXT_CHARS = 10;

export type TextOverlayTriggerCallback = (event: {
  trigger: TextOverlayTrigger;
  rawText?: string;
  contentType?: TextContentType;
  cursorX: number;
  cursorY: number;
}) => void;

export type TextOverlayTriggerHost = {
  isEnabled: () => boolean;
  getSettings: () => GlassUserSettings;
  getActiveApp: () => string | undefined;
  onTrigger: TextOverlayTriggerCallback;
  /** Called when any non-ambient trigger fires — resets ambient digest timer. */
  onNonAmbientTrigger?: () => void;
};

let host: TextOverlayTriggerHost | null = null;
let moduleActive = false;

let clipboardTimer: ReturnType<typeof setInterval> | null = null;
let selectionTimer: ReturnType<typeof setInterval> | null = null;
let cursorTimer: ReturnType<typeof setInterval> | null = null;

let lastClipboard = "";
let lastSelection = "";
let lastTriggerAt = 0;
let cursorStillSince = 0;
let lastCursor = { x: -1, y: -1 };
let cursorPauseArmed = true;
let scrollStillTimer: ReturnType<typeof setTimeout> | null = null;
let lastScrollValue = "";
let scrollTrackingInitialized = false;
let lastScrollChangeAt = 0;

function cursorPauseMs(): number {
  const delay = host?.getSettings().textOverlayTriggerDelayMs;
  if (typeof delay === "number" && Number.isFinite(delay)) {
    return Math.max(400, Math.min(3000, Math.round(delay + 400)));
  }
  return DEFAULT_CURSOR_PAUSE_MS;
}

function scrollPauseMs(): number {
  const delay = host?.getSettings().textOverlayTriggerDelayMs;
  if (typeof delay === "number" && Number.isFinite(delay)) {
    return Math.max(800, Math.min(4000, Math.round(delay + 700)));
  }
  return DEFAULT_SCROLL_PAUSE_MS;
}

function shouldSkipTrigger(appName: string | undefined): boolean {
  if (!host) return true;
  if (isGlassAppName(appName)) return true;
  const privacyApps = host.getSettings().textOverlayPrivacyApps ?? [];
  if (isPrivacyApp(appName, privacyApps)) return true;
  return false;
}

function fireTrigger(
  event: {
    trigger: TextOverlayTrigger;
    rawText?: string;
    contentType?: TextContentType;
    cursorX?: number;
    cursorY?: number;
  },
  options?: { skipAppGate?: boolean },
): void {
  if (!host?.isEnabled()) return;

  const cursor = screen.getCursorScreenPoint();
  const appName = host.getActiveApp();
  if (!options?.skipAppGate && shouldSkipTrigger(appName)) return;

  // Cooldown applies to ALL trigger types — automatic triggers wait the full
  // window; explicit user actions (selection/clipboard/hotkey) a shorter one.
  const now = Date.now();
  const cooldownMs =
    event.trigger === "selection" || event.trigger === "clipboard" || event.trigger === "hotkey"
      ? USER_TRIGGER_COOLDOWN_MS
      : TRIGGER_COOLDOWN_MS;
  if (now - lastTriggerAt < cooldownMs) return;

  if (event.trigger !== "ambient") {
    host.onNonAmbientTrigger?.();
  }

  lastTriggerAt = now;
  host.onTrigger({
    trigger: event.trigger,
    rawText: event.rawText,
    contentType: event.contentType,
    cursorX: event.cursorX ?? cursor.x,
    cursorY: event.cursorY ?? cursor.y,
  });
}

const AX_TEXT_AT_POINT_JXA = `
ObjC.import('ApplicationServices');
function run(argv) {
  try {
    var x = Number(argv[0]);
    var y = Number(argv[1]);
    var sys = $.AXUIElementCreateSystemWide();
    var elRef = Ref();
    if ($.AXUIElementCopyElementAtPosition(sys, x, y, elRef) !== 0) return 'none';
    var attrs = ['AXSelectedText', 'AXValue'];
    var longest = 0;
    for (var i = 0; i < attrs.length; i++) {
      var outRef = Ref();
      if ($.AXUIElementCopyAttributeValue(elRef[0], attrs[i], outRef) !== 0) continue;
      try {
        var s = ObjC.unwrap(ObjC.castRefToObject(outRef[0]));
        if (typeof s === 'string' && s.length > longest) longest = s.length;
      } catch (e) { /* non-string attribute value */ }
    }
    return String(longest);
  } catch (e) {
    return 'err';
  }
}
`;

/**
 * Character count of AX text (AXValue / AXSelectedText) under a screen point.
 * Returns null when the check itself is unavailable (AX denied, JXA failure) —
 * callers should treat null as "unknown", not "no text".
 */
async function queryTextLengthAtPoint(x: number, y: number): Promise<number | null> {
  if (process.platform !== "darwin") return null;
  try {
    const { stdout } = await execFileAsync(
      "osascript",
      ["-l", "JavaScript", "-e", AX_TEXT_AT_POINT_JXA, String(Math.round(x)), String(Math.round(y))],
      { timeout: 1_500 },
    );
    const trimmed = stdout.trim();
    if (trimmed === "err") return null;
    if (trimmed === "none") return 0;
    const len = Number.parseInt(trimmed, 10);
    return Number.isFinite(len) ? len : null;
  } catch {
    return null;
  }
}

async function querySelectedText(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      `tell application "System Events"
        set frontProc to first application process whose frontmost is true
        try
          set focusedElement to value of attribute "AXFocusedUIElement" of frontProc
          return value of attribute "AXSelectedText" of focusedElement
        on error
          return ""
        end try
      end tell`,
    ]);
    return stdout.trim();
  } catch {
    return "";
  }
}

async function queryScrollValue(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      `tell application "System Events"
        set frontProc to first application process whose frontmost is true
        try
          set scrollArea to first scroll area of front window of frontProc
          return (value of attribute "AXValue" of scrollArea as text) & "|" & (value of attribute "AXPosition" of scrollArea as text)
        on error
          return ""
        end try
      end tell`,
    ]);
    return stdout.trim();
  } catch {
    return "";
  }
}

export function acknowledgeClipboardText(text: string): void {
  lastClipboard = text;
}

function tryClipboardPoll(): boolean {
  const text = clipboard.readText();
  if (!text || text === lastClipboard) return false;
  lastClipboard = text;
  if (text.trim().length < 2) return false;
  fireTrigger({ trigger: "clipboard", rawText: text.trim() });
  return true;
}

/** E2E — whether clipboard poll would fire for this text. */
export function wouldFireClipboardTrigger(nextText: string): boolean {
  if (!nextText || nextText === lastClipboard) return false;
  if (nextText.trim().length < 2) return false;
  return true;
}

/** E2E — simulate user copying text (bypasses frontmost-Glass gate). */
export function e2eSimulateClipboardCopy(rawText: string): void {
  if (process.env.IIVO_GLASS_E2E !== "1") return;
  clipboard.writeText(rawText);
  lastClipboard = rawText;
  fireTrigger({ trigger: "clipboard", rawText: rawText.trim() }, { skipAppGate: true });
}

/** E2E — run one clipboard poll (returns true if trigger fired). */
export function e2ePollClipboard(): boolean {
  if (process.env.IIVO_GLASS_E2E !== "1") return false;
  return tryClipboardPoll();
}

function pollClipboard(): void {
  tryClipboardPoll();
}

let pendingSelection: string | null = null;
let pendingSelectionSince = 0;

async function pollSelection(): Promise<void> {
  const selected = await querySelectedText();
  if (!selected) {
    pendingSelection = null;
    return;
  }

  // Fire only after the selection has been stable — never mid-drag.
  if (selected !== pendingSelection) {
    pendingSelection = selected;
    pendingSelectionSince = Date.now();
    return;
  }
  if (Date.now() - pendingSelectionSince < SELECTION_STABLE_MS) return;

  if (selected === lastSelection) return;
  lastSelection = selected;
  if (selected.trim().length < 2) return;
  fireTrigger({ trigger: "selection", rawText: selected.trim() });
}

let cursorPauseCheckInFlight = false;

function pollCursor(): void {
  const pt = screen.getCursorScreenPoint();
  const moved = pt.x !== lastCursor.x || pt.y !== lastCursor.y;
  lastCursor = { x: pt.x, y: pt.y };

  if (moved) {
    cursorStillSince = Date.now();
    cursorPauseArmed = true;
    return;
  }

  if (!cursorPauseArmed) return;

  if (Date.now() - cursorStillSince >= cursorPauseMs()) {
    cursorPauseArmed = false;
    if (cursorPauseCheckInFlight) return;
    cursorPauseCheckInFlight = true;
    // A resting hand is not a question — require actual text under the cursor
    // before spending a vision call.
    void queryTextLengthAtPoint(pt.x, pt.y)
      .then((len) => {
        if (len != null && len < CURSOR_PAUSE_MIN_TEXT_CHARS) return;
        fireTrigger({ trigger: "cursor_pause" });
      })
      .finally(() => {
        cursorPauseCheckInFlight = false;
      });
  }
}

async function pollScrollPause(): Promise<void> {
  const scrollValue = await queryScrollValue();
  if (!scrollValue) return;

  if (!scrollTrackingInitialized) {
    lastScrollValue = scrollValue;
    scrollTrackingInitialized = true;
    return;
  }

  if (scrollValue !== lastScrollValue) {
    lastScrollValue = scrollValue;
    lastScrollChangeAt = Date.now();
    if (scrollStillTimer) clearTimeout(scrollStillTimer);
    scrollStillTimer = setTimeout(() => {
      fireTrigger({ trigger: "scroll_pause" });
    }, scrollPauseMs());
  }
}

function registerHotkey(): void {
  const accelerators = textOverlayHotkeyAccelerators(host?.getSettings().hotkeyPreset);
  for (const accelerator of accelerators) {
    try {
      if (globalShortcut.register(accelerator, () => {
        fireTrigger({ trigger: "hotkey" });
      })) {
        return;
      }
    } catch {
      /* try fallback */
    }
  }
}

function unregisterHotkey(): void {
  for (const accelerator of [TEXT_OVERLAY_HOTKEY, TEXT_OVERLAY_HOTKEY_FALLBACK]) {
    try {
      globalShortcut.unregister(accelerator);
    } catch {
      /* ignore */
    }
  }
}

/** Unix ms of the last detected scroll movement, or 0 if none yet. */
export function getLastScrollChangeAt(): number {
  return lastScrollChangeAt;
}

/** Fire ambient reading trigger — called from screen digest loop. */
export function fireAmbientTextOverlayTrigger(input: {
  rawText: string;
  contentType: TextContentType;
}): void {
  const skipAppGate = process.env.IIVO_GLASS_E2E === "1";
  fireTrigger(
    {
      trigger: "ambient",
      rawText: input.rawText,
      contentType: input.contentType,
    },
    skipAppGate ? { skipAppGate: true } : undefined,
  );
}

export function configureTextOverlayTriggers(next: TextOverlayTriggerHost): void {
  host = next;
}

export function startTextOverlayTriggers(): void {
  if (moduleActive) return;
  moduleActive = true;
  lastClipboard = clipboard.readText();
  cursorStillSince = Date.now();
  cursorPauseArmed = true;
  scrollTrackingInitialized = false;

  clipboardTimer = setInterval(pollClipboard, CLIPBOARD_POLL_MS);
  selectionTimer = setInterval(() => void pollSelection(), SELECTION_POLL_MS);
  cursorTimer = setInterval(() => {
    pollCursor();
    void pollScrollPause();
  }, CURSOR_POLL_MS);

  registerHotkey();
}

export function stopTextOverlayTriggers(): void {
  if (!moduleActive) return;
  moduleActive = false;

  if (clipboardTimer) {
    clearInterval(clipboardTimer);
    clipboardTimer = null;
  }
  if (selectionTimer) {
    clearInterval(selectionTimer);
    selectionTimer = null;
  }
  if (cursorTimer) {
    clearInterval(cursorTimer);
    cursorTimer = null;
  }
  if (scrollStillTimer) {
    clearTimeout(scrollStillTimer);
    scrollStillTimer = null;
  }

  unregisterHotkey();
  lastClipboard = "";
  lastSelection = "";
  scrollTrackingInitialized = false;
}

export function isTextOverlayTriggersActive(): boolean {
  return moduleActive;
}

/** Dev/E2E — fire hotkey trigger directly. */
export function e2eFireTextOverlayHotkey(): void {
  fireTrigger({ trigger: "hotkey" });
}

/** Re-register hotkey after settings change (e.g. hotkey preset). */
export function refreshTextOverlayHotkey(): void {
  if (!moduleActive) return;
  unregisterHotkey();
  registerHotkey();
}
