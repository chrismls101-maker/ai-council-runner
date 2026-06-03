import type { BenchmarkPromptDefinition } from "../../constants/benchmarkPrompts.js";
import {
  BENCHMARK_PROMPTS,
  getBenchmarkPromptById,
} from "../../constants/benchmarkPrompts.js";
import type {
  CriteriaEvaluation,
  CriteriaMatchResult,
  RecommendationConflictAnalysis,
} from "./types.js";

export { BENCHMARK_PROMPTS, getBenchmarkPromptById };

export type { CriteriaMatchResult, CriteriaEvaluation };

/** Heuristic keyword/phrase patterns per criterion label (substring match). */
const CRITERIA_PATTERNS: Record<string, RegExp[]> = {
  "chooses one segment": [
    /\b(plumber|hvac|med spa|law office|segment|target)\b/i,
    /\b(recommend|choose|pick|start with)\b/i,
  ],
  "explains why": [/\bbecause\b/i, /\bwhy\b/i, /\brationale\b/i, /\breason\b/i],
  "gives outreach angle": [/\boutreach\b/i, /\bmessage\b/i, /\bpitch\b/i, /\bcall\b/i, /\bemail\b/i],
  "gives offer": [/\boffer\b/i, /\bpilot\b/i, /\b\$|\bprice\b/i, /\bfree trial\b/i],
  "gives first 24-hour action plan": [
    /\b24.hour\b/i,
    /\btoday\b/i,
    /\btomorrow\b/i,
    /\bfirst step\b/i,
    /\baction plan\b/i,
    /\bnext 24\b/i,
  ],
  "identifies risk": [/\brisk\b/i, /\bdownside\b/i, /\bcaution\b/i, /\bavoid\b/i],
  "avoids vague advice": [/\bspecific\b/i, /\b(segment|offer|message)\b/i],
  "makes a clear recommendation": [/\brecommend\b/i, /\bshould\b/i, /\bwait\b/i, /\bnow\b/i, /\badd sms\b/i],
  "considers build cost vs sales value": [/\bbuild\b/i, /\bsales\b/i, /\bcost\b/i, /\bclose\b/i, /\bcustomer\b/i],
  "states what evidence would change the decision": [
    /\bevidence\b/i,
    /\bwould change\b/i,
    /\bif\b.*\b(pilot|customer|reply)\b/i,
    /\bthreshold\b/i,
  ],
  "gives immediate next steps": [
    /\bnext\b/i,
    /\bstep\b/i,
    /\baction\b/i,
    /^\s*\d+[\.)]/m,
    /^\s*[-*•]/m,
  ],
  "includes segment": [/\bsegment\b/i, /\btarget\b/i, /\b(plumber|hvac|service business)\b/i],
  "includes specific pitch": [/\bpitch\b/i, /\bmessage\b/i, /\bscript\b/i, /\bsay\b/i],
  "includes objection handling": [/\bobjection\b/i, /\btoo expensive\b/i, /\bhandle\b/i, /\brespond\b/i],
  "includes measurable pass/fail threshold": [
    /\b50\b/i,
    /\bthreshold\b/i,
    /\bpass\b/i,
    /\bfail\b/i,
    /\bmetric\b/i,
    /\bmeasure\b/i,
    /\breply rate\b/i,
  ],
  'avoids generic "network and post content" advice': [/\boutreach\b/i, /\bcontact\b/i, /\btest\b/i],
  "separates IIVO from model hubs": [
    /\borchestrat\b/i,
    /\brout\b/i,
    /\bdecision engine\b/i,
    /\bnot (just|only) a wrapper\b/i,
    /\bcouncil\b/i,
  ],
  "identifies weak claims": [/\bavoid\b/i, /\bweak\b/i, /\boverclaim\b/i, /\bdon't\b/i, /\bdo not\b/i],
  "gives clear positioning": [/\bposition\b/i, /\bwedge\b/i, /\bfor founders\b/i, /\bstatement\b/i],
  "gives target user": [/\bfounder\b/i, /\boperator\b/i, /\bbuyer\b/i, /\buser\b/i, /\bteam\b/i],
  "avoids overclaiming": [/\bestimat\b/i, /\bheuristic\b/i, /\bwithout overclaim\b/i, /\bavoid claiming\b/i],
  "ranks risks": [/\b(rank|top|priority|order)\b/i, /\b\d+[\.)]/],
  "covers cost abuse": [/\bcost\b/i, /\bcredit\b/i, /\babuse\b/i, /\blimit\b/i],
  "covers data/privacy": [/\bprivacy\b/i, /\bdata\b/i, /\bsecret\b/i, /\bpii\b/i],
  "covers API failures": [/\bapi\b/i, /\bfail\b/i, /\breliab\b/i, /\boutage\b/i, /\bfallback\b/i],
  "covers routing mistakes": [/\brout\b/i, /\bmisrout\b/i, /\bwrong workflow\b/i],
  "gives fix order": [/\bfix\b/i, /\border\b/i, /\bfirst\b/i, /\bthen\b/i, /\bpriority\b/i],
  "compares categories": [/\bchatbot\b/i, /\bsearch\b/i, /\bagent builder\b/i, /\bautomation\b/i, /\bcompare\b/i],
  "names buyer": [/\bbuyer\b/i, /\bfounder\b/i, /\boperator\b/i, /\bteam\b/i],
  "names threat": [/\bthreat\b/i, /\brisk\b/i, /\bcompet\b/i, /\bchatgpt\b/i],
  "gives category recommendation": [/\bcategory\b/i, /\brecommend\b/i, /\bdecision engine\b/i, /\borchestrat\b/i],
  "avoids fantasy valuation claims": [/\bavoid\b/i, /\bvaluation\b/i, /\brealistic\b/i],
  "uses prior outcome": [/\b0 reply\b/i, /\b30 contact\b/i, /\bprevious\b/i, /\bprior\b/i, /\boutreach test\b/i],
  "does not overgeneralize from small sample": [/\bsmall sample\b/i, /\b30\b/i, /\btoo early\b/i, /\blimited data\b/i],
  "gives revised test": [/\btest\b/i, /\bangle\b/i, /\bmissed.call\b/i, /\brecovery\b/i],
  "gives measurable next threshold": [/\bthreshold\b/i, /\bmetric\b/i, /\bmeasure\b/i, /\b\d+\b/],
  "one model is enough": [/\biivo\b/i, /\bdecision engine\b/i, /\brout\b/i],
  "benchmark should likely show tie or small difference": [/\biivo\b/i],
  "helps prove IIVO does not always need council": [/\bdirect\b/i, /\bsimple\b/i, /\biivo\b/i],
};

function normalizeCriterionKey(criterion: string): string {
  return criterion.trim().toLowerCase();
}

function matchCriterion(answer: string, criterion: string): CriteriaMatchResult {
  const lower = answer.toLowerCase();
  const patterns =
    CRITERIA_PATTERNS[criterion] ??
    CRITERIA_PATTERNS[
      Object.keys(CRITERIA_PATTERNS).find(
        (k) => normalizeCriterionKey(k) === normalizeCriterionKey(criterion),
      ) ?? ""
    ] ??
    [new RegExp(criterion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").split(/\s+/).slice(0, 3).join("|"), "i")];

  const matched = patterns.some((re) => re.test(lower) || re.test(answer));
  return {
    criterion,
    matched,
    note: matched ? "Criteria matched (heuristic)" : "Not detected (heuristic)",
  };
}

export function evaluateSuccessCriteria(
  baselineAnswer: string,
  iivoAnswer: string,
  criteria: string[],
): CriteriaEvaluation {
  const baseline = criteria.map((c) => matchCriterion(baselineAnswer, c));
  const iivo = criteria.map((c) => matchCriterion(iivoAnswer, c));
  const baselineMatchedCount = baseline.filter((c) => c.matched).length;
  const iivoMatchedCount = iivo.filter((c) => c.matched).length;

  let criteriaWinner: CriteriaEvaluation["criteriaWinner"] = "tie";
  if (iivoMatchedCount > baselineMatchedCount) criteriaWinner = "iivo";
  else if (baselineMatchedCount > iivoMatchedCount) criteriaWinner = "baseline";

  return {
    baseline,
    iivo,
    baselineMatchedCount,
    iivoMatchedCount,
    missingBaseline: baseline.filter((c) => !c.matched).map((c) => c.criterion),
    missingIivo: iivo.filter((c) => !c.matched).map((c) => c.criterion),
    criteriaWinner,
  };
}

const CONFLICT_SENSITIVE_CRITERIA = new Set([
  "makes a clear recommendation",
  "considers build cost vs sales value",
  "states what evidence would change the decision",
  "gives immediate next steps",
]);

export function adjustCriteriaForRecommendationConflict(
  criteriaEvaluation: CriteriaEvaluation,
  conflict: RecommendationConflictAnalysis,
): CriteriaEvaluation {
  if (!conflict.conflictDetected) return criteriaEvaluation;

  const baselineThreshold = conflict.baselineQualityBonus;
  const iivoThreshold = conflict.iivoQualityBonus;

  const adjustSide = (
    items: CriteriaMatchResult[],
    threshold: number,
    peerThreshold: number,
  ): CriteriaMatchResult[] =>
    items.map((item) => {
      if (!CONFLICT_SENSITIVE_CRITERIA.has(item.criterion) || !item.matched) return item;
      if (threshold < 6 && threshold < peerThreshold) {
        return {
          ...item,
          matched: false,
          note: "Criteria not credited — weaker recommendation quality under conflict analysis",
        };
      }
      if (threshold >= 8 && threshold > peerThreshold) {
        return {
          ...item,
          matched: true,
          note: "Criteria matched with stronger recommendation quality under conflict analysis",
        };
      }
      return item;
    });

  const baseline = adjustSide(criteriaEvaluation.baseline, baselineThreshold, iivoThreshold);
  const iivo = adjustSide(criteriaEvaluation.iivo, iivoThreshold, baselineThreshold);

  const baselineMatchedCount = baseline.filter((c) => c.matched).length;
  const iivoMatchedCount = iivo.filter((c) => c.matched).length;
  let criteriaWinner: CriteriaEvaluation["criteriaWinner"] = "tie";
  if (iivoMatchedCount > baselineMatchedCount) criteriaWinner = "iivo";
  else if (baselineMatchedCount > iivoMatchedCount) criteriaWinner = "baseline";

  return {
    baseline,
    iivo,
    baselineMatchedCount,
    iivoMatchedCount,
    missingBaseline: baseline.filter((c) => !c.matched).map((c) => c.criterion),
    missingIivo: iivo.filter((c) => !c.matched).map((c) => c.criterion),
    criteriaWinner,
  };
}

export function resolveLibraryPrompt(
  promptLibraryId?: string,
  prompt?: string,
): BenchmarkPromptDefinition | undefined {
  if (promptLibraryId) return getBenchmarkPromptById(promptLibraryId);
  if (!prompt) return undefined;
  return BENCHMARK_PROMPTS.find((p) => p.prompt.trim() === prompt.trim());
}
