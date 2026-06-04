import assert from "node:assert/strict";
import {
  buildGlassAskExternalContext,
  buildGlassAskPrompt,
  formatGlassOverlayAnswer,
  resolveGlassAskMode,
} from "../../dist/server/glass/glassAskHandler.js";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

test("resolveGlassAskMode defaults to quick", () => {
  assert.equal(resolveGlassAskMode("What am I working on?"), "quick");
});

test("resolveGlassAskMode uses council when requested", () => {
  assert.equal(resolveGlassAskMode("hello", "council"), "council");
});

test("resolveGlassAskMode detects council signals in prompt", () => {
  assert.equal(resolveGlassAskMode("Analyze my session strategy for launch"), "council");
});

test("buildGlassAskPrompt includes session summary and overlay instruction", () => {
  const prompt = buildGlassAskPrompt("What am I working on?", {
    summary: "Editing Glass overlay.",
    recentTranscript: "User asked about command bar.",
  });
  assert.match(prompt, /What am I working on/);
  assert.match(prompt, /Session summary/);
  assert.match(prompt, /desktop overlay card/);
});

test("buildGlassAskExternalContext includes recent events", () => {
  const ctx = buildGlassAskExternalContext({
    sessionId: "s1",
    title: "Work session",
    summary: "Summary line",
    recentEvents: [{ kind: "screen_capture", title: "Capture", text: "PNG saved" }],
  });
  assert.ok(ctx?.items.length);
  assert.match(ctx!.items[0].contentText, /screen_capture/);
});

test("formatGlassOverlayAnswer strips headers and truncates long text", () => {
  const long = "a".repeat(1000);
  const formatted = formatGlassOverlayAnswer(`## Title\n${long}`);
  assert.doesNotMatch(formatted.display, /^##/);
  assert.equal(formatted.truncated, true);
});

test("formatGlassOverlayAnswer caps bullet count", () => {
  const bullets = Array.from({ length: 10 }, (_, i) => `- Point ${i + 1}`).join("\n");
  const formatted = formatGlassOverlayAnswer(bullets);
  const count = (formatted.display.match(/^-/gm) ?? []).length;
  assert.ok(count <= 7);
});

console.log("glassAsk.test.ts: all assertions passed");
