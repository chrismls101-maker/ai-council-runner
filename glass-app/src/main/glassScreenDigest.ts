/**
 * Ambient screen intelligence — passive digest loop + reading-idle text overlay probe.
 *
 * Takes a low-resolution screenshot every DIGEST_INTERVAL_MS, sends it to
 * the IIVO Vision API with a terse one-sentence prompt, and stores the
 * result in a callback so the main process can inject it into every ask.
 *
 * When text overlay is enabled, a secondary ambient pass runs at most every
 * AMBIENT_INTERVAL_MS, and only when the user has been reading-idle for 45s
 * AND the frontmost app changed since the last probe.
 */

import { screen } from "electron";
import type { GlassConfig } from "../shared/config.ts";
import type { TextContentType } from "../shared/textOverlayTypes.ts";
import {
  isGlassAppName,
  isPrivacyApp,
  parseAmbientReadingJson,
} from "../shared/textOverlayTypes.ts";
import { captureDisplayById } from "./capture.ts";
import { resolveAnthropicApiKey } from "./anthropicKeyStore.ts";
import { optimizeVisualAskImage } from "./visualImageOptimizer.ts";
import { askIivoGlass } from "./glassAskClient.ts";
import { getLastKeystrokeAt } from "./glassTypingKeystrokeMonitor.ts";
import { getLastScrollChangeAt, fireAmbientTextOverlayTrigger } from "./textOverlayTrigger.ts";
import { listApiKeys, getApiKeyValue } from "./apiKeyStore.ts";

/** How often to run the working-context digest (ms). */
const DIGEST_INTERVAL_MS = 60_000;

/** Delay before the first digest after the loop starts (ms). */
const DIGEST_INITIAL_DELAY_MS = 60_000;

/**
 * Ambient reading intelligence interval (ms). 60s minimum — the probe
 * additionally requires a frontmost-app change and 45s of reading idle,
 * so it fires far less often than the interval.
 */
export const AMBIENT_INTERVAL_MS = 60_000;

/** How long a digest result stays "fresh" before being discarded (ms). */
const DIGEST_MAX_AGE_MS = 3 * 60_000;

/** User must be reading-idle (no input, no scroll) at least this long before an ambient probe. */
const READING_IDLE_KEYSTROKE_MS = 45_000;
const READING_IDLE_SCROLL_MS = 45_000;

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const AMBIENT_PROBE_TIMEOUT_MS = 12_000;

const DIGEST_PROMPT =
  "In one short sentence (under 20 words), describe what the user is currently working on based on what you see on screen. Be concrete: mention the app, file, or task. Do not start with 'The user'.";

const AMBIENT_READING_PROMPT = `Look at this screenshot. Is there any text visible that most people would find difficult to understand — legal language, medical terminology, financial jargon, technical errors, foreign language, or dense academic writing? If yes, extract the most complex single unit of text (one clause, one term, one sentence — the hardest thing on screen). If no, respond with SKIP. Respond as JSON: { "found": boolean, "text": string | null, "contentType": "legal_contract" | "technical_doc" | "email" | "financial_doc" | "foreign_language" | "medical_health" | "research_paper" | "regulatory_compliance" | "earnings_transcript" | "meeting_notes" | "other" | null }`;

export interface ScreenDigestResult {
  text: string;
  capturedAt: number;
}

export interface ScreenDigestCallbacks {
  onDigest: (result: ScreenDigestResult) => void;
  onError?: (err: unknown) => void;
  resolveCaptureTarget: () => { id: number; label: string };
  getConfig: () => GlassConfig;
  /** When false, skip companion working-context digest. */
  shouldRun?: () => boolean;
  /** When false, skip ambient reading intelligence pass. */
  shouldRunAmbient?: () => boolean;
  getActiveApp?: () => string | undefined;
  getPrivacyApps?: () => readonly string[];
  isOverlayCardVisible?: () => boolean;
}

let ambientCallbacks: ScreenDigestCallbacks | null = null;
let ambientIntervalTimer: ReturnType<typeof setInterval> | null = null;
let ambientResetTimer: ReturnType<typeof setTimeout> | null = null;
let ambientRunning = false;
let digestStopped = false;

function resolveAnthropicKeyDirect(): string | null {
  const fromStore = resolveAnthropicApiKey();
  if (fromStore) return fromStore;
  const keys = listApiKeys();
  for (const meta of keys) {
    if (meta.service.toLowerCase().includes("anthropic")) {
      const value = getApiKeyValue(meta.id);
      if (value) return value;
    }
  }
  return process.env.ANTHROPIC_API_KEY?.trim() ?? null;
}

function isReadingIdle(): boolean {
  const now = Date.now();
  const lastKey = getLastKeystrokeAt();
  if (lastKey > 0 && now - lastKey < READING_IDLE_KEYSTROKE_MS) return false;
  const lastScroll = getLastScrollChangeAt();
  if (lastScroll > 0 && now - lastScroll < READING_IDLE_SCROLL_MS) return false;
  return true;
}

/** Frontmost app at the time of the last ambient probe — probes only fire after an app change. */
let lastAmbientProbeApp: string | null = null;

function canRunAmbientProbe(callbacks: ScreenDigestCallbacks): boolean {
  if (digestStopped) return false;
  if (!callbacks.shouldRunAmbient?.()) return false;
  if (!isReadingIdle()) return false;
  if (callbacks.isOverlayCardVisible?.()) return false;

  const appName = callbacks.getActiveApp?.();
  if (isGlassAppName(appName)) return false;

  // Gate on app change — never burn a vision call re-probing the same context.
  if ((appName ?? null) === lastAmbientProbeApp) return false;

  const privacyApps = callbacks.getPrivacyApps?.() ?? [];
  if (isPrivacyApp(appName, privacyApps)) return false;

  return Boolean(resolveAnthropicKeyDirect());
}

async function probeAmbientComplexText(
  imageDataUrl: string,
  width: number,
  height: number,
): Promise<{ text: string; contentType: TextContentType } | null> {
  const apiKey = resolveAnthropicKeyDirect();
  if (!apiKey) return null;

  const optimized = optimizeVisualAskImage(
    imageDataUrl,
    { width, height },
    { prompt: AMBIENT_READING_PROMPT, preset: "aggressive" },
  );

  const match = /^data:([^;]+);base64,(.+)$/.exec(optimized.imageDataUrl.trim());
  const mediaType = match?.[1] ?? "image/jpeg";
  const base64 = match?.[2] ?? optimized.imageDataUrl;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AMBIENT_PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 320,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 },
              },
              { type: "text", text: AMBIENT_READING_PROMPT },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) return null;
    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const textBlock = data.content?.find((c) => c.type === "text")?.text?.trim() ?? "";
    if (!textBlock || textBlock.toUpperCase() === "SKIP") return null;

    const parsed = parseAmbientReadingJson(textBlock);
    if (!parsed?.found || !parsed.text) return null;

    return {
      text: parsed.text,
      contentType: parsed.contentType ?? "other",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function runAmbientReadingCheck(callbacks: ScreenDigestCallbacks): Promise<void> {
  if (ambientRunning || digestStopped) return;
  if (!canRunAmbientProbe(callbacks)) return;

  ambientRunning = true;
  try {
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const target = { id: display.id, label: `Display ${display.id}` };

    lastAmbientProbeApp = callbacks.getActiveApp?.() ?? null;

    // No hide/restore — the probe is gated on no overlay card being visible,
    // so the Glass overlay is fully transparent and never blinks the screen.
    const shot = await captureDisplayById(target.id, target.label);

    const found = await probeAmbientComplexText(shot.imageDataUrl, shot.width, shot.height);
    if (found) {
      fireAmbientTextOverlayTrigger({
        rawText: found.text,
        contentType: found.contentType,
      });
      resetAmbientReadingTimer();
    }
  } catch {
    /* silent — permission or network failure */
  } finally {
    ambientRunning = false;
  }
}

function clearAmbientTimers(): void {
  if (ambientIntervalTimer) {
    clearInterval(ambientIntervalTimer);
    ambientIntervalTimer = null;
  }
  if (ambientResetTimer) {
    clearTimeout(ambientResetTimer);
    ambientResetTimer = null;
  }
}

function startAmbientInterval(callbacks: ScreenDigestCallbacks): void {
  clearAmbientTimers();
  if (digestStopped || !callbacks.shouldRunAmbient?.()) return;

  ambientCallbacks = callbacks;
  void runAmbientReadingCheck(callbacks);
  ambientIntervalTimer = setInterval(() => {
    if (!ambientCallbacks) return;
    void runAmbientReadingCheck(ambientCallbacks);
  }, AMBIENT_INTERVAL_MS);
}

/** Reset ambient probe timer — call when any non-ambient overlay trigger fires. */
export function resetAmbientReadingTimer(): void {
  if (digestStopped || !ambientCallbacks?.shouldRunAmbient?.()) return;
  clearAmbientTimers();
  ambientResetTimer = setTimeout(() => {
    ambientResetTimer = null;
    if (ambientCallbacks) startAmbientInterval(ambientCallbacks);
  }, AMBIENT_INTERVAL_MS);
}

function syncAmbientLoop(callbacks: ScreenDigestCallbacks): void {
  ambientCallbacks = callbacks;
  if (digestStopped || !callbacks.shouldRunAmbient?.()) {
    clearAmbientTimers();
    return;
  }
  if (!ambientIntervalTimer && !ambientResetTimer) {
    startAmbientInterval(callbacks);
  }
}

/** Restart ambient interval when text overlay is toggled on or off. */
export function kickAmbientReadingLoop(): void {
  if (!ambientCallbacks) return;
  if (digestStopped || !ambientCallbacks.shouldRunAmbient?.()) {
    clearAmbientTimers();
    return;
  }
  startAmbientInterval(ambientCallbacks);
}

export function startScreenDigestLoop(callbacks: ScreenDigestCallbacks): () => void {
  let stopped = false;
  let running = false;
  digestStopped = false;
  ambientCallbacks = callbacks;

  async function runDigest(): Promise<void> {
    if (running || stopped) return;
    if (callbacks.shouldRun && !callbacks.shouldRun()) return;
    if (!resolveAnthropicApiKey()) return;
    running = true;
    try {
      const target = callbacks.resolveCaptureTarget();
      const shot = await captureDisplayById(target.id, target.label);

      const optimized = optimizeVisualAskImage(
        shot.imageDataUrl,
        { width: shot.width, height: shot.height },
        { prompt: DIGEST_PROMPT, preset: "aggressive" },
      );

      const response = await askIivoGlass(callbacks.getConfig(), {
        prompt: DIGEST_PROMPT,
        visualIntent: true,
        responseStyle: "overlay",
        modelPurpose: "semantic",
        latestScreenshot: {
          imageDataUrl: optimized.imageDataUrl,
          label: target.label,
          capturedAt: new Date().toISOString(),
          optimizedWidth: optimized.optimizedWidth,
          optimizedHeight: optimized.optimizedHeight,
        },
      });

      const text = response.answer?.trim();
      if (text && text.length > 0 && text.length < 200) {
        callbacks.onDigest({ text, capturedAt: Date.now() });
      }
    } catch (err) {
      callbacks.onError?.(err);
    } finally {
      running = false;
    }

    if (!stopped) {
      syncAmbientLoop(callbacks);
    }
  }

  const initialTimer = setTimeout(() => {
    if (!stopped) void runDigest();
  }, DIGEST_INITIAL_DELAY_MS);

  const intervalTimer = setInterval(() => {
    if (!stopped) void runDigest();
  }, DIGEST_INTERVAL_MS);

  syncAmbientLoop(callbacks);

  return () => {
    stopped = true;
    digestStopped = true;
    clearTimeout(initialTimer);
    clearInterval(intervalTimer);
    clearAmbientTimers();
    ambientCallbacks = null;
  };
}

export function isDigestFresh(result: ScreenDigestResult | undefined): result is ScreenDigestResult {
  if (!result) return false;
  return Date.now() - result.capturedAt < DIGEST_MAX_AGE_MS;
}

export { DIGEST_MAX_AGE_MS, DIGEST_INITIAL_DELAY_MS, DIGEST_INTERVAL_MS };
