import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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
import { COMMAND_BAR_HEIGHT, COMMAND_BAR_MIN_WINDOW_HEIGHT } from "../shared/glassLayoutMath.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

test("command bar window height fits accessory strips above the composer pill", () => {
  assert.ok(
    COMMAND_BAR_MIN_WINDOW_HEIGHT >= 58,
    "command bar window must fit the composer row without a tall dead zone",
  );
  assert.ok(COMMAND_BAR_HEIGHT >= 240, "command bar window must fit stacked accessories when expanded");
  const commandBar = readFileSync(join(ROOT, "renderer", "command", "CommandBar.tsx"), "utf8");
  assert.ok(commandBar.includes("command-bar-stack"), "stack wrapper present");
  assert.ok(commandBar.includes("command-bar-accessories"), "accessories sit above pill");
  assert.ok(commandBar.includes('data-testid="glass-command-bar-stack"'), "stack test id for e2e");
  assert.ok(commandBar.includes("<VoiceModePanel />"), "voice panel in accessory stack");
  assert.ok(commandBar.includes('data-testid="glass-command-translate"'), "Translate on command bar");
  // Translate pill was removed in v0.1.16 overhaul — button uses command-translate-btn--active now.
  assert.ok(commandBar.includes("command-translate-btn--active"), "Translate active state class on button");
  assert.ok(commandBar.includes('"glass-command-translate"'), "Translate button test id present");
  assert.ok(commandBar.includes("prepareGlassTextContextMenu"), "native context menu helper on input");
  assert.ok(commandBar.includes("prepareGlassTextPointerDown"), "right-click disables click-through");
});

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
