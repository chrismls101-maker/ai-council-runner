import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GLASS_MODE_ORDER,
  GLASS_MODE_PRESETS,
  MODE_PRIVACY_NOTES,
  getModePreset,
  modePrimaryActionLabel,
  planModeActivation,
  resolveModeStatus,
} from "../shared/glassModePresets.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

test("presets exist for listen, meetings, translate, work, fix", () => {
  assert.deepEqual(GLASS_MODE_ORDER, ["listen", "meetings", "translate", "work", "fix"]);
  for (const id of GLASS_MODE_ORDER) {
    assert.ok(GLASS_MODE_PRESETS[id], `preset ${id} exists`);
  }
});

test("mode labels are simple single words", () => {
  assert.equal(GLASS_MODE_PRESETS.listen.label, "Listen");
  assert.equal(GLASS_MODE_PRESETS.meetings.label, "Meetings");
  assert.equal(GLASS_MODE_PRESETS.work.label, "Work");
  assert.equal(GLASS_MODE_PRESETS.fix.label, "Fix");
  for (const id of GLASS_MODE_ORDER) {
    assert.ok(!/\b(Copilot|Session|Diagnostic|Passive|Coaching)\b/.test(GLASS_MODE_PRESETS[id].label));
  }
});

test("internal mappings are correct", () => {
  assert.equal(GLASS_MODE_PRESETS.listen.copilotMode, "coaching");
  assert.equal(GLASS_MODE_PRESETS.listen.sessionFocus, "video_learning");
  assert.equal(GLASS_MODE_PRESETS.listen.preferredInputSource, "system_audio");

  assert.equal(GLASS_MODE_PRESETS.meetings.copilotMode, "coaching");
  assert.equal(GLASS_MODE_PRESETS.meetings.sessionFocus, "meeting_call");
  assert.equal(GLASS_MODE_PRESETS.meetings.meetingIntelligence, true);
  assert.equal(GLASS_MODE_PRESETS.meetings.preferredInputSource, "ask");

  assert.equal(GLASS_MODE_PRESETS.work.copilotMode, "coaching");
  assert.equal(GLASS_MODE_PRESETS.work.sessionFocus, "auto");

  assert.equal(GLASS_MODE_PRESETS.fix.copilotMode, "diagnostic");
  assert.equal(GLASS_MODE_PRESETS.fix.sessionFocus, "auto");
});

test("Listen requires system audio; Work and Fix require no audio", () => {
  assert.equal(GLASS_MODE_PRESETS.listen.requiresSystemAudio, true);
  assert.equal(GLASS_MODE_PRESETS.listen.requiresAudio, true);
  assert.equal(GLASS_MODE_PRESETS.work.requiresAudio, false);
  assert.equal(GLASS_MODE_PRESETS.fix.requiresAudio, false);
});

test("Listen with system audio not ready needs setup, never auto-starts capture", () => {
  const plan = planModeActivation(getModePreset("listen"), { systemAudioReady: false });
  assert.equal(plan.needsSystemAudioSetup, true);
  assert.equal(plan.startListening, false);
  assert.equal(plan.startSession, true);
});

test("Listen with system audio ready may start listening (only when ready)", () => {
  const plan = planModeActivation(getModePreset("listen"), { systemAudioReady: true });
  assert.equal(plan.needsSystemAudioSetup, false);
  assert.equal(plan.startListening, true);
});

test("Meetings prompts for source when none chosen, never auto-starts", () => {
  const plan = planModeActivation(getModePreset("meetings"), { systemAudioReady: true });
  assert.equal(plan.needsSourceChoice, true);
  assert.equal(plan.startListening, false);
});

test("Work and Fix activate immediately without source choice or audio", () => {
  for (const id of ["work", "fix"] as const) {
    const plan = planModeActivation(getModePreset(id), { systemAudioReady: false });
    assert.equal(plan.startSession, true);
    assert.equal(plan.needsSourceChoice, false);
    assert.equal(plan.needsSystemAudioSetup, false);
    assert.equal(plan.startListening, false);
  }
});

test("resolveModeStatus reflects active/listening/needs-setup", () => {
  const listen = getModePreset("listen");
  assert.equal(
    resolveModeStatus(listen, { activeMode: null, systemAudioReady: false, listening: false, hasError: false }),
    "needs_setup",
  );
  assert.equal(
    resolveModeStatus(listen, { activeMode: "listen", systemAudioReady: true, listening: true, hasError: false }),
    "listening",
  );
  assert.equal(
    resolveModeStatus(getModePreset("work"), {
      activeMode: "work",
      systemAudioReady: false,
      listening: false,
      hasError: false,
    }),
    "active",
  );
  assert.equal(
    resolveModeStatus(getModePreset("work"), {
      activeMode: null,
      systemAudioReady: false,
      listening: false,
      hasError: false,
    }),
    "ready",
  );
});

test("primary action label switches to Configure Audio when setup needed", () => {
  assert.equal(modePrimaryActionLabel(getModePreset("listen"), "needs_setup"), "Configure Audio");
  assert.equal(modePrimaryActionLabel(getModePreset("work"), "ready"), "Start Work");
  assert.equal(modePrimaryActionLabel(getModePreset("listen"), "active"), "Active");
});

test("privacy notes cover audio/storage/screen/stop guarantees", () => {
  const joined = MODE_PRIVACY_NOTES.join(" ").toLowerCase();
  assert.ok(joined.includes("no audio starts"));
  assert.ok(joined.includes("raw audio is not stored"));
  assert.ok(joined.includes("screens are only captured"));
  assert.ok(joined.includes("stop everything"));
});

test("panel renders four mode cards, separate Voice, hidden Advanced by default", () => {
  const panel = readFileSync(join(ROOT, "renderer", "panel", "CopilotPanel.tsx"), "utf8");
  assert.ok(panel.includes("What do you want IIVO to do?"), "simple title present");
  assert.ok(panel.includes("glass-mode-card-${id}"), "renders a card per mode id");
  assert.ok(panel.includes("GLASS_MODE_ORDER"), "iterates the four-mode order");
  assert.ok(panel.includes("glass-mode-cards"), "mode card grid present");
  assert.ok(panel.includes("glass-mode-voice"), "Voice is a separate button");
  assert.ok(panel.includes("voice-mode-start"), "Voice triggers separate loop");
  assert.ok(panel.includes("glass-advanced-toggle"), "advanced is behind a toggle");
  // Advanced labels should not appear as top-level card text.
  assert.ok(!panel.includes("Session Focus<"), "no top-level Session Focus label");
});

test("clicking a mode never issues a start-listening on launch (no auto capture in preset)", () => {
  // Activation plan for any mode at launch (nothing ready) must not start listening.
  for (const id of GLASS_MODE_ORDER) {
    const plan = planModeActivation(getModePreset(id), { systemAudioReady: false, chosenSource: null });
    assert.equal(plan.startListening, false, `${id} must not auto-start listening on launch`);
  }
});
