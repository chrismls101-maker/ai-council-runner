/**
 * Ambient screen intelligence — passive digest loop.
 *
 * Takes a low-resolution screenshot every DIGEST_INTERVAL_MS, sends it to
 * the IIVO Vision API with a terse one-sentence prompt, and stores the
 * result in a callback so the main process can inject it into every ask.
 *
 * Designed to be invisible: runs silently, never blocks the UI, gracefully
 * handles permission failures, API unavailability, or rate limits.
 */

import type { GlassConfig } from "../shared/config.ts";
import { captureDisplayById } from "./capture.ts";
import { resolveAnthropicApiKey } from "./anthropicKeyStore.ts";
import { optimizeVisualAskImage } from "./visualImageOptimizer.ts";
import { askIivoGlass } from "./glassAskClient.ts";

/** How often to run the digest (ms). 60 s is fast enough to be fresh. */
const DIGEST_INTERVAL_MS = 60_000;

/** Delay before the first digest after the loop starts (ms). */
const DIGEST_INITIAL_DELAY_MS = 60_000;

/** How long a digest result stays "fresh" before being discarded (ms). */
const DIGEST_MAX_AGE_MS = 3 * 60_000;

/**
 * Terse prompt — we want a single sentence, nothing more.
 * Vision sees the whole screen; we just want a label for what's happening.
 */
const DIGEST_PROMPT =
  "In one short sentence (under 20 words), describe what the user is currently working on based on what you see on screen. Be concrete: mention the app, file, or task. Do not start with 'The user'.";

export interface ScreenDigestResult {
  text: string;
  capturedAt: number; // Unix ms
}

export interface ScreenDigestCallbacks {
  /** Called when a new digest is available. */
  onDigest: (result: ScreenDigestResult) => void;
  /** Called when a digest fails (permission, network, etc). */
  onError?: (err: unknown) => void;
  /** Returns the display id + label to capture. */
  resolveCaptureTarget: () => { id: number; label: string };
  /** Returns the current GlassConfig for the API call. */
  getConfig: () => GlassConfig;
  /** When false, skip capture/API work (idle CPU savings). */
  shouldRun?: () => boolean;
}

/**
 * Starts the passive digest loop. Returns a stop function.
 * Safe to call multiple times — only the first call starts the loop.
 */
export function startScreenDigestLoop(callbacks: ScreenDigestCallbacks): () => void {
  let stopped = false;
  let running = false;

  async function runDigest(): Promise<void> {
    if (running || stopped) return;
    if (callbacks.shouldRun && !callbacks.shouldRun()) return;
    if (!resolveAnthropicApiKey()) return;
    running = true;
    try {
      const target = callbacks.resolveCaptureTarget();
      const shot = await captureDisplayById(target.id, target.label);

      // Use aggressive compression — we only need enough detail for a
      // one-sentence label, not a detailed analysis.
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
  }

  // Run once immediately (after a short delay so app is fully ready),
  // then on interval.
  const initialTimer = setTimeout(() => {
    if (!stopped) void runDigest();
  }, DIGEST_INITIAL_DELAY_MS);

  const intervalTimer = setInterval(() => {
    if (!stopped) void runDigest();
  }, DIGEST_INTERVAL_MS);

  return () => {
    stopped = true;
    clearTimeout(initialTimer);
    clearInterval(intervalTimer);
  };
}

/** Returns true if a digest result is still fresh enough to use. */
export function isDigestFresh(result: ScreenDigestResult | undefined): result is ScreenDigestResult {
  if (!result) return false;
  return Date.now() - result.capturedAt < DIGEST_MAX_AGE_MS;
}

export { DIGEST_MAX_AGE_MS, DIGEST_INITIAL_DELAY_MS, DIGEST_INTERVAL_MS };
