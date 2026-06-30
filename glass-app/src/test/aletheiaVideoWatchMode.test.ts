import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendWatchFrame,
  buildVideoWatchPromptContext,
  computeFrameDiff,
  computeGrayscaleDiff,
  createVideoWatchBuffer,
  isMeetingsDeepgramResumeEligible,
  registerVideoWatchFrameDecoder,
  shouldCaptureFrame,
  shouldOmitSessionTranscriptForWatch,
  shouldResumeSystemAudioCapture,
  VIDEO_WATCH_DIFF_HEIGHT,
  VIDEO_WATCH_DIFF_WIDTH,
  resolveDeepgramFragmentRoute,
  resolveDeepgramFallbackScope,
} from "../shared/aletheiaVideoWatchMode.ts";

const PIXEL_COUNT = VIDEO_WATCH_DIFF_WIDTH * VIDEO_WATCH_DIFF_HEIGHT;

function lumaFill(value: number): Uint8Array {
  return new Uint8Array(PIXEL_COUNT).fill(value);
}

registerVideoWatchFrameDecoder((token: string): Uint8Array | null => {
  if (token === "dark") return lumaFill(0);
  if (token === "bright") return lumaFill(255);
  if (token === "mid") return lumaFill(128);
  return null;
});

test("createVideoWatchBuffer returns empty buffer", () => {
  const buffer = createVideoWatchBuffer(null, 1_000);
  assert.deepEqual(buffer.frames, []);
  assert.equal(buffer.transcriptWindow, "");
  assert.equal(buffer.activeDisplayId, null);
  assert.equal(buffer.watchStartedAt, 1_000);
  assert.equal(buffer.lastFrameAt, 0);
});

test("appendWatchFrame keeps FIFO max frames", () => {
  const buffer = createVideoWatchBuffer(42, 1_000);
  for (let i = 0; i < 10; i++) {
    appendWatchFrame(
      buffer,
      { capturedAt: 1_000 + i, base64Jpeg: `f${i}`, diffScore: 1 },
      8,
    );
  }
  assert.equal(buffer.frames.length, 8);
  assert.equal(buffer.frames[0]?.base64Jpeg, "f2");
  assert.equal(buffer.frames[7]?.base64Jpeg, "f9");
  assert.equal(buffer.lastFrameAt, 1_009);
});

test("computeGrayscaleDiff returns 1 for first frame semantics", () => {
  const next = lumaFill(200);
  assert.equal(computeGrayscaleDiff(null, next), 1);
});

test("computeGrayscaleDiff normalizes pixel change", () => {
  const prev = lumaFill(0);
  const next = lumaFill(255);
  assert.equal(computeGrayscaleDiff(prev, next), 1);
  const half = lumaFill(128);
  assert.ok(Math.abs(computeGrayscaleDiff(prev, half) - 128 / 255) < 0.001);
});

test("computeFrameDiff uses registered decoder", () => {
  assert.equal(computeFrameDiff(null, "bright"), 1);
  assert.equal(computeFrameDiff("dark", "bright"), 1);
  assert.equal(computeFrameDiff("mid", "mid"), 0);
});

test("shouldCaptureFrame respects threshold", () => {
  assert.equal(shouldCaptureFrame(0.11), false);
  assert.equal(shouldCaptureFrame(0.12), true);
  assert.equal(shouldCaptureFrame(0.5, 0.3), true);
});

test("buildVideoWatchPromptContext returns last N frames and transcript", () => {
  const buffer = createVideoWatchBuffer(7, 1_000);
  buffer.transcriptWindow = "[them-1] Hello world";
  for (let i = 0; i < 6; i++) {
    buffer.frames.push({
      capturedAt: i,
      base64Jpeg: `frame-${i}`,
      diffScore: 0.5,
    });
  }
  const ctx = buildVideoWatchPromptContext(buffer, 4);
  assert.equal(ctx.frames.length, 4);
  assert.equal(ctx.frames[0]?.base64Jpeg, "frame-2");
  assert.equal(ctx.frames[3]?.base64Jpeg, "frame-5");
  assert.equal(ctx.transcriptWindow, "[them-1] Hello world");
});

test("shouldOmitSessionTranscriptForWatch when transcriptWindow is non-empty", () => {
  const buffer = createVideoWatchBuffer(1, Date.now());
  buffer.transcriptWindow = "[you] hello";
  assert.equal(shouldOmitSessionTranscriptForWatch(buffer), true);
  assert.equal(shouldOmitSessionTranscriptForWatch(null), false);
  assert.equal(shouldOmitSessionTranscriptForWatch(createVideoWatchBuffer()), false);
});

test("shouldResumeSystemAudioCapture when pipeline eligible and not listening", () => {
  assert.equal(
    shouldResumeSystemAudioCapture({
      pipelineEligible: true,
      transcriptionMode: "system_audio",
      listening: false,
    }),
    true,
  );
  assert.equal(
    shouldResumeSystemAudioCapture({
      pipelineEligible: true,
      transcriptionMode: "system_audio",
      listening: true,
    }),
    false,
  );
  assert.equal(
    shouldResumeSystemAudioCapture({
      pipelineEligible: false,
      transcriptionMode: "system_audio",
      listening: false,
    }),
    false,
  );
});

test("isMeetingsDeepgramResumeEligible requires meeting_call and live session", () => {
  assert.equal(isMeetingsDeepgramResumeEligible("meeting_call", "coaching", true), true);
  assert.equal(isMeetingsDeepgramResumeEligible("meeting_call", "off", true), false);
  assert.equal(isMeetingsDeepgramResumeEligible("video_learning", "coaching", true), false);
  assert.equal(isMeetingsDeepgramResumeEligible("meeting_call", "coaching", false), false);
});

test("resolveDeepgramFragmentRoute prefers meetings over watch", () => {
  assert.equal(
    resolveDeepgramFragmentRoute({
      meetingsPipeline: true,
      listenNotesPipeline: false,
      videoWatchActive: true,
    }),
    "meetings",
  );
  assert.equal(
    resolveDeepgramFragmentRoute({
      meetingsPipeline: false,
      listenNotesPipeline: false,
      videoWatchActive: true,
    }),
    "listen",
  );
});

test("resolveDeepgramFallbackScope uses watch scope for watch-only", () => {
  assert.equal(
    resolveDeepgramFallbackScope({
      meetingsPipeline: false,
      listenNotesPipeline: false,
      videoWatchActive: true,
    }),
    "watch",
  );
  assert.equal(
    resolveDeepgramFallbackScope({
      meetingsPipeline: true,
      listenNotesPipeline: false,
      videoWatchActive: true,
    }),
    "meetings",
  );
});
