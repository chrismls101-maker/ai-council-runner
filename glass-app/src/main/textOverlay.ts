/**
 * Glass this — orchestrates capture → extract → intelligence → overlay card.
 */

import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { clipboard, screen } from "electron";
import type {
  TextOverlayCard,
  TextOverlayCardUpdate,
  TextOverlayFractionBounds,
  TextOverlayTrigger,
  TextOverlayWhisperPayload,
  TextContentType,
} from "../shared/textOverlayTypes.ts";
import {
  isGlassAppName,
  isPrivacyApp,
} from "../shared/textOverlayTypes.ts";
import type { GlassUserSettings } from "../shared/glassSettings.ts";
import type { TextOverlayActionOp } from "../shared/textOverlayTypes.ts";
import {
  copyPayloadForAction,
  promptForTextOverlayAction,
  buildMemoryFactFromTextOverlayCard,
} from "../shared/textOverlayActions.ts";
import { captureForTextOverlay } from "./textOverlayCapture.ts";
import { extractTextFromScreenshot, buildExtractionFromKnownText } from "./textOverlayExtractor.ts";
import { runTextOverlayIntelligence } from "./textOverlayIntelligence.ts";
import { sampleSurfaceBehindCard } from "./textOverlaySurfaceSample.ts";
import { subscribeKeystrokeMonitor, typingKeystrokeMonitorActive, getLastKeystrokeAt } from "./glassTypingKeystrokeMonitor.ts";
import { resetAmbientReadingTimer, kickAmbientReadingLoop } from "./glassScreenDigest.ts";
import { screenPointToOverlayLocal } from "../shared/textOverlayCoords.ts";
import { getWindows } from "./windows.ts";
import {
  configureTextOverlayTriggers,
  startTextOverlayTriggers,
  stopTextOverlayTriggers,
  isTextOverlayTriggersActive,
  acknowledgeClipboardText,
  getLastScrollChangeAt,
} from "./textOverlayTrigger.ts";

const execFileAsync = promisify(execFile);
const ACTIVITY_DISMISS_POLL_MS = 200;
const CARD_EDGE_MARGIN_PX = 40;

export type TextOverlayActionContext = {
  prefillCommandBar: (text: string) => void;
  submitAsk: (text: string) => void;
  saveToMemory: (fact: import("../shared/glassMemory.ts").ExtractedFact) => void;
};

export type TextOverlayHost = {
  isEnabled: () => boolean;
  /** When true, defer Glass this so it does not hide chrome during Glass Guide. */
  isGuideActive?: () => boolean;
  getSettings: () => GlassUserSettings;
  getActiveApp: () => string | undefined;
  onShow: (card: TextOverlayCard) => void;
  /** Progressive level arrival for the live card. */
  onUpdateCard?: (update: TextOverlayCardUpdate) => void;
  /** Whisper stage — soft dot at the trigger point before any model returns. */
  onWhisper?: (payload: TextOverlayWhisperPayload) => void;
  onDismiss: () => void;
  actions?: TextOverlayActionContext;
};

let host: TextOverlayHost | null = null;
let pipelineAbort: AbortController | null = null;
let currentCard: TextOverlayCard | null = null;
let pipelineInFlight = false;
let pipelineGeneration = 0;
let unsubscribeKeystroke: (() => void) | null = null;
let unsubscribeIdleKeystrokeTrack: (() => void) | null = null;
let activityDismissTimer: ReturnType<typeof setInterval> | null = null;
let qaLastSubmitAsk: string | null = null;
let qaTriggerCount = 0;
let qaLastTrigger: TextOverlayTrigger | null = null;

function captureModeForTrigger(trigger: TextOverlayTrigger): "full" | "cursor_crop" | "center_third" {
  switch (trigger) {
    case "cursor_pause":
      return "cursor_crop";
    case "hotkey":
    case "scroll_pause":
      return "center_third";
    default:
      return "full";
  }
}

function shouldSkipApp(appName: string | null | undefined): boolean {
  if (!host) return true;
  if (isGlassAppName(appName)) return true;
  const privacyApps = host.getSettings().textOverlayPrivacyApps ?? [];
  return isPrivacyApp(appName, privacyApps);
}

function clearKeystrokeDismiss(): void {
  unsubscribeKeystroke?.();
  unsubscribeKeystroke = null;
  clearActivityDismissFallback();
}

async function queryFocusedTextLength(): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      `tell application "System Events"
        set frontProc to first application process whose frontmost is true
        try
          set focusedElement to value of attribute "AXFocusedUIElement" of frontProc
          set role to value of attribute "AXRole" of focusedElement
          if role is in {"AXTextField", "AXTextArea", "AXComboBox", "AXSearchField", "AXTextView"} then
            return length of (value of attribute "AXValue" of focusedElement as text)
          end if
        end try
      end tell
      return missing value`,
    ]);
    const trimmed = stdout.trim();
    if (!trimmed || trimmed === "missing value") return null;
    const len = Number.parseInt(trimmed, 10);
    return Number.isFinite(len) ? len : null;
  } catch {
    return null;
  }
}

function clearActivityDismissFallback(): void {
  if (activityDismissTimer) {
    clearInterval(activityDismissTimer);
    activityDismissTimer = null;
  }
}

function startActivityDismissFallback(): void {
  clearActivityDismissFallback();
  const baselineKeyAt = getLastKeystrokeAt();
  const baselineScrollAt = getLastScrollChangeAt();
  const baselineClipboard = clipboard.readText();
  let baselineFocusedLen: number | null = null;

  void queryFocusedTextLength().then((len) => {
    baselineFocusedLen = len;
  });

  activityDismissTimer = setInterval(() => {
    if (!currentCard) {
      clearActivityDismissFallback();
      return;
    }

    const keyAt = getLastKeystrokeAt();
    if (keyAt > baselineKeyAt) {
      dismissTextOverlayCard();
      return;
    }

    const scrollAt = getLastScrollChangeAt();
    if (scrollAt > baselineScrollAt) {
      dismissTextOverlayCard();
      return;
    }

    const clip = clipboard.readText();
    if (clip !== baselineClipboard) {
      dismissTextOverlayCard();
      return;
    }

    void queryFocusedTextLength().then((len) => {
      if (
        len != null
        && baselineFocusedLen != null
        && len > baselineFocusedLen
      ) {
        dismissTextOverlayCard();
        return;
      }
      if (len != null) {
        baselineFocusedLen = len;
      }
    });
  }, ACTIVITY_DISMISS_POLL_MS);
}

function clearIdleKeystrokeTrack(): void {
  unsubscribeIdleKeystrokeTrack?.();
  unsubscribeIdleKeystrokeTrack = null;
}

function armKeystrokeDismiss(): void {
  clearKeystrokeDismiss();
  unsubscribeKeystroke = subscribeKeystrokeMonitor("text-overlay", () => {
    dismissTextOverlayCard();
  });

  if (typingKeystrokeMonitorActive()) return;

  // CGEventTap unavailable (missing binary or Input Monitoring permission).
  setTimeout(() => {
    if (!currentCard || typingKeystrokeMonitorActive()) return;
    startActivityDismissFallback();
  }, 300);
}

/**
 * Convert the extractor's image-fraction text bounds to overlay-local px.
 * cropRect is the screen-px rect the captured image covers.
 */
function resolveTextAnchorOverlayPx(
  textBounds: TextOverlayFractionBounds | undefined,
  cropRect: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } | null {
  if (!textBounds) return null;
  const overlay = getWindows()?.overlay;
  if (!overlay || overlay.isDestroyed()) return null;
  const overlayBounds = overlay.getBounds();

  const screenX = cropRect.x + textBounds.left * cropRect.width;
  const screenY = cropRect.y + textBounds.top * cropRect.height;
  const width = textBounds.width * cropRect.width;
  const height = textBounds.height * cropRect.height;

  return {
    x: Math.round(screenX - overlayBounds.x),
    y: Math.round(screenY - overlayBounds.y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function toOverlayLocalCoords(cursorX: number, cursorY: number): { x: number; y: number } {
  const overlay = getWindows()?.overlay;
  if (!overlay || overlay.isDestroyed()) return { x: cursorX, y: cursorY };

  const bounds = overlay.getBounds();
  const display = screen.getDisplayNearestPoint({ x: cursorX, y: cursorY });
  return screenPointToOverlayLocal(
    cursorX,
    cursorY,
    bounds,
    display.bounds,
    CARD_EDGE_MARGIN_PX,
  );
}

async function runPipeline(event: {
  trigger: TextOverlayTrigger;
  rawText?: string;
  contentType?: TextContentType;
  cursorX: number;
  cursorY: number;
}): Promise<void> {
  if (!host?.isEnabled()) return;
  if (host.isGuideActive?.()) return;

  const activeApp = host.getActiveApp();
  const e2eMode = process.env.IIVO_GLASS_E2E === "1";
  if (!e2eMode && shouldSkipApp(activeApp)) return;

  const generation = ++pipelineGeneration;
  pipelineInFlight = true;
  qaTriggerCount += 1;
  qaLastTrigger = event.trigger;
  try {
    pipelineAbort?.abort();
    clearKeystrokeDismiss();
    if (currentCard) {
      currentCard = null;
      host.onDismiss();
    }

    pipelineAbort = new AbortController();
    const signal = pipelineAbort.signal;
    const cardId = randomUUID();

    const settings = host.getSettings();
    const local = toOverlayLocalCoords(event.cursorX, event.cursorY);

    // Whisper stage — a soft dot of light at the trigger point, before any
    // model returns. If nothing comes of the trigger, it simply fades.
    host.onWhisper?.({ x: local.x, y: local.y, nonce: Date.now() });

    const capture = await captureForTextOverlay({
      displayTarget: settings.displayTarget,
      mode: captureModeForTrigger(event.trigger),
      cursorX: event.cursorX,
      cursorY: event.cursorY,
    });
    if (signal.aborted || !capture) return;

    let extraction;
    if (
      event.rawText?.trim()
      && (
        event.trigger === "ambient"
        || (e2eMode && event.rawText.trim().length >= 2)
      )
    ) {
      extraction = buildExtractionFromKnownText({
        rawText: event.rawText.trim(),
        triggerSource: event.trigger,
        appName: activeApp ?? null,
        contentType: event.contentType ?? "legal_contract",
      });
    } else {
      extraction = await extractTextFromScreenshot({
        imageDataUrl: capture.imageDataUrl,
        knownRawText: event.rawText,
        triggerSource: event.trigger,
        activeAppHint: activeApp ?? null,
      });
    }
    if (signal.aborted || !extraction) return;
    if (!e2eMode && shouldSkipApp(extraction.appName ?? activeApp)) return;
    if (!extraction.rawText.trim() || extraction.rawText.trim().length < 2) return;

    // Text anchoring: image-fraction bounds → screen px (via crop rect) → overlay-local px.
    const textAnchor = resolveTextAnchorOverlayPx(extraction.textBounds, capture.cropRect);
    const surface = sampleSurfaceBehindCard(capture.imageDataUrl, extraction.textBounds);

    const card = await runTextOverlayIntelligence({
      extraction,
      cursorX: local.x,
      cursorY: local.y,
      cardId,
      signal,
      textAnchor: textAnchor ?? undefined,
      appTint: surface?.tint,
      lightMode: surface?.lightMode,
      emit: {
        onFirst: (first) => {
          if (signal.aborted || !host) return;
          currentCard = first;
          armKeystrokeDismiss();
          host.onShow(first);
        },
        onUpdate: (update) => {
          if (signal.aborted || !host || !currentCard || currentCard.id !== update.cardId) return;
          currentCard = {
            ...currentCard,
            level1: update.level1 !== undefined ? update.level1 : currentCard.level1,
            level2: update.level2 !== undefined ? update.level2 : currentCard.level2,
            level2Source: update.level2Source ?? currentCard.level2Source,
            verificationConfidence:
              update.verificationConfidence ?? currentCard.verificationConfidence,
            level3: update.level3 !== undefined ? update.level3 : currentCard.level3,
            pendingLevels: update.pendingLevels,
          };
          host.onUpdateCard?.(update);
        },
      },
    });
    if (signal.aborted || !card) return;
    currentCard = { ...card };
  } finally {
    if (generation === pipelineGeneration) {
      pipelineInFlight = false;
    }
    if (event.trigger === "ambient") {
      resetAmbientReadingTimer();
    }
  }
}

export function configureTextOverlay(next: TextOverlayHost): void {
  host = next;
  configureTextOverlayTriggers({
    isEnabled: () => next.isEnabled(),
    getSettings: () => next.getSettings(),
    getActiveApp: () => next.getActiveApp(),
    onNonAmbientTrigger: resetAmbientReadingTimer,
    onTrigger: (event) => {
      void runPipeline(event);
    },
  });
}

export function startTextOverlay(): void {
  if (!host?.isEnabled()) return;
  if (!isTextOverlayTriggersActive()) startTextOverlayTriggers();
  if (!unsubscribeIdleKeystrokeTrack) {
    unsubscribeIdleKeystrokeTrack = subscribeKeystrokeMonitor("text-overlay-idle", () => {
      /* timestamp tracked globally for ambient reading-idle detection */
    });
  }
  kickAmbientReadingLoop();
}

export function stopTextOverlay(): void {
  pipelineGeneration += 1;
  pipelineAbort?.abort();
  pipelineAbort = null;
  pipelineInFlight = false;
  clearKeystrokeDismiss();
  clearIdleKeystrokeTrack();
  currentCard = null;
  stopTextOverlayTriggers();
  host?.onDismiss();
  kickAmbientReadingLoop();
}

export function dismissTextOverlayCard(): void {
  pipelineGeneration += 1;
  pipelineAbort?.abort();
  pipelineAbort = null;
  clearKeystrokeDismiss();
  currentCard = null;
  host?.onDismiss();
}

export function getCurrentTextOverlayCard(): TextOverlayCard | null {
  return currentCard;
}

/** True while a card is visible or capture/extract/intelligence is in flight. */
export function isTextOverlayBusy(): boolean {
  return pipelineInFlight || currentCard != null;
}

export type TextOverlayQaState = {
  enabled: boolean;
  busy: boolean;
  card: TextOverlayCard | null;
  triggerCount: number;
  lastTrigger: TextOverlayTrigger | null;
  lastSubmitAsk: string | null;
};

export function getTextOverlayQaState(): TextOverlayQaState {
  return {
    enabled: host?.isEnabled() ?? false,
    busy: isTextOverlayBusy(),
    card: currentCard,
    triggerCount: qaTriggerCount,
    lastTrigger: qaLastTrigger,
    lastSubmitAsk: qaLastSubmitAsk,
  };
}

export function resetTextOverlayQaState(): void {
  qaLastSubmitAsk = null;
  qaTriggerCount = 0;
  qaLastTrigger = null;
  dismissTextOverlayCard();
}

export function recordTextOverlaySubmitAsk(prompt: string): void {
  qaLastSubmitAsk = prompt;
}

export function handleTextOverlayAction(input: {
  cardId: string;
  op: TextOverlayActionOp;
  payload?: unknown;
}): void {
  if (!currentCard || input.cardId !== currentCard.id) return;

  const card = currentCard;
  const ctx = host?.actions;

  switch (input.op) {
    case "copy_to_clipboard": {
      const action = card.level4.find((a) => a.op === "copy_to_clipboard");
      const text =
        typeof input.payload === "string" && input.payload.trim()
          ? input.payload
          : copyPayloadForAction(action ?? { label: "", op: "copy_to_clipboard" }, card);
      if (text) {
        clipboard.writeText(text);
        acknowledgeClipboardText(text);
      }
      break;
    }
    case "save_to_memory": {
      ctx?.saveToMemory(buildMemoryFactFromTextOverlayCard(card, input.op));
      break;
    }
    case "flag_risk": {
      ctx?.saveToMemory(buildMemoryFactFromTextOverlayCard(card, input.op));
      const flagPrompt = promptForTextOverlayAction(card, input.op);
      if (flagPrompt) ctx?.prefillCommandBar(flagPrompt);
      break;
    }
    case "open_in_glass": {
      const prompt = promptForTextOverlayAction(card, input.op);
      if (prompt) {
        recordTextOverlaySubmitAsk(prompt);
        ctx?.submitAsk(prompt);
      }
      break;
    }
    case "draft_reply":
    case "apply_fix":
    case "create_action_item": {
      const prompt = promptForTextOverlayAction(card, input.op);
      if (prompt && ctx) {
        ctx.prefillCommandBar(prompt);
      }
      break;
    }
    default:
      break;
  }
  dismissTextOverlayCard();
}

export { isTextOverlayTriggersActive };
