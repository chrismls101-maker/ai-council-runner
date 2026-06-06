import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCopilotConfig } from "../shared/copilotConfig.ts";
import {
  INPUT_SOURCE_OPTIONS,
  SESSION_FOCUS_OPTIONS,
  inputSourceToTranscriptionMode,
  isListeningMediaFocus,
  resolveInputSource,
  sessionFocusLabel,
} from "../shared/copilotPanelModel.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

test("all session focus options map to valid copilot session type settings", () => {
  for (const opt of SESSION_FOCUS_OPTIONS) {
    const config = parseCopilotConfig({ sessionType: opt.value });
    assert.equal(config.sessionType, opt.value);
    assert.ok(opt.label.length > 0);
  }
});

test("Listening / Media focus maps to video_learning internally", () => {
  const media = SESSION_FOCUS_OPTIONS.find((o) => o.label === "Listening / Media");
  assert.ok(media);
  assert.equal(media!.value, "video_learning");
  assert.equal(isListeningMediaFocus("video_learning"), true);
  assert.equal(sessionFocusLabel("video_learning"), "Listening / Media");
});

test("input source none/mic/system map to transcription modes without auto-start", () => {
  assert.equal(inputSourceToTranscriptionMode("none"), "manual");
  assert.equal(inputSourceToTranscriptionMode("microphone"), "microphone_web_speech");
  assert.equal(inputSourceToTranscriptionMode("system_audio"), "system_audio");
  assert.equal(inputSourceToTranscriptionMode("screen"), "manual");
});

test("mixed input source resolves when listening with session context", () => {
  assert.equal(
    resolveInputSource({
      transcriptionMode: "system_audio",
      listening: true,
      capturing: false,
      hasSessionContext: true,
    }),
    "mixed",
  );
});

test("panel renders one consolidated Copilot section", () => {
  const panel = readFileSync(join(ROOT, "renderer", "panel", "Panel.tsx"), "utf8");
  const copilot = readFileSync(join(ROOT, "renderer", "panel", "CopilotPanel.tsx"), "utf8");
  assert.ok(panel.includes("CopilotPanel"), "Panel mounts consolidated Copilot section");
  assert.ok(!panel.includes("<CopilotConfigure"), "Session tab no longer hosts duplicate copilot block");
  // Advanced drawer still exposes the detailed controls.
  assert.ok(copilot.includes("Session focus"), "Advanced exposes session focus");
  assert.ok(copilot.includes("Stop Everything"), "Copilot panel exposes stop everything");
});

test("Voice Mode remains separate from Copilot panel", () => {
  const commandBar = readFileSync(join(ROOT, "renderer", "command", "CommandBar.tsx"), "utf8");
  const copilot = readFileSync(join(ROOT, "renderer", "panel", "CopilotPanel.tsx"), "utf8");
  assert.ok(commandBar.includes("VoiceModePanel"), "Voice Mode stays on command bar");
  assert.ok(!copilot.includes("VoiceModePanel"), "Copilot panel does not embed Voice Mode");
  assert.ok(!copilot.toLowerCase().includes("start voice mode"), "Voice loop stays separate");
});

test("input source options include system audio for media listening", () => {
  const sys = INPUT_SOURCE_OPTIONS.find((o) => o.value === "system_audio");
  assert.ok(sys);
  assert.match(sys!.hint, /YouTube|podcast|webinar/i);
});
