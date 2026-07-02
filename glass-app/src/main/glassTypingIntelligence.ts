/**
 * Live Writing Intelligence — watches focused text fields, rewrites on pause.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { clipboard, globalShortcut } from "electron";
import { resolveAnthropicApiKey, resolveGlassAnthropicModel } from "./anthropicKeyStore.ts";
import { recordModelCall } from "./modelCallStore.ts";
import { getWindows } from "./windows.ts";
import { getCachedWindowContext } from "./windowContext.ts";
import {
  startTypingKeystrokeMonitor,
  stopTypingKeystrokeMonitor,
} from "./glassTypingKeystrokeMonitor.ts";
import {
  countTypingIntelligenceWords,
  detectTypingIntelligenceInputType,
  type TypingIntelligenceInputType,
  type TypingIntelligenceState,
} from "../shared/glassTypingIntelligenceTypes.ts";
import { notifyRewriteComposeSnapshot } from "./glassRewriteDelta.ts";
import { notifyRewriteReadingContext } from "./glassRewriteLedger.ts";

export type {
  TypingIntelligenceInputType,
  TypingIntelligenceState,
} from "../shared/glassTypingIntelligenceTypes.ts";
export {
  countTypingIntelligenceWords,
  detectTypingIntelligenceInputType,
  formatTypingIntelligenceWordCount,
} from "../shared/glassTypingIntelligenceTypes.ts";

const execFileAsync = promisify(execFile);

const PAUSE_MS = 1_500;
const REWRITE_TIMEOUT_MS = 4_000;
const MIN_WORD_COUNT = 8;
/** Whole-field rewrite is never offered above this — targeted annotations only (data-loss guard). */
const MAX_REWRITE_WORDS = 400;
const POLL_MS_IDLE = 200;
const POLL_MS_WATCHING = 50;
const POLL_MS_SHOWING = 250;
/** Settle time after ⌘A+⌘V paste before the temp clipboard value is released. */
const PASTE_SETTLE_MS = 250;

const GLASS_APP_PATTERN = /^(Native Glass|Electron)$/i;
const TEXT_FIELD_ROLES = new Set([
  "AXTextField",
  "AXTextArea",
  "AXComboBox",
  "AXSearchField",
  "AXTextView",
]);

const CHROME_ACTIVE_FIELD_JS = `(function(){
  var el = document.activeElement;
  if (!el) return null;
  var tag = (el.tagName || '').toLowerCase();
  var editable = el.isContentEditable === true;
  var isText = editable || tag === 'textarea' || tag === 'input';
  if (!isText) return null;
  var inputType = (el.type || '').toLowerCase();
  if (tag === 'input' && ['password','hidden','checkbox','radio','submit','button','file'].indexOf(inputType) >= 0) return null;
  var text = editable ? String(el.innerText || el.textContent || '') : String(el.value || '');
  var r = el.getBoundingClientRect();
  return JSON.stringify({ text: text, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
})()`;

export type FocusedTextFieldSnapshot = {
  appName: string;
  text: string;
  bounds: { x: number; y: number; width: number; height: number };
  secure: boolean;
  role: string;
  source: "ax" | "chrome";
};

type TypingIntelligenceHost = {
  isEnabled: () => boolean;
  onUpdate: (state: TypingIntelligenceState) => void;
};

const REWRITE_SYSTEM_PROMPT = `You are a live writing intelligence layer sitting on top of the user's screen.
The user has paused while typing. Your job is to rewrite what they wrote into the clearest, most effective version of what they meant.

Rules:
- Preserve their intent completely — never change what they're trying to say
- Match the context: if they're writing a prompt, make it more precise. If they're writing a message, make it clearer and more direct. If they're writing something professional, elevate the register.
- Keep it concise — do not make it longer than necessary
- Do not add fluff, pleasantries, or filler
- Return only the rewritten text. Nothing else. No explanation.

App context: {appName}
Input type: {inputType}`;

let host: TypingIntelligenceHost | null = null;
let moduleActive = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pauseTimer: ReturnType<typeof setTimeout> | null = null;
let rewriteAbort: AbortController | null = null;
let rewriteGeneration = 0;
let lastObservedText = "";
let lastTextChangeAt = 0;
let pendingField: FocusedTextFieldSnapshot | null = null;
let pollInFlight = false;
let pauseElapsedInFlight = false;
let acceptedSourceText: string | null = null;
let acceptedSourceApp: string | null = null;
let registeredShortcuts = new Set<string>();
let keystrokeMonitorStarted = false;
let currentPollMs = POLL_MS_IDLE;

// Tab and Escape are NEVER registered as global shortcuts — doing so breaks
// Tab/Esc in every other app. The overlay card handles Tab/Esc via DOM
// keydown listeners scoped to the card element instead.
const TYPING_INTEL_ACCEPT_CMD_ENTER = "Command+Enter";
const TYPING_INTEL_DISMISS_CMD_PERIOD = "Command+.";

const state: TypingIntelligenceState = {
  active: false,
  currentFieldText: "",
  currentFieldBounds: null,
  rewrite: null,
  appContext: null,
  status: "idle",
  sourceWordCount: 0,
  rewriteWordCount: 0,
};

function toOverlayBounds(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number; width: number; height: number } {
  const overlay = getWindows()?.overlay;
  if (!overlay || overlay.isDestroyed()) return bounds;
  const [ox, oy] = overlay.getPosition();
  return {
    x: bounds.x - ox,
    y: bounds.y - oy,
    width: bounds.width,
    height: bounds.height,
  };
}

function snapshotState(): TypingIntelligenceState {
  return {
    ...state,
    sourceWordCount: countTypingIntelligenceWords(state.currentFieldText),
    rewriteWordCount: state.rewrite ? countTypingIntelligenceWords(state.rewrite) : 0,
  };
}

function emit(): void {
  const next = snapshotState();
  state.sourceWordCount = next.sourceWordCount;
  state.rewriteWordCount = next.rewriteWordCount;
  host?.onUpdate({
    ...next,
    currentFieldBounds: next.currentFieldBounds
      ? toOverlayBounds(next.currentFieldBounds)
      : null,
  });
}

export function configureTypingIntelligence(next: TypingIntelligenceHost): void {
  host = next;
}

export function isTypingIntelligenceActive(): boolean {
  return moduleActive;
}

export function getTypingIntelligenceState(): TypingIntelligenceState {
  return snapshotState();
}

function clearPauseTimer(): void {
  if (pauseTimer) {
    clearTimeout(pauseTimer);
    pauseTimer = null;
  }
}

function unregisterShortcut(accel: string): void {
  if (registeredShortcuts.has(accel) && globalShortcut.isRegistered(accel)) {
    globalShortcut.unregister(accel);
  }
  registeredShortcuts.delete(accel);
}

function registerShortcut(accel: string, handler: () => void): void {
  if (registeredShortcuts.has(accel)) return;
  if (globalShortcut.isRegistered(accel)) return;
  if (globalShortcut.register(accel, handler)) {
    registeredShortcuts.add(accel);
  }
}

function unregisterAcceptDismissShortcuts(): void {
  for (const accel of [...registeredShortcuts]) {
    unregisterShortcut(accel);
  }
}

function registerAcceptDismissShortcuts(opts?: { accept?: boolean; dismiss?: boolean }): void {
  const wantAccept = opts?.accept ?? state.status === "showing";
  const wantDismiss = opts?.dismiss ?? (state.status === "showing" || state.status === "rewriting");
  if (!wantAccept && !wantDismiss) return;

  if (wantAccept && state.status === "showing") {
    registerShortcut(TYPING_INTEL_ACCEPT_CMD_ENTER, () => {
      if (state.status === "showing") void acceptTypingIntelligenceRewrite();
    });
  }

  if (wantDismiss) {
    registerShortcut(TYPING_INTEL_DISMISS_CMD_PERIOD, () => {
      if (state.status === "showing" || state.status === "rewriting") {
        dismissTypingIntelligenceRewrite();
      }
    });
  }
}

function resetToIdle(): void {
  clearPauseTimer();
  unregisterAcceptDismissShortcuts();
  lastObservedText = "";
  lastTextChangeAt = 0;
  pendingField = null;
  acceptedSourceText = null;
  acceptedSourceApp = null;
  state.currentFieldText = "";
  state.currentFieldBounds = null;
  state.rewrite = null;
  state.appContext = null;
  state.status = "idle";
  state.sourceWordCount = 0;
  state.rewriteWordCount = 0;
  syncPollInterval();
  emit();
}

function abortRewrite(): void {
  rewriteGeneration += 1;
  rewriteAbort?.abort();
  rewriteAbort = null;
}

function isGlassFrontApp(appName: string): boolean {
  return GLASS_APP_PATTERN.test(appName.trim());
}

function resolveChromiumBrowser(appName: string): string | null {
  if (/brave/i.test(appName)) return "Brave Browser";
  if (/edge/i.test(appName)) return "Microsoft Edge";
  if (/chromium/i.test(appName)) return "Chromium";
  if (/chrome|google chrome/i.test(appName)) return "Google Chrome";
  return null;
}

function parseFocusedFieldPayload(
  appName: string,
  payload: {
    text: string;
    x: number;
    y: number;
    w: number;
    h: number;
    secure?: boolean;
    role?: string;
    source: "ax" | "chrome";
  },
  windowOffset?: { x: number; y: number },
): FocusedTextFieldSnapshot | null {
  const sx = payload.x + (windowOffset?.x ?? 0);
  const sy = payload.y + (windowOffset?.y ?? 0);
  const sw = payload.w;
  const sh = payload.h;
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(sw) || !Number.isFinite(sh)) {
    return null;
  }
  if (sw < 4 || sh < 4) return null;
  return {
    appName: appName.trim(),
    text: payload.text,
    bounds: { x: sx, y: sy, width: sw, height: sh },
    secure: payload.secure === true,
    role: payload.role?.trim() || "AXTextField",
    source: payload.source,
  };
}

async function queryFocusedFieldViaChrome(appName: string): Promise<FocusedTextFieldSnapshot | null> {
  const browser = resolveChromiumBrowser(appName);
  if (!browser) return null;

  const escapedJs = CHROME_ACTIVE_FIELD_JS.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const script = `
tell application "${browser}"
  if not running then return "skip"
  set jsResult to execute active tab of front window javascript "${escapedJs}"
  return jsResult
end tell
`;
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], {
      timeout: 2_500,
      maxBuffer: 512 * 1024,
    });
    const trimmed = stdout.trim();
    if (!trimmed || trimmed === "skip" || trimmed === "missing value") return null;
    const parsed = JSON.parse(trimmed) as {
      text: string;
      x: number;
      y: number;
      w: number;
      h: number;
    };
    if (!parsed?.text?.trim()) return null;
    const chromeChrome = 80;
    return parseFocusedFieldPayload(
      appName,
      {
        text: parsed.text,
        x: parsed.x,
        y: parsed.y,
        w: parsed.w,
        h: parsed.h,
        role: "DOMTextField",
        source: "chrome",
      },
      { x: 0, y: chromeChrome },
    );
  } catch {
    return null;
  }
}

async function queryFocusedFieldViaAx(): Promise<FocusedTextFieldSnapshot | null> {
  if (process.platform !== "darwin") return null;
  const script = `
set recordSep to character id 30
tell application "System Events"
  set frontProc to first application process whose frontmost is true
  set procName to name of frontProc
  try
    set focusedEl to value of attribute "AXFocusedUIElement" of frontProc
    set elRole to role of focusedEl as text
    set isSecure to false
    try
      set secureVal to value of attribute "AXIsSecureTextField" of focusedEl
      if secureVal is true or secureVal is 1 then set isSecure to true
    end try
    if isSecure then return "skip" & recordSep
    set allowedRoles to {"AXTextField", "AXTextArea", "AXComboBox", "AXSearchField", "AXTextView"}
    set roleOk to false
    repeat with allowedRole in allowedRoles
      if elRole is allowedRole then
        set roleOk to true
        exit repeat
      end if
    end repeat
    if not roleOk then
      try
        set editableVal to value of attribute "AXEditable" of focusedEl
        if editableVal is not true and editableVal is not 1 then return "skip" & recordSep
      on error
        return "skip" & recordSep
      end try
    end if
    set fieldText to ""
    try
      set fieldText to value of focusedEl as text
    end try
    if fieldText is "" then
      try
        set fieldText to value of attribute "AXValue" of focusedEl as text
      end try
    end if
    set p to position of focusedEl
    set s to size of focusedEl
    set b64Text to do shell script "printf %s " & quoted form of fieldText & " | base64"
    return procName & recordSep & b64Text & recordSep & (item 1 of p as text) & recordSep & (item 2 of p as text) & recordSep & (item 1 of s as text) & recordSep & (item 2 of s as text) & recordSep & elRole
  on error
    return "skip" & recordSep
  end try
end tell
`;
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], {
      timeout: 2_000,
      maxBuffer: 512 * 1024,
    });
    const parts = stdout.trim().split(String.fromCharCode(30));
    if (parts[0] === "skip" || parts.length < 7) return null;
    const [appName, b64, x, y, w, h, role] = parts;
    const text = Buffer.from(b64, "base64").toString("utf8");
    return parseFocusedFieldPayload(appName, {
      text,
      x: Number(x),
      y: Number(y),
      w: Number(w),
      h: Number(h),
      role,
      source: "ax",
    });
  } catch {
    return null;
  }
}

async function queryFocusedTextField(): Promise<FocusedTextFieldSnapshot | null> {
  const ax = await queryFocusedFieldViaAx();
  if (ax?.text.trim()) return ax;
  const appName = ax?.appName ?? getCachedWindowContext().appName ?? "";
  if (appName) {
    const chrome = await queryFocusedFieldViaChrome(appName);
    if (chrome?.text.trim()) return chrome;
  }
  return ax;
}

async function setFocusedTextFieldValueAx(text: string): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  const b64 = Buffer.from(text, "utf8").toString("base64");
  const script = `
set encoded to "${b64}"
set newText to do shell script "printf %s " & quoted form of encoded & " | base64 -D"
tell application "System Events"
  set frontProc to first application process whose frontmost is true
  try
    set focusedEl to value of attribute "AXFocusedUIElement" of frontProc
    set value of focusedEl to newText
    return "ok"
  on error errMsg
    return "error:" & errMsg
  end try
end tell
`;
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], { timeout: 2_500 });
    return stdout.trim() === "ok";
  } catch {
    return false;
  }
}

async function setFocusedTextFieldValueChrome(text: string, appName: string): Promise<boolean> {
  const browser = resolveChromiumBrowser(appName);
  if (!browser) return false;
  const b64 = Buffer.from(text, "utf8").toString("base64");
  const js = `(function(){var t=atob("${b64}");var el=document.activeElement;if(!el)return"no-el";if(el.isContentEditable){el.innerText=t;el.dispatchEvent(new Event("input",{bubbles:true}));return"ok";}if("value" in el){el.value=t;el.dispatchEvent(new Event("input",{bubbles:true}));return"ok";}return"unsupported";})()`;
  const escapedJs = js.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const script = `
tell application "${browser}"
  if not running then return "error"
  return execute active tab of front window javascript "${escapedJs}"
end tell
`;
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], { timeout: 2_500 });
    return stdout.trim() === "ok";
  } catch {
    return false;
  }
}

async function setFocusedTextFieldValuePaste(text: string): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  const previous = clipboard.readText();
  clipboard.writeText(text);
  try {
    const script = `
tell application "System Events"
  keystroke "a" using command down
  delay 0.06
  keystroke "v" using command down
  return "ok"
end tell
`;
    const { stdout } = await execFileAsync("osascript", ["-e", script], { timeout: 2_500 });
    const ok = stdout.trim() === "ok";
    // Let the target app consume the pasteboard before releasing the temp value —
    // restoring immediately can race the paste and drop the rewrite.
    await new Promise((r) => setTimeout(r, PASTE_SETTLE_MS));
    return ok;
  } catch {
    return false;
  } finally {
    clipboard.writeText(previous);
  }
}

/** Longest common prefix/suffix diff — the changed span between original and rewrite. */
export function diffChangedSpan(
  original: string,
  rewrite: string,
): { start: number; end: number; replacement: string } {
  let prefix = 0;
  const maxPrefix = Math.min(original.length, rewrite.length);
  while (prefix < maxPrefix && original[prefix] === rewrite[prefix]) prefix += 1;

  let suffix = 0;
  const maxSuffix = Math.min(original.length, rewrite.length) - prefix;
  while (
    suffix < maxSuffix
    && original[original.length - 1 - suffix] === rewrite[rewrite.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  return {
    start: prefix,
    end: original.length - suffix,
    replacement: rewrite.slice(prefix, rewrite.length - suffix),
  };
}

/** Ranged AX write — select only the changed span and replace it, leaving the rest untouched. */
async function setFocusedTextFieldValueRangedAx(
  original: string,
  rewrite: string,
): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  const span = diffChangedSpan(original, rewrite);
  if (span.start === 0 && span.end === original.length) return false;

  const b64 = Buffer.from(span.replacement, "utf8").toString("base64");
  const script = `
set encoded to "${b64}"
set replacementText to do shell script "printf %s " & quoted form of encoded & " | base64 -D"
tell application "System Events"
  set frontProc to first application process whose frontmost is true
  try
    set focusedEl to value of attribute "AXFocusedUIElement" of frontProc
    set value of attribute "AXSelectedTextRange" of focusedEl to {${span.start + 1}, ${span.end - span.start}}
    set value of attribute "AXSelectedText" of focusedEl to replacementText
    return "ok"
  on error errMsg
    return "error:" & errMsg
  end try
end tell
`;
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], { timeout: 2_500 });
    return stdout.trim() === "ok";
  } catch {
    return false;
  }
}

/**
 * Ranged edit of the focused field: replace [start, end) with `replacement`,
 * leaving the rest of the user's text untouched. Used by the delta engine's
 * "Fix to …" chips.
 */
export async function replaceFocusedFieldSpan(input: {
  originalText: string;
  start: number;
  end: number;
  replacement: string;
  appName: string;
  source: "ax" | "chrome";
}): Promise<boolean> {
  const rewritten =
    input.originalText.slice(0, input.start)
    + input.replacement
    + input.originalText.slice(input.end);
  return setFocusedTextFieldValue(rewritten, input.appName, input.source, input.originalText);
}

async function setFocusedTextFieldValue(
  text: string,
  appName: string,
  source: "ax" | "chrome",
  originalText?: string,
): Promise<boolean> {
  if (source === "chrome") {
    if (await setFocusedTextFieldValueChrome(text, appName)) return true;
  }
  // Prefer a ranged AX write of only the changed span — never destroys unrelated text.
  if (source === "ax" && originalText) {
    if (await setFocusedTextFieldValueRangedAx(originalText, text)) return true;
  }
  if (await setFocusedTextFieldValueAx(text)) return true;
  return setFocusedTextFieldValuePaste(text);
}

function buildRewriteSystemPrompt(appName: string, inputType: TypingIntelligenceInputType): string {
  return REWRITE_SYSTEM_PROMPT
    .replace("{appName}", appName)
    .replace("{inputType}", inputType);
}

function onTypingKeystroke(): void {
  if (!moduleActive || state.status === "rewriting") return;
  if (state.status === "showing") {
    void pollShowingStaleCheck();
    return;
  }
  lastTextChangeAt = Date.now();
  if (state.status === "watching") {
    schedulePauseCheck();
    void pollFocusedField();
  }
}

function syncPollInterval(): void {
  const next =
    state.status === "showing"
      ? POLL_MS_SHOWING
      : state.status === "watching"
        ? POLL_MS_WATCHING
        : POLL_MS_IDLE;
  if (next === currentPollMs && pollTimer) return;
  currentPollMs = next;
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    void pollFocusedField();
  }, currentPollMs);
}

async function requestRewrite(
  field: FocusedTextFieldSnapshot,
  generation: number,
): Promise<void> {
  const apiKey = resolveAnthropicApiKey();
  if (!apiKey) {
    resetToIdle();
    return;
  }

  state.status = "rewriting";
  state.currentFieldText = field.text;
  state.currentFieldBounds = field.bounds;
  state.appContext = field.appName;
  state.rewrite = null;
  acceptedSourceText = field.text;
  acceptedSourceApp = field.appName;
  syncPollInterval();
  emit();
  registerAcceptDismissShortcuts({ dismiss: true });

  const inputType = detectTypingIntelligenceInputType(field.appName, field.text);
  const client = new Anthropic({ apiKey, timeout: REWRITE_TIMEOUT_MS });
  const controller = new AbortController();
  rewriteAbort = controller;
  const timeout = setTimeout(() => controller.abort(), REWRITE_TIMEOUT_MS);

  try {
    const response = await client.messages.create({
      model: resolveGlassAnthropicModel("default"),
      // Sized for the MAX_REWRITE_WORDS guard — a full 400-word rewrite fits without truncation.
      max_tokens: 1024,
      system: buildRewriteSystemPrompt(field.appName, inputType),
      messages: [{ role: "user", content: field.text }],
    }, { signal: controller.signal });

    if (generation !== rewriteGeneration || !moduleActive) return;

    const rewrite = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (!rewrite || rewrite === field.text.trim()) {
      resetToIdle();
      return;
    }

    const input = response.usage?.input_tokens ?? 0;
    const output = response.usage?.output_tokens ?? 0;
    if (input > 0 || output > 0) {
      recordModelCall({
        source: "other",
        provider: "anthropic",
        model: resolveGlassAnthropicModel("default"),
        inputTokens: input,
        outputTokens: output,
      });
    }

    state.rewrite = rewrite;
    state.status = "showing";
    syncPollInterval();
    emit();
    registerAcceptDismissShortcuts({ accept: true, dismiss: true });
  } catch {
    if (generation === rewriteGeneration) resetToIdle();
  } finally {
    clearTimeout(timeout);
    if (rewriteAbort === controller) rewriteAbort = null;
  }
}

function schedulePauseCheck(): void {
  clearPauseTimer();
  pauseTimer = setTimeout(() => {
    void onPauseElapsed();
  }, PAUSE_MS);
}

async function onPauseElapsed(): Promise<void> {
  if (!moduleActive || !host?.isEnabled() || state.status === "rewriting" || state.status === "showing") {
    return;
  }
  if (pauseElapsedInFlight) return;
  pauseElapsedInFlight = true;
  try {
    const field = await queryFocusedTextField();
    if (!field) return;
    pendingField = field;
    state.currentFieldText = field.text;
    const wordCount = countTypingIntelligenceWords(field.text);
    if (wordCount < MIN_WORD_COUNT) return;
    // Data-loss guard: long drafts are never whole-field rewritten — the delta
    // engine (glassRewriteDelta) handles them with targeted annotations instead.
    if (wordCount > MAX_REWRITE_WORDS) return;

    abortRewrite();
    const generation = rewriteGeneration;
    await requestRewrite(field, generation);
  } finally {
    pauseElapsedInFlight = false;
  }
}

async function pollShowingStaleCheck(): Promise<void> {
  if (state.status !== "showing" || !acceptedSourceText) return;
  const field = await queryFocusedTextField();
  if (!field) {
    dismissTypingIntelligenceRewrite();
    return;
  }
  if (
    field.appName.trim() !== (acceptedSourceApp ?? "").trim()
    || field.text.trim() !== acceptedSourceText.trim()
  ) {
    dismissTypingIntelligenceRewrite();
  }
}

async function pollFocusedField(): Promise<void> {
  if (!moduleActive || !host?.isEnabled()) return;
  if (pollInFlight) return;
  pollInFlight = true;
  try {
    if (state.status === "showing") {
      await pollShowingStaleCheck();
      return;
    }
    if (state.status === "rewriting") return;
    await pollFocusedFieldInner();
  } finally {
    pollInFlight = false;
  }
}

async function pollFocusedFieldInner(): Promise<void> {
  const field = await queryFocusedTextField();
  const isComposeField =
    field != null
    && !field.secure
    && (TEXT_FIELD_ROLES.has(field.role) || field.role === "DOMTextField");

  // Feed the rewrite ledger (reading) and delta engine (composing).
  const cachedContext = getCachedWindowContext();
  notifyRewriteReadingContext({
    appName: field?.appName ?? cachedContext.appName ?? undefined,
    windowTitle: cachedContext.windowTitle ?? null,
    composeFieldFocused: isComposeField,
  });
  notifyRewriteComposeSnapshot(isComposeField ? field : null);

  if (!field || !isComposeField) {
    if (state.status !== "idle") resetToIdle();
    return;
  }
  if (isGlassFrontApp(field.appName)) {
    if (state.status !== "idle") resetToIdle();
    return;
  }

  state.active = true;
  state.appContext = field.appName;
  state.currentFieldBounds = field.bounds;

  if (field.text !== lastObservedText) {
    lastObservedText = field.text;
    lastTextChangeAt = Date.now();
    pendingField = field;
    state.currentFieldText = field.text;
    state.status = field.text.trim() ? "watching" : "idle";
    syncPollInterval();
    emit();
    if (field.text.trim()) schedulePauseCheck();
    return;
  }

  pendingField = field;
  state.currentFieldText = field.text;
  if (!field.text.trim()) {
    state.status = "idle";
    syncPollInterval();
    emit();
    clearPauseTimer();
    return;
  }

  if (state.status !== "watching") {
    state.status = "watching";
    syncPollInterval();
    emit();
  }

  if (Date.now() - lastTextChangeAt >= PAUSE_MS) {
    void onPauseElapsed();
  }
}

export function startTypingIntelligence(): void {
  if (moduleActive) return;
  moduleActive = true;
  state.active = true;
  state.status = "idle";
  keystrokeMonitorStarted = startTypingKeystrokeMonitor(onTypingKeystroke);
  emit();
  currentPollMs = POLL_MS_IDLE;
  pollTimer = setInterval(() => {
    void pollFocusedField();
  }, currentPollMs);
}

export function stopTypingIntelligence(): void {
  if (!moduleActive) return;
  moduleActive = false;
  abortRewrite();
  unregisterAcceptDismissShortcuts();
  stopTypingKeystrokeMonitor();
  keystrokeMonitorStarted = false;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  state.active = false;
  resetToIdle();
}

async function focusedFieldMatchesAcceptedSource(): Promise<FocusedTextFieldSnapshot | null> {
  if (!acceptedSourceText || !acceptedSourceApp) return null;
  const field = await queryFocusedTextField();
  if (!field) return null;
  if (field.appName.trim() !== acceptedSourceApp.trim()) return null;
  if (field.text.trim() !== acceptedSourceText.trim()) return null;
  return field;
}

export async function acceptTypingIntelligenceRewrite(): Promise<boolean> {
  const rewrite = state.rewrite?.trim();
  if (!rewrite || state.status !== "showing") return false;
  const field = await focusedFieldMatchesAcceptedSource();
  if (!field) {
    dismissTypingIntelligenceRewrite();
    return false;
  }
  const ok = await setFocusedTextFieldValue(rewrite, field.appName, field.source, field.text);
  if (!ok) return false;
  abortRewrite();
  resetToIdle();
  return true;
}

export function dismissTypingIntelligenceRewrite(): void {
  if (state.status !== "showing" && state.status !== "rewriting") return;
  abortRewrite();
  resetToIdle();
}

export function typingIntelligenceKeystrokeMonitorActive(): boolean {
  return keystrokeMonitorStarted;
}

/** E2E / demo — push overlay state through the real emit + bounds conversion path. */
export function e2ePushTypingIntelligenceState(
  patch: Partial<TypingIntelligenceState>,
): void {
  if (process.env.IIVO_GLASS_E2E !== "1") return;
  if (patch.active !== undefined) state.active = patch.active;
  if (patch.currentFieldText !== undefined) state.currentFieldText = patch.currentFieldText;
  if (patch.currentFieldBounds !== undefined) state.currentFieldBounds = patch.currentFieldBounds;
  if (patch.rewrite !== undefined) state.rewrite = patch.rewrite;
  if (patch.appContext !== undefined) state.appContext = patch.appContext;
  if (patch.status !== undefined) state.status = patch.status;
  if (patch.sourceWordCount !== undefined) state.sourceWordCount = patch.sourceWordCount;
  if (patch.rewriteWordCount !== undefined) state.rewriteWordCount = patch.rewriteWordCount;
  emit();
}
