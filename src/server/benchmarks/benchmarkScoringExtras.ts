import type { BenchmarkPromptCategory } from "../../constants/benchmarkPrompts.js";
import type {
  BenchmarkScoringMeta,
  BenchmarkWinner,
  RecommendationConflictAnalysis,
  RecommendationStance,
  SubjectAlignmentResult,
  SubjectAlignmentSide,
  UnsupportedAssumptionWarning,
  ValueVerdict,
} from "./types.js";

export const WRONG_SUBJECT_SCORE_CAP = 25;
export const INVENTED_EXPANSION_SCORE_CAP = 35;
export const INSUFFICIENT_CONTEXT_SCORE_CAP = 40;

export interface SubjectAlignmentContextOptions {
  requiredContextTerms?: string[];
  requireProductContextMin?: number;
}

export type {
  SubjectAlignmentSide,
  SubjectAlignmentResult,
  UnsupportedAssumptionWarning,
  RecommendationStance,
  RecommendationConflictAnalysis,
  BenchmarkScoringMeta,
} from "./types.js";

const CITY_STATE_PATTERN =
  /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/;

function containsTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function mentionsIivo(answer: string): boolean {
  return /\biivo\b/i.test(answer);
}

function extractCapitalizedPhrase(text: string): string | undefined {
  const trimmed = text.trim().replace(/[.";]+$/, "");
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){2,5}$/.test(trimmed)) return trimmed;
  return undefined;
}

export function detectInventedExpansion(answer: string): { detected: boolean; phrase?: string } {
  const permutedBad =
    /\b(?:integrated|intelligent)\s+(?:integrated|intelligent)\s+virtual\s+operations\b/i;
  if (permutedBad.test(answer)) {
    const m = answer.match(
      /\b((?:Integrated|Intelligent)(?:\s+(?:Integrated|Intelligent))?\s+Virtual\s+Operations)\b/i,
    );
    return { detected: true, phrase: m?.[1] ?? "Integrated/Intelligent Virtual Operations" };
  }

  const introPatterns = [
    /\biivo\s*,?\s*or\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,5})/i,
    /\biivo\s*,?\s*short\s+for\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,5})/i,
    /\biivo\s*,?\s*meaning\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,5})/i,
    /\biivo\s+stands\s+for\s+"?([^".\n;]{3,120})/i,
    /\biivo\s+means\s+"?([^".\n;]{3,120})/i,
    /\biivo\s*\(\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,5})\s*\)/i,
    /\biivo\s*[-–—:]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,5})/i,
  ];

  for (const pattern of introPatterns) {
    const match = pattern.exec(answer);
    const raw = match?.[1]?.trim();
    if (!raw) continue;
    const phrase = extractCapitalizedPhrase(raw) ?? raw.split(/[,.]/)[0]?.trim();
    if (phrase && phrase.split(/\s+/).length >= 3) {
      return { detected: true, phrase };
    }
  }

  const iivoMatch = /\biivo\b/i.exec(answer);
  if (iivoMatch) {
    const window = answer.slice(iivoMatch.index!, iivoMatch.index! + 140);
    const capPhrase = window.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){2,5})\b/);
    if (capPhrase?.[1] && !/^IIVO$/i.test(capPhrase[1])) {
      const between = window.slice(0, capPhrase.index ?? 0);
      if (/\b(or|for|meaning|short|stands|means|[-–—:(])\b/i.test(between) || between.length < 40) {
        return { detected: true, phrase: capPhrase[1] };
      }
    }
  }

  return { detected: false };
}

export function evaluateSubjectAlignment(
  answer: string,
  expectedTerms: string[] = [],
  forbiddenTerms: string[] = [],
  context: SubjectAlignmentContextOptions = {},
): SubjectAlignmentSide {
  const requiredContextTerms = context.requiredContextTerms ?? [];
  const requireProductContextMin = context.requireProductContextMin ?? 0;
  const matchedContextTerms = requiredContextTerms.filter((t) => containsTerm(answer, t));
  const insufficientProductContext =
    requireProductContextMin > 0 && matchedContextTerms.length < requireProductContextMin;

  const expansion = detectInventedExpansion(answer);
  const possibleInventedExpansion =
    expansion.detected && insufficientProductContext;

  if (!expectedTerms.length && !forbiddenTerms.length && requireProductContextMin === 0) {
    return {
      subjectAlignmentScore: 10,
      wrongSubject: false,
      matchedExpected: [],
      matchedForbidden: [],
      matchedContextTerms,
      requiredContextMin: requireProductContextMin,
      insufficientProductContext,
      possibleInventedExpansion,
      detectedExpansion: expansion.phrase,
    };
  }

  const matchedExpected = expectedTerms.filter((t) => containsTerm(answer, t));
  const matchedForbidden = forbiddenTerms.filter((t) => containsTerm(answer, t));
  const productTerms = expectedTerms.filter((t) => !/^iivo$/i.test(t.trim()));
  const matchedProductTerms = productTerms.filter((t) => containsTerm(answer, t));

  const hasExpected = matchedExpected.length > 0;
  const hasProductContext =
    matchedContextTerms.length >= requireProductContextMin ||
    (requireProductContextMin === 0 &&
      (matchedProductTerms.length > 0 || (productTerms.length === 0 && hasExpected)));
  const hasForbidden = matchedForbidden.length > 0;

  let wrongSubject = false;
  const explanationParts: string[] = [];
  let subjectAlignmentScore = 10;

  if (hasForbidden && !hasProductContext) {
    wrongSubject = true;
    subjectAlignmentScore = 0;
    explanationParts.push("Answer appears to address the wrong subject.");
  } else if (hasForbidden && hasProductContext) {
    subjectAlignmentScore = 4;
    explanationParts.push("Answer mixes expected product terms with forbidden wrong-subject terms.");
  } else if (insufficientProductContext && mentionsIivo(answer)) {
    subjectAlignmentScore = Math.min(3, matchedContextTerms.length + 1);
    explanationParts.push(
      "Answer uses IIVO but does not show enough product-specific context.",
    );
  } else if (hasProductContext) {
    subjectAlignmentScore = Math.min(10, 6 + matchedContextTerms.length + matchedExpected.length);
  } else if (expectedTerms.length > 0) {
    subjectAlignmentScore = 3;
    explanationParts.push("Answer did not include expected subject terms for this prompt.");
  }

  if (possibleInventedExpansion) {
    subjectAlignmentScore = Math.min(subjectAlignmentScore, 2);
    explanationParts.push("Possible invented acronym expansion.");
  }

  return {
    subjectAlignmentScore,
    wrongSubject,
    matchedExpected,
    matchedForbidden,
    matchedContextTerms,
    requiredContextMin: requireProductContextMin,
    insufficientProductContext,
    possibleInventedExpansion,
    detectedExpansion: expansion.phrase,
    explanation: explanationParts.length ? explanationParts.join(" ") : undefined,
  };
}

function promptMentionsLocation(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  if (CITY_STATE_PATTERN.test(prompt)) return true;
  if (/\b(city|location|region|state|local area|near me|zip code)\b/i.test(lower)) return true;
  if (/\b(montgomery|san francisco|new york|los angeles|chicago|austin|miami|dallas|seattle)\b/i.test(lower)) {
    return true;
  }
  return false;
}

function answerHasCitationSignals(answer: string): boolean {
  return /\b(http|www\.|source|citation|according to|verified|bbb\.org|\[.*\]\(.*\))/i.test(answer);
}

export function detectUnsupportedAssumptions(input: {
  prompt: string;
  baselineAnswer: string;
  iivoAnswer: string;
  iivoHasSources: boolean;
  detectUnsupportedLocation?: boolean;
}): UnsupportedAssumptionWarning[] {
  if (!input.detectUnsupportedLocation || promptMentionsLocation(input.prompt)) {
    return [];
  }

  const warnings: UnsupportedAssumptionWarning[] = [];

  for (const [side, answer, hasSources] of [
    ["baseline", input.baselineAnswer, false],
    ["iivo", input.iivoAnswer, input.iivoHasSources],
  ] as const) {
    const cityMatch = answer.match(CITY_STATE_PATTERN);
    const bbbMention = /\bBBB\b|better business bureau/i.test(answer);
    const namedListing = /\b(listing|directory)\b/i.test(answer) && /\b[A-Z][a-z]+,\s*[A-Z]{2}\b/.test(answer);

    if (cityMatch || bbbMention || namedListing) {
      const location = cityMatch?.[0] ?? "a specific location";
      const cited = hasSources || answerHasCitationSignals(answer);
      if (!cited) {
        warnings.push({
          side,
          message: `Answer introduced unsupported location specificity (${location}${bbbMention ? ", BBB listings" : ""}).`,
        });
      }
    }
  }

  return warnings;
}

export function extractRecommendationStance(answer: string): RecommendationStance {
  const lower = answer.toLowerCase();

  const testManual =
    /\b(test manually|manual test|manual sms|run a manual|prototype first|don't build|do not build|without building|before committing to full development|before building)\b/i.test(
      lower,
    );
  const wait =
    /\b(wait until|delay|hold off|after \d+|until after|rather than waiting.*no\b)/i.test(lower) &&
    !/\badd sms now|implement.*now|build.*now\b/i.test(lower);
  const buildNow =
    /\b(add sms now|implement.*now|build.*now|recommend adding|add.*now rather than waiting|initiate a lean development|create a basic version)\b/i.test(
      lower,
    );

  if (testManual && !buildNow) return "test_manual";
  if (buildNow && !testManual) return "build_now";
  if (wait) return "wait";
  if (testManual && buildNow) return "unclear";
  return "unclear";
}

function stanceLabel(stance: RecommendationStance): string {
  switch (stance) {
    case "build_now":
      return "build or add now";
    case "wait":
      return "wait or delay";
    case "test_manual":
      return "test manually first";
    default:
      return "unclear";
  }
}

function scoreRecommendationQuality(answer: string, prompt: string): number {
  const lower = answer.toLowerCase();
  let score = 0;

  if (/\bevidence\b|\bwould change\b|\bthreshold\b|\bif \d+/i.test(lower)) score += 3;
  if (/\bbuild\b.*\b(cost|sales|close|customer|pilot)\b|\btradeoff\b|\bvs\b/i.test(lower)) score += 2;
  if (/^\s*\d+[\.)]/m.test(answer) || /^\s*[-*•]/m.test(answer)) score += 2;
  if (/\brisk\b|\bdownside\b|\bmain risk\b/i.test(lower)) score += 2;

  const wantsSalesFit = /do not want to build features that do not help me close/i.test(prompt);
  const stance = extractRecommendationStance(answer);
  if (wantsSalesFit) {
    if (stance === "test_manual" || stance === "wait") score += 3;
    if (stance === "build_now" && !/\bvalidate|test|pilot|manual|evidence\b/i.test(lower)) score -= 3;
  }

  return Math.max(0, Math.min(12, score));
}

export function analyzeRecommendationConflict(input: {
  prompt: string;
  baselineAnswer: string;
  iivoAnswer: string;
  enabled?: boolean;
}): RecommendationConflictAnalysis | undefined {
  if (!input.enabled) return undefined;

  const baselineStance = extractRecommendationStance(input.baselineAnswer);
  const iivoStance = extractRecommendationStance(input.iivoAnswer);

  const opposite =
    (baselineStance === "build_now" && (iivoStance === "test_manual" || iivoStance === "wait")) ||
    (iivoStance === "build_now" && (baselineStance === "test_manual" || baselineStance === "wait"));

  const baselineQualityBonus = scoreRecommendationQuality(input.baselineAnswer, input.prompt);
  const iivoQualityBonus = scoreRecommendationQuality(input.iivoAnswer, input.prompt);

  if (!opposite) {
    return {
      conflictDetected: false,
      baselineStance,
      iivoStance,
      baselineQualityBonus,
      iivoQualityBonus,
    };
  }

  return {
    conflictDetected: true,
    baselineStance,
    iivoStance,
    baselineRecommendation: stanceLabel(baselineStance),
    iivoRecommendation: stanceLabel(iivoStance),
    explanation:
      "Recommendation conflict detected. Scoring compares evidence thresholds, build-vs-sales fit, risks, and next actions instead of granting equal criteria credit.",
    baselineQualityBonus,
    iivoQualityBonus,
  };
}

export function applyWrongSubjectCap(total: number, wrongSubject: boolean): number {
  if (wrongSubject) return Math.min(total, WRONG_SUBJECT_SCORE_CAP);
  return total;
}

export function applyProductContextCap(
  total: number,
  alignment: SubjectAlignmentSide,
): number {
  if (alignment.wrongSubject) return total;
  if (alignment.possibleInventedExpansion) {
    return Math.min(total, INVENTED_EXPANSION_SCORE_CAP);
  }
  if (alignment.insufficientProductContext && alignment.matchedContextTerms.length === 0) {
    return Math.min(total, INSUFFICIENT_CONTEXT_SCORE_CAP);
  }
  return total;
}

export function computeCostWinner(
  baselineCostUsd: number | null,
  iivoCostUsd: number | null,
): BenchmarkWinner {
  if (baselineCostUsd == null || iivoCostUsd == null) return "tie";
  if (iivoCostUsd < baselineCostUsd * 0.95) return "iivo";
  if (baselineCostUsd < iivoCostUsd * 0.95) return "baseline";
  return "tie";
}

export function computeQualityWinner(
  baselineTotal: number,
  iivoTotal: number,
): { winner: BenchmarkWinner; scoreDifference: number; scoreDifferencePercent: number } {
  const scoreDifference = iivoTotal - baselineTotal;
  const base = Math.max(baselineTotal, 1);
  const scoreDifferencePercent = Math.round((scoreDifference / base) * 1000) / 10;

  if (Math.abs(scoreDifferencePercent) <= 5) {
    return { winner: "tie", scoreDifference, scoreDifferencePercent };
  }
  if (scoreDifferencePercent >= 5) {
    return { winner: "iivo", scoreDifference, scoreDifferencePercent };
  }
  return { winner: "baseline", scoreDifference, scoreDifferencePercent };
}

function failedProductContextAlignment(side: SubjectAlignmentSide): boolean {
  return (
    side.wrongSubject ||
    side.insufficientProductContext ||
    side.subjectAlignmentScore <= 3
  );
}

function passedProductContextAlignment(
  side: SubjectAlignmentSide,
  requireProductContextMin: number,
): boolean {
  return (
    side.subjectAlignmentScore >= 7 &&
    !side.insufficientProductContext &&
    !side.wrongSubject &&
    side.matchedContextTerms.length >= requireProductContextMin
  );
}

export function computeQualityWinnerWithContext(input: {
  baselineTotal: number;
  iivoTotal: number;
  subjectAlignment: SubjectAlignmentResult;
  requireProductContextMin?: number;
}): {
  qualityWinner: BenchmarkWinner;
  winnerOverrideReason?: string;
  scoreDifference: number;
  scoreDifferencePercent: number;
} {
  const raw = computeQualityWinner(input.baselineTotal, input.iivoTotal);
  const min = input.requireProductContextMin ?? 0;

  if (min <= 0) {
    return {
      qualityWinner: raw.winner,
      scoreDifference: raw.scoreDifference,
      scoreDifferencePercent: raw.scoreDifferencePercent,
    };
  }

  const baselineFailed = failedProductContextAlignment(input.subjectAlignment.baseline);
  const iivoFailed = failedProductContextAlignment(input.subjectAlignment.iivo);
  const baselinePassed = passedProductContextAlignment(input.subjectAlignment.baseline, min);
  const iivoPassed = passedProductContextAlignment(input.subjectAlignment.iivo, min);

  if (baselineFailed && iivoPassed) {
    return {
      qualityWinner: "iivo",
      winnerOverrideReason:
        "Baseline failed subject alignment while IIVO answered the product context correctly.",
      scoreDifference: raw.scoreDifference,
      scoreDifferencePercent: raw.scoreDifferencePercent,
    };
  }

  if (iivoFailed && baselinePassed) {
    return {
      qualityWinner: "baseline",
      winnerOverrideReason:
        "IIVO failed subject alignment while the baseline answered the product context correctly.",
      scoreDifference: raw.scoreDifference,
      scoreDifferencePercent: raw.scoreDifferencePercent,
    };
  }

  return {
    qualityWinner: raw.winner,
    scoreDifference: raw.scoreDifference,
    scoreDifferencePercent: raw.scoreDifferencePercent,
  };
}

export function computeValueVerdict(input: {
  qualityWinner: BenchmarkWinner;
  baselineCostUsd: number | null;
  iivoCostUsd: number | null;
  scoreDifferencePercent: number;
  baselineWrongSubject: boolean;
  iivoWrongSubject: boolean;
  baselineInventedExpansion?: boolean;
  iivoInventedExpansion?: boolean;
  baselineInsufficientContext?: boolean;
  iivoInsufficientContext?: boolean;
}): { valueVerdict: ValueVerdict; valueVerdictExplanation: string } {
  const costRatio =
    input.baselineCostUsd != null &&
    input.iivoCostUsd != null &&
    input.baselineCostUsd > 0
      ? input.iivoCostUsd / input.baselineCostUsd
      : null;

  if (input.baselineWrongSubject && !input.iivoWrongSubject) {
    return {
      valueVerdict: "worth_it",
      valueVerdictExplanation:
        "Baseline answered the wrong subject while IIVO stayed on topic — extra orchestration cost is justified (heuristic).",
    };
  }

  if (
    (input.baselineInventedExpansion || input.baselineInsufficientContext) &&
    !input.iivoInventedExpansion &&
    !input.iivoInsufficientContext &&
    !input.baselineWrongSubject
  ) {
    return {
      valueVerdict: "worth_it",
      valueVerdictExplanation:
        "Baseline lacked IIVO product context or used a possible invented expansion while IIVO described the product correctly — worth the extra cost (heuristic).",
    };
  }

  if (input.iivoWrongSubject && !input.baselineWrongSubject) {
    return {
      valueVerdict: "not_worth_it",
      valueVerdictExplanation:
        "IIVO answered the wrong subject while the baseline did not — council cost was not worth it (heuristic).",
    };
  }

  if (input.qualityWinner === "iivo") {
    const winPct = Math.abs(input.scoreDifferencePercent);
    const iivoCost = input.iivoCostUsd ?? 0;

    if (winPct >= 15 && iivoCost <= 0.1) {
      return {
        valueVerdict: "worth_it",
        valueVerdictExplanation: `IIVO won by ~${winPct}% at ~$${iivoCost.toFixed(4)} — worth it for this serious decision (heuristic).`,
      };
    }
    if (winPct >= 5 && winPct < 15 && costRatio != null && costRatio >= 10) {
      return {
        valueVerdict: "marginal",
        valueVerdictExplanation: `IIVO won modestly (~${winPct}%) but cost ~${Math.round(costRatio)}× more — marginal value (heuristic).`,
      };
    }
    if (winPct >= 15 && costRatio != null && costRatio >= 10) {
      return {
        valueVerdict: "marginal",
        valueVerdictExplanation: `IIVO won strongly (~${winPct}%) but cost ~${Math.round(costRatio)}× more — quality gain may justify cost depending on stakes (heuristic).`,
      };
    }
    if (winPct >= 5) {
      return {
        valueVerdict: "worth_it",
        valueVerdictExplanation: `IIVO won by ~${winPct}% with acceptable relative cost — worth it (heuristic).`,
      };
    }
  }

  if (input.qualityWinner === "tie" && costRatio != null && costRatio > 1.5) {
    return {
      valueVerdict: "not_worth_it",
      valueVerdictExplanation:
        "Scores tied but IIVO cost more — council orchestration not worth extra credits (heuristic).",
    };
  }

  if (input.qualityWinner === "baseline") {
    return {
      valueVerdict: "not_worth_it",
      valueVerdictExplanation:
        "Single-model baseline matched or beat IIVO on estimated score — extra council cost not worth it (heuristic).",
    };
  }

  return {
    valueVerdict: "marginal",
    valueVerdictExplanation: "Mixed signals on quality vs cost — review side-by-side answers (heuristic).",
  };
}

export function buildScoringMeta(input: {
  prompt: string;
  baselineAnswer: string;
  iivoAnswer: string;
  baselineCostUsd: number | null;
  iivoCostUsd: number | null;
  iivoHasSources: boolean;
  expectedTerms?: string[];
  forbiddenTerms?: string[];
  requiredContextTerms?: string[];
  requireProductContextMin?: number;
  detectUnsupportedLocation?: boolean;
  analyzeRecommendationConflict?: boolean;
  promptCategory?: BenchmarkPromptCategory;
  baselineTotal: number;
  iivoTotal: number;
  subjectAlignment: SubjectAlignmentResult;
}): BenchmarkScoringMeta {
  const subjectAlignment = input.subjectAlignment;

  const unsupportedAssumptionWarnings = detectUnsupportedAssumptions({
    prompt: input.prompt,
    baselineAnswer: input.baselineAnswer,
    iivoAnswer: input.iivoAnswer,
    iivoHasSources: input.iivoHasSources,
    detectUnsupportedLocation: input.detectUnsupportedLocation,
  });

  const recommendationConflict = analyzeRecommendationConflict({
    prompt: input.prompt,
    baselineAnswer: input.baselineAnswer,
    iivoAnswer: input.iivoAnswer,
    enabled: input.analyzeRecommendationConflict ?? input.promptCategory === "Product Decision",
  });

  const warnings: string[] = [];
  if (subjectAlignment.baseline.wrongSubject) {
    warnings.push("Baseline: Answer appears to address the wrong subject.");
  }
  if (subjectAlignment.iivo.wrongSubject) {
    warnings.push("IIVO: Answer appears to address the wrong subject.");
  }
  if (subjectAlignment.baseline.insufficientProductContext) {
    warnings.push(
      "Baseline: Answer uses IIVO but does not show enough product-specific context.",
    );
  }
  if (subjectAlignment.iivo.insufficientProductContext) {
    warnings.push("IIVO: Answer uses IIVO but does not show enough product-specific context.");
  }
  if (subjectAlignment.baseline.possibleInventedExpansion) {
    warnings.push(
      `Baseline: Possible invented acronym expansion${subjectAlignment.baseline.detectedExpansion ? ` (“${subjectAlignment.baseline.detectedExpansion}”)` : ""}.`,
    );
  }
  if (subjectAlignment.iivo.possibleInventedExpansion) {
    warnings.push(
      `IIVO: Possible invented acronym expansion${subjectAlignment.iivo.detectedExpansion ? ` (“${subjectAlignment.iivo.detectedExpansion}”)` : ""}.`,
    );
  }
  for (const w of unsupportedAssumptionWarnings) {
    warnings.push(`${w.side === "baseline" ? "Baseline" : "IIVO"}: ${w.message}`);
  }
  if (recommendationConflict?.conflictDetected) {
    warnings.push("Recommendation conflict detected.");
  }

  const qualityResult = computeQualityWinnerWithContext({
    baselineTotal: input.baselineTotal,
    iivoTotal: input.iivoTotal,
    subjectAlignment,
    requireProductContextMin: input.requireProductContextMin,
  });
  const costWinner = computeCostWinner(input.baselineCostUsd, input.iivoCostUsd);
  const { valueVerdict, valueVerdictExplanation } = computeValueVerdict({
    qualityWinner: qualityResult.qualityWinner,
    baselineCostUsd: input.baselineCostUsd,
    iivoCostUsd: input.iivoCostUsd,
    scoreDifferencePercent: qualityResult.scoreDifferencePercent,
    baselineWrongSubject: subjectAlignment.baseline.wrongSubject,
    iivoWrongSubject: subjectAlignment.iivo.wrongSubject,
    baselineInventedExpansion: subjectAlignment.baseline.possibleInventedExpansion,
    iivoInventedExpansion: subjectAlignment.iivo.possibleInventedExpansion,
    baselineInsufficientContext: subjectAlignment.baseline.insufficientProductContext,
    iivoInsufficientContext: subjectAlignment.iivo.insufficientProductContext,
  });

  return {
    subjectAlignment,
    warnings,
    unsupportedAssumptionWarnings,
    recommendationConflict,
    qualityWinner: qualityResult.qualityWinner,
    costWinner,
    valueVerdict,
    valueVerdictExplanation,
    winnerOverrideReason: qualityResult.winnerOverrideReason,
  };
}

export function isProductDecisionPrompt(category?: BenchmarkPromptCategory): boolean {
  return category === "Product Decision";
}

export function isGtmPrompt(category?: BenchmarkPromptCategory): boolean {
  return category === "Founder Strategy" || category === "Sales / GTM";
}
