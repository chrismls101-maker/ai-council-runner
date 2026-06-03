import assert from "node:assert/strict";
import { scoreBenchmarkPair } from "../../dist/server/benchmarks/scoreBenchmark.js";
import {
  detectInventedExpansion,
  evaluateSubjectAlignment,
  INVENTED_EXPANSION_SCORE_CAP,
  WRONG_SUBJECT_SCORE_CAP,
} from "../../dist/server/benchmarks/benchmarkScoringExtras.js";
import { getBenchmarkPromptById } from "../../dist/constants/benchmarkPrompts.js";

const SIMPLE_EXPECTED = [
  "IIVO",
  "decision engine",
  "routing",
  "one model",
  "search",
  "council",
];
const SIMPLE_FORBIDDEN = [
  "intraocular",
  "implant",
  "eye surgery",
  "ophthalmology",
  "medical device",
  "implantable",
  "vision correction",
];
const SIMPLE_CONTEXT = {
  requiredContextTerms: [
    "decision engine",
    "AI decision engine",
    "orchestration",
    "routing",
    "routes",
    "one model",
    "verified search",
    "council",
    "specialist council",
    "action plan",
  ],
  requireProductContextMin: 2,
};

const WRONG_MEDICAL_BASELINE =
  "IIVO stands for Intraocular Implantable Vision Options, referring to a range of surgical procedures and devices designed to improve vision by implanting corrective lenses directly into the eye.";
const INVENTED_EXPANSION_BASELINE =
  "IIVO stands for Integrated Intelligent Virtual Operations, a platform for optimizing enterprise workflows and automating business operations across departments.";
const INVENTED_OR_BASELINE =
  "IIVO, or Intelligent Integrated Virtual Operations, is a technology framework designed to streamline enterprise workflows and optimize business operations through AI and automation.";
const CORRECT_IIVO =
  "IIVO is an AI decision engine that routes a prompt to one model, verified search, or a specialist council so founders get one clear answer or action plan.";
const CORRECT_BASELINE =
  "IIVO is an AI decision engine that routes requests through one model, verified search, or a specialist council depending on the task.";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

test("detects IIVO, or ... acronym expansion patterns", () => {
  const result = detectInventedExpansion(INVENTED_OR_BASELINE);
  assert.equal(result.detected, true);
  assert.ok(result.phrase?.includes("Intelligent"));
});

test("subject alignment flags wrong-subject baseline for IIVO prompt", () => {
  const baseline = evaluateSubjectAlignment(
    WRONG_MEDICAL_BASELINE,
    SIMPLE_EXPECTED,
    SIMPLE_FORBIDDEN,
    SIMPLE_CONTEXT,
  );
  const iivo = evaluateSubjectAlignment(CORRECT_IIVO, SIMPLE_EXPECTED, SIMPLE_FORBIDDEN, SIMPLE_CONTEXT);

  assert.equal(baseline.wrongSubject, true);
  assert.equal(baseline.explanation?.includes("wrong subject"), true);
  assert.equal(iivo.wrongSubject, false);
  assert.ok(iivo.matchedContextTerms.length >= 2);
});

test("wrong-subject baseline loses Simple IIVO benchmark scoring", () => {
  const simplePrompt = getBenchmarkPromptById("simple-iivo-explanation");
  assert.ok(simplePrompt);

  const result = scoreBenchmarkPair({
    prompt: simplePrompt!.prompt,
    baselineAnswer: WRONG_MEDICAL_BASELINE,
    iivoAnswer: CORRECT_IIVO,
    baselineCostUsd: 0.0015,
    iivoCostUsd: 0.0039,
    iivoHasSources: false,
    iivoHasMemory: false,
    successCriteria: simplePrompt!.successCriteria,
    expectedTerms: simplePrompt!.expectedTerms,
    forbiddenTerms: simplePrompt!.forbiddenTerms,
    requiredContextTerms: simplePrompt!.requiredContextTerms,
    requireProductContextMin: simplePrompt!.requireProductContextMin,
    promptCategory: simplePrompt!.category,
  });

  assert.equal(result.scoringMeta.subjectAlignment.baseline.wrongSubject, true);
  assert.equal(result.scoringMeta.qualityWinner, "iivo");
  assert.ok(result.scores.baselineTotal <= WRONG_SUBJECT_SCORE_CAP);
  assert.ok(result.scores.iivoTotal > result.scores.baselineTotal);
  assert.equal(result.scoringMeta.valueVerdict, "worth_it");
  assert.ok(result.scoringMeta.warnings.some((w) => w.includes("wrong subject")));
});

test("invented acronym expansion baseline loses to correct IIVO answer", () => {
  const simplePrompt = getBenchmarkPromptById("simple-iivo-explanation");
  assert.ok(simplePrompt);

  const result = scoreBenchmarkPair({
    prompt: simplePrompt!.prompt,
    baselineAnswer: INVENTED_EXPANSION_BASELINE,
    iivoAnswer: CORRECT_IIVO,
    baselineCostUsd: 0.0013,
    iivoCostUsd: 0.004,
    iivoHasSources: false,
    iivoHasMemory: false,
    successCriteria: simplePrompt!.successCriteria,
    expectedTerms: simplePrompt!.expectedTerms,
    forbiddenTerms: simplePrompt!.forbiddenTerms,
    requiredContextTerms: simplePrompt!.requiredContextTerms,
    requireProductContextMin: simplePrompt!.requireProductContextMin,
    promptCategory: simplePrompt!.category,
  });

  assert.equal(result.scoringMeta.subjectAlignment.baseline.possibleInventedExpansion, true);
  assert.equal(result.scoringMeta.subjectAlignment.baseline.insufficientProductContext, true);
  assert.ok(result.scoringMeta.subjectAlignment.baseline.subjectAlignmentScore <= 3);
  assert.equal(result.scoringMeta.qualityWinner, "iivo");
  assert.ok(result.scores.baselineTotal <= INVENTED_EXPANSION_SCORE_CAP);
  assert.ok(result.scoringMeta.winnerOverrideReason?.includes("Baseline failed subject alignment"));
  assert.ok(
    result.scoringMeta.warnings.some((w) => w.includes("invented acronym expansion")),
  );
});

test("IIVO, or invented expansion baseline loses via quality winner override", () => {
  const simplePrompt = getBenchmarkPromptById("simple-iivo-explanation");
  assert.ok(simplePrompt);

  const result = scoreBenchmarkPair({
    prompt: simplePrompt!.prompt,
    baselineAnswer: INVENTED_OR_BASELINE,
    iivoAnswer: CORRECT_IIVO,
    baselineCostUsd: 0.0011,
    iivoCostUsd: 0.004,
    iivoHasSources: false,
    iivoHasMemory: false,
    successCriteria: simplePrompt!.successCriteria,
    expectedTerms: simplePrompt!.expectedTerms,
    forbiddenTerms: simplePrompt!.forbiddenTerms,
    requiredContextTerms: simplePrompt!.requiredContextTerms,
    requireProductContextMin: simplePrompt!.requireProductContextMin,
    promptCategory: simplePrompt!.category,
  });

  assert.equal(result.scoringMeta.subjectAlignment.baseline.insufficientProductContext, true);
  assert.equal(result.scoringMeta.subjectAlignment.baseline.possibleInventedExpansion, true);
  assert.ok(result.scores.baselineTotal <= INVENTED_EXPANSION_SCORE_CAP);
  assert.equal(result.scoringMeta.qualityWinner, "iivo");
  assert.equal(result.scoringMeta.valueVerdict, "worth_it");
  assert.ok(result.scoringMeta.winnerOverrideReason?.includes("Baseline failed subject alignment"));
  assert.ok(
    result.scoringMeta.warnings.some((w) =>
      w.includes("does not show enough product-specific context"),
    ),
  );
});

test("correct product-context baseline has no invented expansion warning or override", () => {
  const aligned = evaluateSubjectAlignment(
    CORRECT_BASELINE,
    SIMPLE_EXPECTED,
    SIMPLE_FORBIDDEN,
    SIMPLE_CONTEXT,
  );

  assert.equal(aligned.possibleInventedExpansion, false);
  assert.equal(aligned.insufficientProductContext, false);
  assert.ok(aligned.matchedContextTerms.length >= 2);
  assert.ok(aligned.subjectAlignmentScore >= 6);

  const simplePrompt = getBenchmarkPromptById("simple-iivo-explanation");
  assert.ok(simplePrompt);

  const result = scoreBenchmarkPair({
    prompt: simplePrompt!.prompt,
    baselineAnswer: CORRECT_BASELINE,
    iivoAnswer: CORRECT_IIVO,
    baselineCostUsd: 0.001,
    iivoCostUsd: 0.004,
    iivoHasSources: false,
    iivoHasMemory: false,
    expectedTerms: simplePrompt!.expectedTerms,
    forbiddenTerms: simplePrompt!.forbiddenTerms,
    requiredContextTerms: simplePrompt!.requiredContextTerms,
    requireProductContextMin: simplePrompt!.requireProductContextMin,
    promptCategory: simplePrompt!.category,
  });

  assert.equal(result.scoringMeta.winnerOverrideReason, undefined);
  assert.equal(result.scoringMeta.subjectAlignment.baseline.possibleInventedExpansion, false);
  assert.equal(result.scoringMeta.subjectAlignment.iivo.possibleInventedExpansion, false);
});

test("unsupported location assumption is flagged for GTM prompt", () => {
  const gtmPrompt = getBenchmarkPromptById("first-paying-customer-wedge");
  assert.ok(gtmPrompt);

  const result = scoreBenchmarkPair({
    prompt: gtmPrompt!.prompt,
    baselineAnswer: "Target plumbers with a paid pilot offer this week.",
    iivoAnswer:
      "Verify plumbing companies in Montgomery, AL using BBB listings and call them with a $199 pilot offer.",
    baselineCostUsd: 0.004,
    iivoCostUsd: 0.08,
    iivoHasSources: false,
    iivoHasMemory: false,
    detectUnsupportedLocation: true,
    promptCategory: gtmPrompt!.category,
  });

  assert.ok(
    result.scoringMeta.unsupportedAssumptionWarnings.some((w) =>
      w.message.includes("unsupported location"),
    ),
  );
  assert.ok(result.scoringMeta.warnings.some((w) => w.includes("unsupported location")));
});

test("recommendation conflict reduces weaker side criteria credit on SMS prompt", () => {
  const smsPrompt = getBenchmarkPromptById("sms-now-or-after-pilots");
  assert.ok(smsPrompt);

  const baselineBuildNow =
    "I recommend adding SMS follow-up to AI Front Desk now rather than waiting for 5 paying pilot customers. Next steps: 1) Validate demand 2) Prototype development 3) Measure impact.";
  const iivoTestManual =
    "Recommended Action: Test SMS follow-up manually before committing to full development. Evidence: if 2-3 prospects confirm SMS is essential, build it. Next action within 24 hours: ask prospects directly. Main risk: wasted build effort.";

  const result = scoreBenchmarkPair({
    prompt: smsPrompt!.prompt,
    baselineAnswer: baselineBuildNow,
    iivoAnswer: iivoTestManual,
    baselineCostUsd: 0.004,
    iivoCostUsd: 0.066,
    iivoHasSources: false,
    iivoHasMemory: true,
    successCriteria: smsPrompt!.successCriteria,
    promptCategory: smsPrompt!.category,
  });

  assert.equal(result.scoringMeta.recommendationConflict?.conflictDetected, true);
  assert.ok(result.scoringMeta.warnings.some((w) => w.includes("Recommendation conflict")));
  assert.ok(
    (result.criteriaEvaluation?.iivoMatchedCount ?? 0) >=
      (result.criteriaEvaluation?.baselineMatchedCount ?? 0),
  );
  assert.equal(result.scoringMeta.qualityWinner, "iivo");
});

console.log("\nAll benchmark scoring tests passed.");
