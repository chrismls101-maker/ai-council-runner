import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cancelAskCommand,
  stopEverythingCommand,
  voiceModeStatusLabel,
  voiceRouteLabel,
  voiceRouteToCommands,
  voiceSubmitPlan,
} from "../shared/voiceModeActions.ts";
import {
  clearVoiceModeAutoSubmit,
  isVoiceModeActive,
  setVoiceModeAutoSubmit,
  voiceModeHandleAutoSubmit,
} from "../shared/voiceModeBridge.ts";

test("final transcript routes to a direct ask submit-command", () => {
  const plan = voiceSubmitPlan("What matters here?");
  assert.equal(plan.route, "direct");
  assert.deepEqual(plan.commands, [{ type: "submit-command", text: "What matters here?" }]);
});

test("explicit screen transcript routes to a visual submit-command", () => {
  const plan = voiceSubmitPlan("What do you see on my screen?");
  assert.equal(plan.route, "visual");
  // Main captures the screen itself on visual phrasing.
  assert.deepEqual(plan.commands, [
    { type: "submit-command", text: "What do you see on my screen?" },
  ]);
});

test('"I\'m done" routes to the debrief command', () => {
  const plan = voiceSubmitPlan("Okay, I'm done.");
  assert.equal(plan.route, "debrief");
  assert.deepEqual(plan.commands, [{ type: "copilot-generate-debrief" }]);
});

test("empty transcript produces no commands", () => {
  assert.deepEqual(voiceRouteToCommands("direct", "   "), []);
});

test("stop everything + cancel map to their commands", () => {
  assert.deepEqual(stopEverythingCommand(), { type: "stop-everything" });
  assert.deepEqual(cancelAskCommand(), { type: "cancel-glass-ask" });
});

test("status labels cover every machine state", () => {
  assert.equal(voiceModeStatusLabel("listening"), "Listening…");
  assert.equal(voiceModeStatusLabel("transcribing"), "Transcribing…");
  assert.equal(voiceModeStatusLabel("deciding"), "Deciding route…");
  assert.equal(voiceModeStatusLabel("looking"), "Looking…");
  assert.equal(voiceModeStatusLabel("thinking"), "Thinking…");
  assert.equal(voiceModeStatusLabel("answering"), "Answering…");
  assert.equal(voiceModeStatusLabel("error"), "Error");
  assert.equal(voiceModeStatusLabel("stopped"), "Stopped");
  assert.equal(voiceRouteLabel("visual"), "Screen ask");
  assert.equal(voiceRouteLabel("debrief"), "Debrief");
  assert.equal(voiceRouteLabel("direct"), "Direct ask");
});

test("bridge hands off auto-submit only while active", () => {
  clearVoiceModeAutoSubmit();
  assert.equal(isVoiceModeActive(), false);
  // Inactive: legacy path keeps ownership.
  assert.equal(voiceModeHandleAutoSubmit("hello"), false);

  let captured: string | null = null;
  setVoiceModeAutoSubmit((draft) => {
    captured = draft;
    return true;
  });
  assert.equal(isVoiceModeActive(), true);
  assert.equal(voiceModeHandleAutoSubmit("summarize this"), true);
  assert.equal(captured, "summarize this");
  // Blank drafts are not consumed.
  assert.equal(voiceModeHandleAutoSubmit("   "), false);

  clearVoiceModeAutoSubmit();
  assert.equal(isVoiceModeActive(), false);
});
