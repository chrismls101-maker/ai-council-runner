import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialVoiceModeState,
  resolveVoiceRoute,
  voiceModeReducer,
  voiceModeIsBusy,
  voiceModeMicShouldRun,
  type VoiceModeState,
} from "../shared/voiceModeState.ts";

function start(): VoiceModeState {
  return voiceModeReducer(initialVoiceModeState, { type: "START" });
}

test("no listening on launch — initial state is idle and mic off", () => {
  assert.equal(initialVoiceModeState.status, "idle");
  assert.equal(initialVoiceModeState.active, false);
  assert.equal(initialVoiceModeState.micActive, false);
  assert.equal(voiceModeMicShouldRun(initialVoiceModeState), false);
});

test("start voice mode → listening with mic active", () => {
  const s = start();
  assert.equal(s.active, true);
  assert.equal(s.status, "listening");
  assert.equal(s.micActive, true);
  assert.equal(voiceModeMicShouldRun(s), true);
});

test("mic permission denied → error, mic off", () => {
  const s = voiceModeReducer(start(), {
    type: "MIC_DENIED",
    message: "Microphone permission denied.",
  });
  assert.equal(s.status, "error");
  assert.equal(s.micActive, false);
  assert.match(s.error ?? "", /permission denied/i);
  assert.equal(voiceModeMicShouldRun(s), false);
});

test("transcript produced is accumulated while listening", () => {
  let s = start();
  s = voiceModeReducer(s, { type: "INTERIM", text: "summarize what" });
  assert.equal(s.interim, "summarize what");
  s = voiceModeReducer(s, { type: "TRANSCRIPT", text: "Summarize what I am doing." });
  assert.equal(s.status, "listening");
  assert.equal(s.transcript, "Summarize what I am doing.");
  assert.equal(s.interim, "");
});

test("transcript submits to direct ask", () => {
  let s = start();
  s = voiceModeReducer(s, { type: "TRANSCRIPT", text: "What matters here?" });
  s = voiceModeReducer(s, { type: "SUBMIT" });
  assert.equal(s.route, "direct");
  assert.equal(s.status, "deciding");
  s = voiceModeReducer(s, { type: "THINKING" });
  assert.equal(s.status, "thinking");
});

test("explicit screen transcript submits to visual ask (looking phase)", () => {
  let s = start();
  s = voiceModeReducer(s, { type: "TRANSCRIPT", text: "What do you see on my screen?" });
  s = voiceModeReducer(s, { type: "SUBMIT" });
  assert.equal(s.route, "visual");
  s = voiceModeReducer(s, { type: "LOOKING" });
  assert.equal(s.status, "looking");
  s = voiceModeReducer(s, { type: "THINKING" });
  assert.equal(s.status, "thinking");
});

test('"I\'m done" triggers debrief route', () => {
  let s = start();
  s = voiceModeReducer(s, { type: "TRANSCRIPT", text: "Okay, I'm done." });
  s = voiceModeReducer(s, { type: "SUBMIT" });
  assert.equal(s.route, "debrief");
});

test("answer partial then done returns to listening for continuous loop", () => {
  let s = start();
  s = voiceModeReducer(s, { type: "TRANSCRIPT", text: "What should I do next?" });
  s = voiceModeReducer(s, { type: "SUBMIT" });
  s = voiceModeReducer(s, { type: "THINKING" });
  s = voiceModeReducer(s, { type: "ANSWER_PARTIAL", text: "Start with…" });
  assert.equal(s.status, "answering");
  assert.equal(s.answerPreview, "Start with…");
  s = voiceModeReducer(s, { type: "ANSWER_DONE" });
  assert.equal(s.status, "listening");
  assert.equal(s.transcript, "");
  assert.equal(s.answerPreview, undefined);
  assert.equal(s.active, true);
});

test("cancel interrupts pending ask and keeps listening", () => {
  let s = start();
  s = voiceModeReducer(s, { type: "TRANSCRIPT", text: "What is the risk?" });
  s = voiceModeReducer(s, { type: "SUBMIT" });
  s = voiceModeReducer(s, { type: "THINKING" });
  s = voiceModeReducer(s, { type: "CANCEL" });
  assert.equal(s.status, "listening");
  assert.equal(s.transcript, "");
  assert.equal(s.route, undefined);
});

test("stop everything clears all state", () => {
  let s = start();
  s = voiceModeReducer(s, { type: "TRANSCRIPT", text: "What do you see on my screen?" });
  s = voiceModeReducer(s, { type: "SUBMIT" });
  s = voiceModeReducer(s, { type: "LOOKING" });
  s = voiceModeReducer(s, { type: "STOP_EVERYTHING" });
  assert.equal(s.status, "stopped");
  assert.equal(s.active, false);
  assert.equal(s.micActive, false);
  assert.equal(s.transcript, "");
  assert.equal(s.route, undefined);
  assert.equal(s.answerPreview, undefined);
  assert.equal(voiceModeMicShouldRun(s), false);
});

test("events are ignored when voice mode is not active", () => {
  const s = voiceModeReducer(initialVoiceModeState, { type: "TRANSCRIPT", text: "hi" });
  assert.equal(s.status, "idle");
  assert.equal(s.transcript, "");
});

test("resolveVoiceRoute classifies routes", () => {
  assert.equal(resolveVoiceRoute("What matters here?"), "direct");
  assert.equal(resolveVoiceRoute("Summarize this"), "direct");
  assert.equal(resolveVoiceRoute("What do you see on my screen?"), "visual");
  assert.equal(resolveVoiceRoute("read this error"), "visual");
  assert.equal(resolveVoiceRoute("I'm done"), "debrief");
  assert.equal(resolveVoiceRoute(""), "direct");
});

test("voiceModeIsBusy reflects in-flight ask phases", () => {
  let s = start();
  assert.equal(voiceModeIsBusy(s), false);
  s = voiceModeReducer(s, { type: "TRANSCRIPT", text: "What is the risk?" });
  s = voiceModeReducer(s, { type: "SUBMIT" });
  assert.equal(voiceModeIsBusy(s), true);
  s = voiceModeReducer(s, { type: "THINKING" });
  assert.equal(voiceModeIsBusy(s), true);
  s = voiceModeReducer(s, { type: "ANSWER_DONE" });
  assert.equal(voiceModeIsBusy(s), false);
});
