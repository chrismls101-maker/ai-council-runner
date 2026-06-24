import { test } from "node:test";
import assert from "node:assert/strict";
import {
  advanceScriptAfterSpeech,
  advanceScriptOnAck,
  createScriptPlayerState,
  hasGuidanceScript,
  normalizeGuidanceSteps,
  scriptStepStatusLabel,
  speechTextForStep,
} from "../shared/companionScriptEngine.ts";
import { parseCompanionGuidancePayload, parseGuidancePlan } from "../shared/companionGuidance.ts";
import { promptRequestsCompanionScript } from "../shared/companionScriptPatterns.ts";
import { tryCompanionScriptAck, setCompanionScriptAckHandler } from "../shared/companionScriptBridge.ts";
import {
  anchorWatchDrifted,
  captureAnchorSnapshot,
} from "../main/companionAnchorWatch.ts";
import { shouldTryOmniParser, isOmniParserEnabled } from "../main/companionOmniParser.ts";

const threeStepPlan = {
  captureId: "cap-1",
  speech: [],
  manifestations: [],
  steps: [
    {
      stepIndex: 0,
      speech: [{ segmentIndex: 0, text: "Start here." }],
      manifestations: [{ type: "glow" as const, targetMarkId: "m1", enterAtSegment: 0 }],
      waitFor: "speech_end" as const,
      transition: "crossfade" as const,
    },
    {
      stepIndex: 1,
      speech: [{ segmentIndex: 0, text: "Then here." }],
      manifestations: [{ type: "glow" as const, targetMarkId: "m2", enterAtSegment: 0 }],
      waitFor: "user_ack" as const,
      transition: "crossfade" as const,
    },
    {
      stepIndex: 2,
      speech: [{ segmentIndex: 0, text: "Finally click submit." }],
      manifestations: [{ type: "cursor" as const, targetMarkId: "m3", enterAtSegment: 0 }],
      waitFor: "speech_end" as const,
      transition: "crossfade" as const,
    },
  ],
};

test("hasGuidanceScript true for multi-step plans", () => {
  assert.equal(hasGuidanceScript(threeStepPlan), true);
  assert.equal(
    hasGuidanceScript({ captureId: "c", speech: [{ segmentIndex: 0, text: "Hi" }], manifestations: [] }),
    false,
  );
});

test("normalizeGuidanceSteps orders by stepIndex", () => {
  const steps = normalizeGuidanceSteps(threeStepPlan);
  assert.equal(steps.length, 3);
  assert.equal(steps[0]?.speech[0]?.text, "Start here.");
});

test("advanceScriptAfterSpeech waits on user_ack step", () => {
  const state = createScriptPlayerState(threeStepPlan);
  const afterStep0 = advanceScriptAfterSpeech({ ...state, currentStepIndex: 0, phase: "playing" });
  assert.equal(afterStep0.currentStepIndex, 1);
  assert.equal(afterStep0.phase, "playing");

  const afterStep1 = advanceScriptAfterSpeech({ ...state, currentStepIndex: 1, phase: "playing" });
  assert.equal(afterStep1.currentStepIndex, 1);
  assert.equal(afterStep1.phase, "waiting_ack");
});

test("advanceScriptOnAck moves to next step", () => {
  const waiting = {
    ...createScriptPlayerState(threeStepPlan),
    currentStepIndex: 1,
    phase: "waiting_ack" as const,
  };
  const next = advanceScriptOnAck(waiting);
  assert.equal(next.phase, "playing");
  assert.equal(next.currentStepIndex, 2);
});

test("scriptStepStatusLabel formats step counter", () => {
  assert.match(scriptStepStatusLabel(1, 3), /Step 2 of 3/);
});

test("speechTextForStep joins segment text", () => {
  const steps = normalizeGuidanceSteps(threeStepPlan);
  assert.equal(speechTextForStep(steps[0]!), "Start here.");
});

test("parseGuidancePlan accepts steps and rich manifestations", () => {
  const plan = parseGuidancePlan(
    {
      captureId: "c",
      steps: threeStepPlan.steps,
      speech: [],
      manifestations: [],
    },
    "fallback",
  );
  assert.ok(plan?.steps?.length === 3);

  const sketchPlan = parseGuidancePlan(
    {
      captureId: "c",
      speech: [{ segmentIndex: 0, text: "See this path." }],
      manifestations: [
        {
          type: "sketch",
          enterAtSegment: 0,
          sketchPaths: ["M 0.1 0.2 L 0.5 0.5"],
        },
      ],
    },
    "fallback",
  );
  assert.equal(sketchPlan?.manifestations[0]?.type, "sketch");
});

test("parseCompanionGuidancePayload accepts path manifestation", () => {
  const payload = parseCompanionGuidancePayload(
    {
      uiMap: {
        captureId: "c",
        width: 100,
        height: 100,
        marks: [
          { id: "m1", bounds: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 }, source: "vision" },
          { id: "m2", bounds: { x: 0.5, y: 0.5, w: 0.1, h: 0.1 }, source: "vision" },
        ],
      },
      guidancePlan: {
        captureId: "c",
        speech: [{ segmentIndex: 0, text: "Look here." }],
        manifestations: [
          { type: "path", pathFromMarkId: "m1", pathToMarkId: "m2", enterAtSegment: 0 },
        ],
      },
    },
    "fallback",
  );
  assert.equal(payload?.guidancePlan.manifestations[0]?.type, "path");
});

test("promptRequestsCompanionScript detects walkthrough phrases", () => {
  assert.equal(promptRequestsCompanionScript("Walk me through this form"), true);
  assert.equal(promptRequestsCompanionScript("what is this error"), false);
});

test("tryCompanionScriptAck delegates to handler for ack phrases", () => {
  let called = false;
  setCompanionScriptAckHandler(() => {
    called = true;
    return true;
  });
  assert.equal(tryCompanionScriptAck("next"), true);
  assert.equal(called, true);
  setCompanionScriptAckHandler(null);
});

test("anchorWatchDrifted detects window move", () => {
  const baseline = captureAnchorSnapshot({
    bounds: { x: 100, y: 200, width: 800, height: 600 },
    appName: "Cursor",
    windowTitle: "index.ts",
  });
  const moved = captureAnchorSnapshot({
    bounds: { x: 140, y: 200, width: 800, height: 600 },
    appName: "Cursor",
    windowTitle: "index.ts",
  });
  assert.equal(anchorWatchDrifted(baseline, moved), true);
});

test("anchorWatchDrifted ignores small jitter", () => {
  const baseline = captureAnchorSnapshot({
    bounds: { x: 100, y: 200, width: 800, height: 600 },
  });
  const nudged = captureAnchorSnapshot({
    bounds: { x: 102, y: 201, width: 800, height: 600 },
  });
  assert.equal(anchorWatchDrifted(baseline, nudged), false);
});

test("isOmniParserEnabled off when explicitly disabled", () => {
  const prev = process.env.IIVO_COMPANION_OMNI_PARSER;
  process.env.IIVO_COMPANION_OMNI_PARSER = "0";
  assert.equal(isOmniParserEnabled(), false);
  assert.equal(shouldTryOmniParser(1, "Notes"), false);
  if (prev) process.env.IIVO_COMPANION_OMNI_PARSER = prev;
  else delete process.env.IIVO_COMPANION_OMNI_PARSER;
});
