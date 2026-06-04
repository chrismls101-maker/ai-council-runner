import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAskTextFromMicDraft,
  composeCommandBarMicText,
  isMicrophoneCaptureMode,
  isSystemAudioCaptureMode,
  shouldAutoSendMicAfterSilence,
  shouldShowMicPermissionDenied,
} from "../shared/commandBarMic.ts";
import {
  initialTranscriptionState,
  transcriptionReducer,
} from "../shared/transcriptionTypes.ts";
import { stopMediaStreamState } from "../shared/systemAudioCapture.ts";

test("composeCommandBarMicText merges prefix, finalized, and interim", () => {
  assert.equal(composeCommandBarMicText("Hello", "world", " today"), "Hello world today");
  assert.equal(composeCommandBarMicText("", "only speech", ""), "only speech");
  assert.equal(composeCommandBarMicText("typed", "", "live"), "typed live");
});

test("buildAskTextFromMicDraft trims for Ask submit", () => {
  assert.equal(buildAskTextFromMicDraft("  hi ", "there ", "  "), "hi there");
});

test("mic starts only after user action — initial state not listening", () => {
  assert.equal(initialTranscriptionState.status, "idle");
  assert.equal(initialTranscriptionState.micDraftText, undefined);
  const afterStart = transcriptionReducer(
    { ...initialTranscriptionState, mode: "microphone_web_speech" },
    { type: "START_LISTENING" },
  );
  assert.equal(afterStart.status, "listening");
});

test("permission denied shows clear status helper", () => {
  assert.equal(
    shouldShowMicPermissionDenied({ micPermission: "denied", lastError: undefined }),
    true,
  );
  assert.equal(
    shouldShowMicPermissionDenied({
      micPermission: "not_requested",
      lastError: "Microphone permission denied.",
    }),
    true,
  );
  assert.equal(
    shouldShowMicPermissionDenied({ micPermission: "granted", lastError: undefined }),
    false,
  );
});

test("stop listening clears interim but keeps merged transcript in prefix", () => {
  let s = transcriptionReducer(initialTranscriptionState, {
    type: "SET_MIC_DRAFT_PREFIX",
    text: "Ask about",
  });
  s = transcriptionReducer(s, { type: "APPEND_MIC_DRAFT", text: "the error" });
  s = transcriptionReducer(s, { type: "SET_INTERIM", text: " on screen" });
  s = transcriptionReducer(s, { type: "STOP_LISTENING" });
  assert.equal(s.status, "idle");
  assert.equal(s.interimText, undefined);
  assert.equal(s.micDraftPrefix, "Ask about the error on screen");
  assert.equal(s.micDraftText, undefined);
});

test("transcript updates command input via compose helper", () => {
  const line = composeCommandBarMicText("prefix", "final words", "inter");
  assert.equal(line, "prefix final words inter");
});

test("Ask sends transcribed text from mic draft", () => {
  const askText = buildAskTextFromMicDraft("What is", "this error", undefined);
  assert.equal(askText, "What is this error");
});

test("auto-send after silence default off", () => {
  assert.equal(shouldAutoSendMicAfterSilence(false, "hello"), false);
  assert.equal(shouldAutoSendMicAfterSilence(true, ""), false);
  assert.equal(shouldAutoSendMicAfterSilence(true, "hello world"), true);
});

test("microphone mode distinct from system audio", () => {
  assert.equal(
    isMicrophoneCaptureMode("microphone_web_speech", "microphone_web_speech"),
    true,
  );
  assert.equal(isSystemAudioCaptureMode("system_audio", "system_audio"), true);
  assert.equal(
    isMicrophoneCaptureMode("system_audio", "system_audio"),
    false,
  );
});

test("stop listening clears active media tracks", () => {
  let stopped = 0;
  const tracks = [{ stop: () => { stopped += 1; } }, { stop: () => { stopped += 1; } }];
  stopMediaStreamState(tracks);
  assert.equal(stopped, 2);
});
