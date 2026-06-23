import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeMarkIdsFromPlan,
  buildCompanionSessionMemory,
  canReuseCompanionCapture,
  companionMemoryForAsk,
  COMPANION_CAPTURE_REUSE_MAX_AGE_MS,
  COMPANION_MEMORY_TTL_MS,
  isCompanionMemoryValid,
  screenshotFromCompanionMemory,
} from "../shared/companionSessionMemory.ts";
import {
  looksLikeRetargetCorrection,
  looksLikeScriptContinue,
  resolveCompanionRoute,
} from "../shared/companionRetarget.ts";
import { companionSubmitPlan } from "../shared/companionActions.ts";

const sampleUiMap = {
  captureId: "cap-1",
  width: 1920,
  height: 1080,
  marks: [
    { id: "m1", bounds: { x: 0.1, y: 0.2, w: 0.1, h: 0.05 }, source: "vision" as const },
    { id: "m2", bounds: { x: 0.1, y: 0.3, w: 0.1, h: 0.05 }, source: "vision" as const },
  ],
};

const samplePlan = {
  captureId: "cap-1",
  speech: [{ segmentIndex: 0, text: "This line here." }],
  manifestations: [
    { type: "glow" as const, targetMarkId: "m1", enterAtSegment: 0, exitAtSegment: 0 },
  ],
};

const samplePresence = { uiMap: sampleUiMap, guidancePlan: samplePlan };

function makeMemory(ageMs = 0) {
  return buildCompanionSessionMemory({
    prompt: "What's this error?",
    presence: samplePresence,
    frontApp: "Cursor",
    windowTitle: "index.ts",
    screenshot: {
      imageDataUrl: "data:image/jpeg;base64,abc",
      eventId: "cap-1",
      capturedAt: new Date(Date.now() - ageMs).toISOString(),
    },
    nowMs: Date.now(),
  });
}

test("activeMarkIdsFromPlan collects manifestation targets", () => {
  assert.deepEqual(activeMarkIdsFromPlan(samplePlan), ["m1"]);
});

test("isCompanionMemoryValid respects TTL and app context", () => {
  const memory = makeMemory(5_000);
  const now = Date.now();
  assert.equal(
    isCompanionMemoryValid(memory, { nowMs: now, frontApp: "Cursor", windowTitle: "index.ts" }),
    true,
  );
  assert.equal(
    isCompanionMemoryValid(memory, {
      nowMs: now + COMPANION_MEMORY_TTL_MS + 1,
      frontApp: "Cursor",
    }),
    false,
  );
  assert.equal(
    isCompanionMemoryValid(memory, { nowMs: now, frontApp: "Safari" }),
    false,
  );
});

test("canReuseCompanionCapture within reuse window only", () => {
  const memory = makeMemory(2_000);
  const now = Date.now();
  assert.equal(canReuseCompanionCapture(memory, { nowMs: now }), true);
  assert.equal(
    canReuseCompanionCapture(memory, { nowMs: now + COMPANION_CAPTURE_REUSE_MAX_AGE_MS + 1 }),
    false,
  );
});

test("looksLikeRetargetCorrection detects correction phrases", () => {
  assert.equal(looksLikeRetargetCorrection("No, the other one"), true);
  assert.equal(looksLikeRetargetCorrection("the line below"), true);
  assert.equal(looksLikeRetargetCorrection("explain this error"), false);
});

test("looksLikeScriptContinue detects ack phrases", () => {
  assert.equal(looksLikeScriptContinue("okay"), true);
  assert.equal(looksLikeScriptContinue("what's next"), true);
  assert.equal(looksLikeScriptContinue("the other one"), false);
});

test("resolveCompanionRoute picks retarget with valid memory", () => {
  const memory = makeMemory(1_000);
  const ctx = { frontApp: "Cursor", windowTitle: "index.ts" };
  assert.equal(resolveCompanionRoute("the other one", memory, ctx), "retarget");
  assert.equal(resolveCompanionRoute("okay", memory, ctx), "script_continue");
  assert.equal(
    resolveCompanionRoute("why does that matter?", memory, ctx),
    "direct_follow_up",
  );
  assert.equal(
    resolveCompanionRoute("what do you see on my screen", null, ctx),
    "full_visual_ask",
  );
});

test("companionSubmitPlan attaches companionRoute to submit-command", () => {
  const memory = makeMemory(500);
  const plan = companionSubmitPlan("not that one", memory, {
    frontApp: "Cursor",
    windowTitle: "index.ts",
  });
  assert.equal(plan.route, "retarget");
  assert.equal(plan.commands.length, 1);
  assert.equal(plan.commands[0]?.type, "submit-command");
  if (plan.commands[0]?.type === "submit-command") {
    assert.equal(plan.commands[0].companionRoute, "retarget");
  }
});

test("companionMemoryForAsk strips inline image fields", () => {
  const memory = makeMemory();
  const payload = companionMemoryForAsk(memory);
  assert.equal("lastScreenshot" in payload, false);
  assert.equal(payload.lastCaptureId, "cap-1");
});

test("screenshotFromCompanionMemory rebuilds from imageDataUrl fallback", () => {
  const memory = makeMemory();
  const shot = screenshotFromCompanionMemory({
    ...memory,
    lastScreenshot: undefined,
    lastCaptureImageDataUrl: "data:image/jpeg;base64,xyz",
  });
  assert.equal(shot?.imageDataUrl, "data:image/jpeg;base64,xyz");
});
