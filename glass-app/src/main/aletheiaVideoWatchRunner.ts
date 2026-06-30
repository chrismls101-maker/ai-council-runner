/**
 * Aletheia Video Watch Mode — Electron main capture loop and buffer wiring.
 */

import { desktopCapturer, screen } from "electron";
import {
  appendWatchFrame,
  computeFrameDiff,
  createVideoWatchBuffer,
  shouldCaptureFrame,
  type VideoWatchBuffer,
  type VideoWatchProactiveCommentaryHook,
} from "../shared/aletheiaVideoWatchMode.ts";

const CAPTURE_INTERVAL_MS = 2_500;
const TRANSCRIPT_REFRESH_MS = 1_000;
const MAX_FRAME_DIMENSION = 512;
const JPEG_QUALITY = 75;

/** 1×1 JPEG stub for E2E (no Screen Recording permission). */
const E2E_STUB_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQCEAwEPwAB//9k=";

export interface VideoWatchRunnerDeps {
  getTranscriptWindow: () => string;
  ensureListenAudioActive: () => void;
}

let deps: VideoWatchRunnerDeps | null = null;
let currentBuffer: VideoWatchBuffer | null = null;
let captureIntervalId: ReturnType<typeof setInterval> | null = null;
let transcriptIntervalId: ReturnType<typeof setInterval> | null = null;
let activeDisplayId: number | null = null;
let lastSampledBase64: string | null = null;
let proactiveCommentaryHook: VideoWatchProactiveCommentaryHook | null = null;
let onWatchAudioStart: (() => void) | null = null;
let onWatchAudioStop: (() => void) | null = null;

export function setVideoWatchAudioLifecycleHooks(hooks: {
  onStart?: () => void;
  onStop?: () => void;
}): void {
  onWatchAudioStart = hooks.onStart ?? null;
  onWatchAudioStop = hooks.onStop ?? null;
}

export function initVideoWatchRunner(runnerDeps: VideoWatchRunnerDeps): void {
  deps = runnerDeps;
}

export function setVideoWatchProactiveCommentaryHook(
  hook: VideoWatchProactiveCommentaryHook | null,
): void {
  proactiveCommentaryHook = hook;
}

export function isVideoWatchModeActive(): boolean {
  return currentBuffer != null;
}

async function captureWatchDisplayFrame(displayId: number): Promise<string | null> {
  if (process.env.IIVO_GLASS_E2E === "1") {
    return E2E_STUB_JPEG_BASE64;
  }

  try {
    const display =
      screen.getAllDisplays().find((d) => d.id === displayId) ?? screen.getPrimaryDisplay();
    const scale = display.scaleFactor || 1;
    const nativeWidth = Math.max(1, Math.round(display.size.width * scale));
    const nativeHeight = Math.max(1, Math.round(display.size.height * scale));

    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: nativeWidth, height: nativeHeight },
    });
    if (sources.length === 0) return null;

    const targetId = String(display.id);
    const source = sources.find((s) => s.display_id === targetId) ?? sources[0];
    if (!source?.thumbnail || source.thumbnail.isEmpty()) return null;

    let image: Electron.NativeImage = source.thumbnail;
    const size = image.getSize();
    const maxEdge = Math.max(size.width, size.height, 1);
    if (maxEdge > MAX_FRAME_DIMENSION) {
      const scaleDown = MAX_FRAME_DIMENSION / maxEdge;
      image = image.resize({
        width: Math.max(1, Math.round(size.width * scaleDown)),
        height: Math.max(1, Math.round(size.height * scaleDown)),
      });
    }

    const jpegBuffer = image.toJPEG(JPEG_QUALITY);
    return Buffer.from(jpegBuffer).toString("base64");
  } catch (err) {
    console.warn("[video-watch] capture failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

function refreshTranscriptWindow(): void {
  if (!currentBuffer || !deps) return;
  try {
    currentBuffer.transcriptWindow = deps.getTranscriptWindow();
  } catch (err) {
    console.warn(
      "[video-watch] transcript refresh failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

async function captureTick(): Promise<void> {
  if (!currentBuffer || activeDisplayId == null) return;

  const capturedAt = Date.now();
  const base64Jpeg = await captureWatchDisplayFrame(activeDisplayId);
  if (!base64Jpeg) return;

  const diffScore = computeFrameDiff(lastSampledBase64, base64Jpeg);
  lastSampledBase64 = base64Jpeg;
  if (shouldCaptureFrame(diffScore)) {
    appendWatchFrame(currentBuffer, { capturedAt, base64Jpeg, diffScore });
    if (proactiveCommentaryHook) {
      try {
        proactiveCommentaryHook(currentBuffer);
      } catch {
        /* hook errors must not break capture */
      }
    }
  }
}

function clearIntervals(): void {
  if (captureIntervalId != null) {
    clearInterval(captureIntervalId);
    captureIntervalId = null;
  }
  if (transcriptIntervalId != null) {
    clearInterval(transcriptIntervalId);
    transcriptIntervalId = null;
  }
}

export function startVideoWatchMode(displayId: number): void {
  stopVideoWatchMode();

  activeDisplayId = displayId;
  lastSampledBase64 = null;
  const now = Date.now();
  currentBuffer = createVideoWatchBuffer(displayId, now);
  currentBuffer.activeDisplayId = displayId;

  deps?.ensureListenAudioActive();
  refreshTranscriptWindow();
  onWatchAudioStart?.();

  captureIntervalId = setInterval(() => {
    void captureTick();
  }, CAPTURE_INTERVAL_MS);
  transcriptIntervalId = setInterval(refreshTranscriptWindow, TRANSCRIPT_REFRESH_MS);

  void captureTick();
}

export function stopVideoWatchMode(): void {
  clearIntervals();
  activeDisplayId = null;
  currentBuffer = null;
  lastSampledBase64 = null;
  onWatchAudioStop?.();
}

export function getVideoWatchBuffer(): VideoWatchBuffer | null {
  return currentBuffer;
}

export function getVideoWatchStatus(): {
  active: boolean;
  frameCount: number;
  lastFrameAt: number | null;
} {
  return {
    active: currentBuffer != null,
    frameCount: currentBuffer?.frames.length ?? 0,
    lastFrameAt: currentBuffer?.lastFrameAt ?? null,
  };
}
