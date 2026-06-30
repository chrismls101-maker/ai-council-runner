/**
 * Aletheia Video Watch Mode — pure types and buffer utilities (no Electron).
 */

import type { DeepgramWhisperFallbackScope } from "./deepgramWhisperFallbackPlan.ts";

export type DeepgramFragmentRoute = "meetings" | "listen" | "none";

/** Meetings pipeline wins over listen/watch when both are active. */
export function resolveDeepgramFragmentRoute(opts: {
  meetingsPipeline: boolean;
  listenNotesPipeline: boolean;
  videoWatchActive: boolean;
}): DeepgramFragmentRoute {
  if (opts.meetingsPipeline) return "meetings";
  if (opts.listenNotesPipeline || opts.videoWatchActive) return "listen";
  return "none";
}

export function resolveDeepgramFallbackScope(opts: {
  meetingsPipeline: boolean;
  listenNotesPipeline: boolean;
  videoWatchActive: boolean;
}): DeepgramWhisperFallbackScope {
  if (opts.meetingsPipeline) return "meetings";
  if (opts.listenNotesPipeline) return "listen";
  if (opts.videoWatchActive) return "watch";
  return "listen";
}

export interface VideoWatchFrame {
  capturedAt: number;
  base64Jpeg: string;
  diffScore: number;
}

export interface VideoWatchBuffer {
  frames: VideoWatchFrame[];
  transcriptWindow: string;
  activeDisplayId: number | null;
  watchStartedAt: number;
  lastFrameAt: number;
}

export const VIDEO_WATCH_DIFF_WIDTH = 64;
export const VIDEO_WATCH_DIFF_HEIGHT = 36;
export const VIDEO_WATCH_DEFAULT_DIFF_THRESHOLD = 0.12;
export const VIDEO_WATCH_DEFAULT_MAX_FRAMES = 8;
export const VIDEO_WATCH_PROMPT_FRAME_COUNT = 4;

type FrameDecoder = (base64Jpeg: string) => Uint8Array | null;

let frameDecoder: FrameDecoder | undefined;

/** Main process registers JPEG → luma decoder (nativeImage). Tests register fakes. */
export function registerVideoWatchFrameDecoder(decoder: FrameDecoder): void {
  frameDecoder = decoder;
}

export function createVideoWatchBuffer(
  activeDisplayId: number | null = null,
  nowMs = Date.now(),
): VideoWatchBuffer {
  return {
    frames: [],
    transcriptWindow: "",
    activeDisplayId,
    watchStartedAt: nowMs,
    lastFrameAt: 0,
  };
}

export function appendWatchFrame(
  buffer: VideoWatchBuffer,
  frame: VideoWatchFrame,
  maxFrames = VIDEO_WATCH_DEFAULT_MAX_FRAMES,
): VideoWatchBuffer {
  const frames = [...buffer.frames, frame];
  if (frames.length > maxFrames) {
    frames.splice(0, frames.length - maxFrames);
  }
  buffer.frames = frames;
  buffer.lastFrameAt = frame.capturedAt;
  return buffer;
}

export function computeGrayscaleDiff(prev: Uint8Array | null, next: Uint8Array): number {
  if (!prev || prev.length !== next.length || next.length === 0) return 1.0;
  let sum = 0;
  for (let i = 0; i < next.length; i++) {
    sum += Math.abs(next[i]! - prev[i]!);
  }
  return sum / (next.length * 255);
}

export function computeFrameDiff(prevBase64: string | null, nextBase64: string): number {
  if (!prevBase64) return 1.0;
  if (!frameDecoder) return 1.0;
  const next = frameDecoder(nextBase64);
  if (!next) return 1.0;
  const prev = frameDecoder(prevBase64);
  if (!prev) return 1.0;
  return computeGrayscaleDiff(prev, next);
}

export function shouldCaptureFrame(
  diffScore: number,
  threshold = VIDEO_WATCH_DEFAULT_DIFF_THRESHOLD,
): boolean {
  return diffScore >= threshold;
}

export function buildVideoWatchPromptContext(
  buffer: VideoWatchBuffer,
  maxFrames = VIDEO_WATCH_PROMPT_FRAME_COUNT,
): { frames: VideoWatchFrame[]; transcriptWindow: string } {
  const frames = buffer.frames.slice(-maxFrames);
  return {
    frames,
    transcriptWindow: buffer.transcriptWindow,
  };
}

/** Hook for future proactive commentary — not wired yet. */
export type VideoWatchProactiveCommentaryHook = (buffer: VideoWatchBuffer) => void;

/** Skip sessionTranscriptWindow when watch buffer already carries the rolling transcript. */
export function shouldOmitSessionTranscriptForWatch(
  watchBuffer: VideoWatchBuffer | null | undefined,
): boolean {
  return Boolean(watchBuffer?.transcriptWindow.trim());
}

/** Session-resume: restart system-audio capture when pipeline is active but listening is off. */
export function shouldResumeSystemAudioCapture(input: {
  pipelineEligible: boolean;
  transcriptionMode: string;
  listening: boolean;
}): boolean {
  return (
    input.pipelineEligible
    && input.transcriptionMode === "system_audio"
    && !input.listening
  );
}

export function isListenNotesResumeEligible(sessionType: string, copilotMode: string): boolean {
  return sessionType === "video_learning" && copilotMode !== "off";
}

export function isMeetingsDeepgramResumeEligible(
  sessionType: string,
  copilotMode: string,
  sessionLive: boolean,
): boolean {
  return sessionType === "meeting_call" && copilotMode !== "off" && sessionLive;
}
