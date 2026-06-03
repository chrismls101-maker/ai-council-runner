import type {
  BenchmarkRunRecord,
  BenchmarkScoreCategory,
  BenchmarkScores,
  BenchmarkScoringMeta,
  BenchmarkWinner,
  CriteriaEvaluation,
} from "./types.js";
import type { BenchmarkPromptCategory } from "../../constants/benchmarkPrompts.js";
import { evaluateSuccessCriteria, adjustCriteriaForRecommendationConflict } from "./criteriaMatch.js";
import {
  analyzeRecommendationConflict,
  applyProductContextCap,
  applyWrongSubjectCap,
  buildScoringMeta,
  detectUnsupportedAssumptions,
  evaluateSubjectAlignment,
  type SubjectAlignmentContextOptions,
} from "./benchmarkScoringExtras.js";

const SCORE_KEYS: (keyof BenchmarkScoreCategory)[] = [
  "clarity",
  "actionability",
  "specificity",
  "riskAwareness",
  "sourceQuality",
  "memoryContextUse",
  "decisionConfidence",
  "nextStepQuality",
  "costEfficiency",
];

function clampScore(n: number): number {
  return Math.max(1, Math.min(10, Math.round(n)));
}

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((sum, re) => sum + (text.match(re)?.length ?? 0), 0);
}

function scoreAnswerHeuristic(
  answer: string,
  options: {
    isIivo: boolean;
    hasSources: boolean;
    hasMemory: boolean;
    costUsd: number | null;
    peerCostUsd: number | null;
    sourceQualityPenalty?: number;
  },
): BenchmarkScoreCategory {
  const text = answer.trim();
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const len = words.length;

  const numberedSteps = countMatches(text, [/^\s*\d+[\.)]/gm]);
  const bulletSteps = countMatches(text, [/^\s*[-*•]/gm]);
  const nextStepSignals = countMatches(lower, [/\b(next step|recommend|should|action item|do this)\b/g]);
  const riskSignals = countMatches(lower, [/\b(risk|caution|watch out|downside|tradeoff|depends)\b/g]);
  const sourceSignals = countMatches(lower, [/\b(source|citation|http|www\.|according to|verified)\b/g]);
  const memorySignals = countMatches(lower, [/\b(memory|context|previous|earlier decision|pilot|project)\b/g]);
  const recommendSignals = countMatches(lower, [/\b(recommend|recommendation|suggest|advise)\b/g]);
  const specificitySignals = countMatches(
    lower,
    [/\b(\d+|percent|week|month|customer|pilot|sms|pricing|feature)\b/g],
  );
  const actionVerbs = countMatches(
    lower,
    [/\b(add|build|launch|test|measure|validate|ship|delay|wait|prioritize)\b/g],
  );

  const clarity = clampScore(4 + Math.min(4, len / 120) + (text.includes("\n") ? 1 : 0));
  const actionability = clampScore(
    3 + Math.min(4, numberedSteps + bulletSteps) + Math.min(2, actionVerbs / 3),
  );
  const specificity = clampScore(3 + Math.min(5, specificitySignals / 2));
  const riskAwareness = clampScore(3 + Math.min(4, riskSignals));
  let sourceQuality = clampScore(
    options.hasSources ? 6 + Math.min(3, sourceSignals) : 2 + Math.min(3, sourceSignals),
  );
  if (options.sourceQualityPenalty) {
    sourceQuality = clampScore(sourceQuality - options.sourceQualityPenalty);
  }
  const memoryContextUse = clampScore(
    options.hasMemory && options.isIivo
      ? 5 + Math.min(4, memorySignals)
      : 2 + Math.min(2, memorySignals),
  );
  const decisionConfidence = clampScore(
    3 + Math.min(3, recommendSignals) + (lower.includes("because") ? 1 : 0) + (len > 200 ? 1 : 0),
  );
  const nextStepQuality = clampScore(
    3 + Math.min(4, numberedSteps + bulletSteps) + Math.min(2, nextStepSignals),
  );

  let costEfficiency = 6;
  if (options.costUsd != null && options.peerCostUsd != null && options.peerCostUsd > 0) {
    const ratio = options.costUsd / options.peerCostUsd;
    if (ratio <= 0.85) costEfficiency = 8;
    else if (ratio <= 1.1) costEfficiency = 6;
    else costEfficiency = 4;
  } else if (options.isIivo && len > 400) {
    costEfficiency = 5;
  }

  return {
    clarity,
    actionability,
    specificity,
    riskAwareness,
    sourceQuality,
    memoryContextUse,
    decisionConfidence,
    nextStepQuality,
    costEfficiency: clampScore(costEfficiency),
  };
}

function totalScore(category: BenchmarkScoreCategory): number {
  return SCORE_KEYS.reduce((sum, key) => sum + category[key], 0);
}

function averageScore(category: BenchmarkScoreCategory): number {
  return Math.round((totalScore(category) / SCORE_KEYS.length) * 10) / 10;
}

function recalcCriteriaCounts(criteriaEvaluation: CriteriaEvaluation): CriteriaEvaluation {
  const baselineMatchedCount = criteriaEvaluation.baseline.filter((c) => c.matched).length;
  const iivoMatchedCount = criteriaEvaluation.iivo.filter((c) => c.matched).length;
  let criteriaWinner: BenchmarkWinner = "tie";
  if (iivoMatchedCount > baselineMatchedCount) criteriaWinner = "iivo";
  else if (baselineMatchedCount > iivoMatchedCount) criteriaWinner = "baseline";
  return {
    ...criteriaEvaluation,
    baselineMatchedCount,
    iivoMatchedCount,
    missingBaseline: criteriaEvaluation.baseline.filter((c) => !c.matched).map((c) => c.criterion),
    missingIivo: criteriaEvaluation.iivo.filter((c) => !c.matched).map((c) => c.criterion),
    criteriaWinner,
  };
}

export function scoreBenchmarkPair(input: {
  prompt: string;
  baselineAnswer: string;
  iivoAnswer: string;
  baselineCostUsd: number | null;
  iivoCostUsd: number | null;
  iivoHasSources: boolean;
  iivoHasMemory: boolean;
  successCriteria?: string[];
  expectedTerms?: string[];
  forbiddenTerms?: string[];
  requiredContextTerms?: string[];
  requireProductContextMin?: number;
  detectUnsupportedLocation?: boolean;
  analyzeRecommendationConflict?: boolean;
  promptCategory?: BenchmarkPromptCategory;
}): {
  scores: BenchmarkScores;
  criteriaEvaluation?: CriteriaEvaluation;
  scoringMeta: BenchmarkScoringMeta;
} {
  const unsupportedWarnings = detectUnsupportedAssumptions({
    prompt: input.prompt,
    baselineAnswer: input.baselineAnswer,
    iivoAnswer: input.iivoAnswer,
    iivoHasSources: input.iivoHasSources,
    detectUnsupportedLocation: input.detectUnsupportedLocation,
  });

  const baselineUnsupportedCount = unsupportedWarnings.filter((w) => w.side === "baseline").length;
  const iivoUnsupportedCount = unsupportedWarnings.filter((w) => w.side === "iivo").length;

  const baselineCategory = scoreAnswerHeuristic(input.baselineAnswer, {
    isIivo: false,
    hasSources: false,
    hasMemory: false,
    costUsd: input.baselineCostUsd,
    peerCostUsd: input.iivoCostUsd,
    sourceQualityPenalty: baselineUnsupportedCount > 0 ? 2 : 0,
  });
  const iivoCategory = scoreAnswerHeuristic(input.iivoAnswer, {
    isIivo: true,
    hasSources: input.iivoHasSources,
    hasMemory: input.iivoHasMemory,
    costUsd: input.iivoCostUsd,
    peerCostUsd: input.baselineCostUsd,
    sourceQualityPenalty: iivoUnsupportedCount > 0 ? 2 : 0,
  });

  const recommendationConflict = analyzeRecommendationConflict({
    prompt: input.prompt,
    baselineAnswer: input.baselineAnswer,
    iivoAnswer: input.iivoAnswer,
    enabled:
      input.analyzeRecommendationConflict ??
      input.promptCategory === "Product Decision",
  });

  let criteriaEvaluation: CriteriaEvaluation | undefined;
  let criteriaBaselineBonus = 0;
  let criteriaIivoBonus = 0;

  if (input.successCriteria?.length) {
    criteriaEvaluation = evaluateSuccessCriteria(
      input.baselineAnswer,
      input.iivoAnswer,
      input.successCriteria,
    );
    if (recommendationConflict?.conflictDetected) {
      criteriaEvaluation = recalcCriteriaCounts(
        adjustCriteriaForRecommendationConflict(criteriaEvaluation, recommendationConflict),
      );
    }
    criteriaBaselineBonus = criteriaEvaluation.baselineMatchedCount * 3;
    criteriaIivoBonus = criteriaEvaluation.iivoMatchedCount * 3;
  }

  let baselineTotal = totalScore(baselineCategory) + criteriaBaselineBonus;
  let iivoTotal = totalScore(iivoCategory) + criteriaIivoBonus;

  if (recommendationConflict?.conflictDetected) {
    baselineTotal += recommendationConflict.baselineQualityBonus * 2;
    iivoTotal += recommendationConflict.iivoQualityBonus * 2;
  }

  const contextOpts: SubjectAlignmentContextOptions = {
    requiredContextTerms: input.requiredContextTerms,
    requireProductContextMin: input.requireProductContextMin,
  };

  const subjectBaseline = evaluateSubjectAlignment(
    input.baselineAnswer,
    input.expectedTerms,
    input.forbiddenTerms,
    contextOpts,
  );
  const subjectIivo = evaluateSubjectAlignment(
    input.iivoAnswer,
    input.expectedTerms,
    input.forbiddenTerms,
    contextOpts,
  );
  const subjectAlignment = { baseline: subjectBaseline, iivo: subjectIivo };

  baselineTotal = applyWrongSubjectCap(baselineTotal, subjectBaseline.wrongSubject);
  iivoTotal = applyWrongSubjectCap(iivoTotal, subjectIivo.wrongSubject);
  baselineTotal = applyProductContextCap(baselineTotal, subjectBaseline);
  iivoTotal = applyProductContextCap(iivoTotal, subjectIivo);

  baselineTotal -= baselineUnsupportedCount * 3;
  iivoTotal -= iivoUnsupportedCount * 3;

  const scoringMeta = buildScoringMeta({
    prompt: input.prompt,
    baselineAnswer: input.baselineAnswer,
    iivoAnswer: input.iivoAnswer,
    baselineCostUsd: input.baselineCostUsd,
    iivoCostUsd: input.iivoCostUsd,
    iivoHasSources: input.iivoHasSources,
    expectedTerms: input.expectedTerms,
    forbiddenTerms: input.forbiddenTerms,
    requiredContextTerms: input.requiredContextTerms,
    requireProductContextMin: input.requireProductContextMin,
    detectUnsupportedLocation: input.detectUnsupportedLocation,
    analyzeRecommendationConflict: input.analyzeRecommendationConflict,
    promptCategory: input.promptCategory,
    baselineTotal,
    iivoTotal,
    subjectAlignment,
  });

  return {
    scores: {
      baseline: baselineCategory,
      iivo: iivoCategory,
      baselineTotal,
      iivoTotal,
      baselineAverage: averageScore(baselineCategory),
      iivoAverage: averageScore(iivoCategory),
      scoringMethod: "deterministic",
      criteriaBaselineBonus: criteriaBaselineBonus || undefined,
      criteriaIivoBonus: criteriaIivoBonus || undefined,
    },
    criteriaEvaluation,
    scoringMeta,
  };
}

export function determineWinner(input: {
  scores: BenchmarkScores;
  scoringMeta?: BenchmarkScoringMeta;
  baselineCostUsd: number | null;
  iivoCostUsd: number | null;
}): {
  winner: BenchmarkWinner;
  scoreDifference: number;
  scoreDifferencePercent: number;
} {
  if (input.scoringMeta) {
    const scoreDifference = input.scores.iivoTotal - input.scores.baselineTotal;
    const base = Math.max(input.scores.baselineTotal, 1);
    const scoreDifferencePercent = Math.round((scoreDifference / base) * 1000) / 10;
    return {
      winner: input.scoringMeta.qualityWinner,
      scoreDifference,
      scoreDifferencePercent,
    };
  }

  const { scores } = input;
  const scoreDifference = scores.iivoTotal - scores.baselineTotal;
  const base = Math.max(scores.baselineTotal, 1);
  const scoreDifferencePercent = Math.round((scoreDifference / base) * 1000) / 10;

  if (Math.abs(scoreDifferencePercent) <= 5) {
    return { winner: "tie", scoreDifference, scoreDifferencePercent };
  }

  if (scoreDifferencePercent >= 5) {
    return { winner: "iivo", scoreDifference, scoreDifferencePercent };
  }

  if (
    scores.baselineTotal >= scores.iivoTotal &&
    input.baselineCostUsd != null &&
    input.iivoCostUsd != null &&
    input.baselineCostUsd <= input.iivoCostUsd
  ) {
    return { winner: "baseline", scoreDifference, scoreDifferencePercent };
  }

  return { winner: "baseline", scoreDifference, scoreDifferencePercent };
}

export function buildBenchmarkNarrative(input: {
  winner: BenchmarkWinner;
  scores: BenchmarkScores;
  scoringMeta?: BenchmarkScoringMeta;
  iivoWorkflowId: string;
  benchmarkMode: BenchmarkRunRecord["benchmarkMode"];
  costDifferenceUsd: number | null;
  scoreDifferencePercent: number;
  successCriteria?: string[];
  criteriaEvaluation?: CriteriaEvaluation;
}): {
  summary: string;
  whyWinner: string;
  iivoImprovements: string[];
  iivoNotWorthExtra: string[];
  routerNote?: string;
} {
  const { winner, scores, iivoWorkflowId } = input;
  const iivoImprovements: string[] = [];
  const iivoNotWorthExtra: string[] = [];

  for (const key of SCORE_KEYS) {
    const diff = scores.iivo[key] - scores.baseline[key];
    const label = key.replace(/([A-Z])/g, " $1").trim();
    if (diff >= 2) iivoImprovements.push(`Stronger ${label.toLowerCase()} (+${diff})`);
    if (diff <= -2) iivoNotWorthExtra.push(`Baseline was stronger on ${label.toLowerCase()}`);
  }

  if (input.scoringMeta?.subjectAlignment.baseline.wrongSubject) {
    iivoImprovements.push("Baseline answered the wrong subject (heuristic gate)");
  }
  if (input.scoringMeta?.subjectAlignment.baseline.possibleInventedExpansion) {
    iivoImprovements.push("Baseline used a possible invented IIVO acronym expansion");
  }
  if (input.scoringMeta?.subjectAlignment.baseline.insufficientProductContext) {
    iivoImprovements.push("Baseline lacked IIVO product-specific context");
  }
  if (input.scoringMeta?.recommendationConflict?.conflictDetected) {
    iivoImprovements.push("Recommendation conflict analyzed for criteria credit");
  }

  if (input.costDifferenceUsd != null && input.costDifferenceUsd > 0.01) {
    iivoNotWorthExtra.push(
      `IIVO cost about $${input.costDifferenceUsd.toFixed(4)} more for this prompt.`,
    );
  }

  if (input.scoringMeta?.valueVerdict === "not_worth_it") {
    iivoNotWorthExtra.push(input.scoringMeta.valueVerdictExplanation);
  }

  let routerNote: string | undefined;
  if (iivoWorkflowId === "direct_answer") {
    routerNote =
      "IIVO chose Direct Answer because the task did not need a council. Compare whether orchestration added value beyond a single model.";
  }

  let summary: string;
  let whyWinner: string;

  if (winner === "iivo") {
    if (input.scoringMeta?.winnerOverrideReason) {
      summary = `IIVO wins on product-context alignment (${scores.iivoTotal} vs ${scores.baselineTotal} heuristic score).`;
      whyWinner = input.scoringMeta.winnerOverrideReason;
    } else {
      summary = `IIVO scored ${scores.iivoTotal} vs ${scores.baselineTotal} (heuristic). IIVO wins by ~${Math.abs(input.scoreDifferencePercent)}%.`;
      whyWinner =
        "IIVO's answer scored meaningfully higher on clarity, actionability, risk, or next steps in this heuristic comparison.";
    }
  } else if (winner === "baseline") {
    if (input.scoringMeta?.winnerOverrideReason) {
      summary = `Single Model wins on product-context alignment (${scores.baselineTotal} vs ${scores.iivoTotal} heuristic score).`;
      whyWinner = input.scoringMeta.winnerOverrideReason;
    } else {
      summary = `Single-model baseline scored ${scores.baselineTotal} vs IIVO ${scores.iivoTotal}. Baseline wins on estimated score.`;
      whyWinner =
        "The baseline matched or beat IIVO at lower estimated cost — council may not have been worth the extra credits for this prompt.";
    }
  } else {
    summary = `Scores are close (${scores.baselineTotal} vs ${scores.iivoTotal}). Call it a tie within the 5% heuristic threshold.`;
    whyWinner =
      "Neither side clearly dominated. Review side-by-side answers — a single model may be enough here.";
  }

  if (input.scoringMeta) {
    summary += ` Value verdict: ${formatValueVerdict(input.scoringMeta.valueVerdict)}.`;
  }

  if (input.benchmarkMode === "direct_answer_vs_council" && iivoWorkflowId !== "direct_answer") {
    summary += ` Compared Direct Answer vs ${iivoWorkflowId} council.`;
  }

  if (input.successCriteria?.length) {
    summary += ` Criteria matched (heuristic): baseline ${input.criteriaEvaluation?.baselineMatchedCount ?? 0}/${input.successCriteria.length}, IIVO ${input.criteriaEvaluation?.iivoMatchedCount ?? 0}/${input.successCriteria.length}.`;
  }

  if (input.criteriaEvaluation && input.criteriaEvaluation.criteriaWinner !== winner) {
    whyWinner += ` Criteria checklist (heuristic) favors ${input.criteriaEvaluation.criteriaWinner === "iivo" ? "IIVO" : input.criteriaEvaluation.criteriaWinner === "baseline" ? "Single Model" : "a tie"}.`;
  }

  if (input.scoringMeta?.warnings.length) {
    whyWinner += ` Warnings: ${input.scoringMeta.warnings.slice(0, 2).join(" ")}`;
  }

  return {
    summary,
    whyWinner,
    iivoImprovements: iivoImprovements.slice(0, 6),
    iivoNotWorthExtra: iivoNotWorthExtra.slice(0, 6),
    routerNote,
  };
}

function formatValueVerdict(verdict: import("./types.js").ValueVerdict): string {
  switch (verdict) {
    case "worth_it":
      return "Worth it";
    case "marginal":
      return "Marginal";
    case "not_worth_it":
      return "Not worth it";
  }
}

export function isBenchmarkAiJudgeEnabled(): boolean {
  return process.env.BENCHMARK_AI_JUDGE_ENABLED === "true";
}
