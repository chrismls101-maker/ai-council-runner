import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SEMANTIC_CONFIDENCE_THRESHOLD,
  buildSemanticSessionTypePrompt,
  canSemanticRefineOnDebrief,
  formatSessionTypeRefineLabel,
  hasEnoughSessionContext,
  parseSemanticSessionTypeResponse,
  shouldOfferSemanticRefine,
  mergeSemanticIntoDetection,
} from "../shared/copilotSessionSemantic.ts";
import { detectSessionTypeDetailed } from "../shared/copilotSessionType.ts";

test("high-confidence deterministic session does not offer semantic refine", () => {
  const detection = detectSessionTypeDetailed({
    appName: "Zoom",
    transcript: "agenda action items follow up attendees on the call meeting notes",
  });
  assert.ok(detection.confidence >= SEMANTIC_CONFIDENCE_THRESHOLD);
  assert.equal(
    shouldOfferSemanticRefine({
      setting: "auto",
      detection,
      mode: "passive",
      alreadyRefined: false,
      signals: { transcript: "agenda action items follow up attendees" },
    }),
    false,
  );
});

test("low-confidence mixed session can request semantic refine", () => {
  const detection = detectSessionTypeDetailed({
    transcript: "agenda for the meeting and refactor the deploy script",
  });
  assert.equal(detection.mixed, true);
  assert.ok(
    shouldOfferSemanticRefine({
      setting: "auto",
      detection,
      mode: "coaching",
      alreadyRefined: false,
      signals: {
        transcript: "agenda for the meeting and refactor the deploy script with npm",
        recentCommands: ["why deploy fail", "help with build"],
      },
    }),
  );
  assert.match(formatSessionTypeRefineLabel(detection), /Refine\?/);
});

test("parse semantic JSON and merge into detection", () => {
  const raw = JSON.stringify({
    primaryType: "research",
    secondaryType: "business_strategy",
    confidence: 0.82,
    reason: "Comparing market sources for strategy.",
    suggestedReportTemplate: "mixed:research+business_strategy",
  });
  const parsed = parseSemanticSessionTypeResponse(raw);
  assert.ok(parsed);
  assert.equal(parsed!.primaryType, "research");
  assert.equal(parsed!.secondaryType, "business_strategy");
  const base = detectSessionTypeDetailed({ transcript: "mixed signals" });
  const merged = mergeSemanticIntoDetection(base, parsed!);
  assert.equal(merged.primaryType, "research");
  assert.equal(merged.mixed, true);
});

test("AI unavailable falls back — unparseable response returns null", () => {
  assert.equal(parseSemanticSessionTypeResponse("Council recommends a full debate."), null);
});

test("semantic prompt forbids Council", () => {
  const prompt = buildSemanticSessionTypePrompt(
    { transcript: "strategy pricing" },
    detectSessionTypeDetailed({ transcript: "strategy pricing" }),
  );
  assert.match(prompt, /NOT invoke Council/i);
});

test("debrief refine gate requires low confidence and context", () => {
  const low = detectSessionTypeDetailed({ transcript: "agenda and refactor" });
  assert.equal(
    canSemanticRefineOnDebrief({
      setting: "auto",
      detection: low,
      alreadyRefined: false,
      signals: { transcript: "x".repeat(50), recentCommands: ["a", "b"] },
    }),
    true,
  );
  assert.equal(hasEnoughSessionContext({ transcript: "short" }), false);
});
