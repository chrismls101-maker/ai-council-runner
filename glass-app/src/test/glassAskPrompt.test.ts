import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGlassAskUserText, extractGlassAskVideoWatchBlocks } from "../main/glassAskPrompt.ts";
import type { GlassAskRequest } from "../shared/glassAskTypes.ts";
import {
  createVideoWatchBuffer,
  shouldOmitSessionTranscriptForWatch,
} from "../shared/aletheiaVideoWatchMode.ts";

test("buildGlassAskUserText includes sessionTranscriptWindow when provided", () => {
  const request: GlassAskRequest = {
    prompt: "What did they just say about pricing?",
    sessionTranscriptWindow: "[you] The budget is tight.\n[them-1] We can't move on price.",
  };
  const text = buildGlassAskUserText(request);
  assert.match(text, /Recent conversation transcript \(last ~60 seconds, newest last\)/);
  assert.match(text, /\[you\] The budget is tight/);
  assert.match(text, /\[them-1\] We can't move on price/);
  assert.match(text, /What did they just say about pricing/);
});

test("buildGlassAskUserText unchanged when sessionTranscriptWindow absent", () => {
  const request: GlassAskRequest = {
    prompt: "Hello there",
  };
  const text = buildGlassAskUserText(request);
  assert.equal(text, "Hello there");
  assert.doesNotMatch(text, /Recent conversation transcript/);
});

test("extractGlassAskVideoWatchBlocks includes frames and transcript", () => {
  const buffer = createVideoWatchBuffer(1, Date.now());
  buffer.transcriptWindow = "[them-1] Did you catch that?";
  buffer.frames.push({
    capturedAt: Date.now(),
    base64Jpeg: "abc123",
    diffScore: 0.4,
  });
  const blocks = extractGlassAskVideoWatchBlocks({
    prompt: "What just happened?",
    videoWatchBuffer: buffer,
  });
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]?.type, "image");
  assert.match(String((blocks[1] as { text: string }).text), /Recent video transcript/);
  assert.match(String((blocks[1] as { text: string }).text), /Did you catch that/);
});

test("shouldOmitSessionTranscriptForWatch prevents duplicate session window on ask", () => {
  const buffer = createVideoWatchBuffer(1, Date.now());
  buffer.transcriptWindow = "[them-1] same text";
  const sessionWindow = "[them-1] same text";
  assert.equal(shouldOmitSessionTranscriptForWatch(buffer), true);
  const request: GlassAskRequest = {
    prompt: "What happened?",
    ...(shouldOmitSessionTranscriptForWatch(buffer) ? {} : { sessionTranscriptWindow: sessionWindow }),
    videoWatchBuffer: buffer,
  };
  const text = buildGlassAskUserText(request);
  assert.doesNotMatch(text, /Recent conversation transcript/);
  assert.match(text, /What happened/);
});
