/**
 * Glass Pathways — post-parse quality heuristics.
 * Pure module for assessing whether a generated pathway is too generic.
 */

import type { GlassPathway, GlassPathwayStage } from "./glassPathwaysTypes.ts";

export const GENERIC_WHY_IT_MATTERS_FALLBACK =
  "This stage moves you closer to your goal.";

const FILLER_PHRASES = [
  /\breview your progress\b/i,
  /\bmake sure to\b/i,
  /\bstay organized\b/i,
  /\bkeep track\b/i,
  /\bitem\s*\d+\b/i,
  /\bmistake\s*\d+\b/i,
  /\bdone when\b/i,
];

const PLACEHOLDER_ARRAY_ITEMS = new Set([
  "item 1",
  "item 2",
  "mistake 1",
  "done when…",
  "done when...",
]);

function guidanceArrayCount(stage: GlassPathwayStage): number {
  const criteriaCount = stage.completionCriteria?.length ?? 0;
  const arrays = [
    stage.whatToReview ?? [],
    stage.commonMistakes,
    stage.alethiaHelp ?? [],
    stage.userActions ?? [],
    criteriaCount > 0 ? [""] : [],
  ];
  return arrays.filter((arr) => arr.length > 0).length;
}

function hasFillerText(text: string): boolean {
  return FILLER_PHRASES.some((re) => re.test(text));
}

function hasPlaceholderArrayItems(stage: GlassPathwayStage): boolean {
  const criteriaStrings = stage.completionCriteria?.map((c) => c.description) ?? [];
  const allItems = [
    ...(stage.whatToReview ?? []),
    ...stage.commonMistakes,
    ...(stage.alethiaHelp ?? []),
    ...(stage.userActions ?? []),
    ...criteriaStrings,
  ];
  return allItems.some((item) => PLACEHOLDER_ARRAY_ITEMS.has(item.trim().toLowerCase()));
}

function extractGoalKeywords(goal: string): string[] {
  const stop = new Set([
    "a", "an", "the", "and", "or", "for", "with", "my", "to", "of", "in", "on", "app", "build",
    "launch", "create", "make", "plan", "start",
  ]);
  return goal
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w));
}

function stageTitleMatchesGoal(stageTitle: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const lower = stageTitle.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

export interface PathwayQualityResult {
  ok: boolean;
  issues: string[];
}

export function assessPathwayQuality(pathway: GlassPathway): PathwayQualityResult {
  const issues: string[] = [];
  const keywords = extractGoalKeywords(pathway.goal);

  const titles = new Set<string>();
  for (const stage of pathway.stages) {
    const titleKey = stage.title.trim().toLowerCase();
    if (titles.has(titleKey)) {
      issues.push(`Duplicate stage title: "${stage.title}"`);
    }
    titles.add(titleKey);

    if (stage.whyItMatters === GENERIC_WHY_IT_MATTERS_FALLBACK) {
      issues.push(`Stage "${stage.title}" has generic whyItMatters`);
    }

    if (guidanceArrayCount(stage) < 3) {
      issues.push(`Stage "${stage.title}" has too few guidance sections filled`);
    }

    if ((stage.userActions?.length ?? 0) === 0 && stage.stepIds.length === 0) {
      const stageStepCount = pathway.steps.filter((s) => s.stageId === stage.id).length;
      if (stageStepCount === 0) {
        issues.push(`Stage "${stage.title}" is missing userActions`);
      }
    }

    if (hasFillerText(stage.title) || hasFillerText(stage.objective) || hasFillerText(stage.whyItMatters)) {
      issues.push(`Stage "${stage.title}" contains filler phrasing`);
    }

    if (hasPlaceholderArrayItems(stage)) {
      issues.push(`Stage "${stage.title}" contains placeholder array items`);
    }
  }

  if (
    keywords.length >= 2
    && !pathway.stages.some((stage) => stageTitleMatchesGoal(stage.title, keywords))
  ) {
    issues.push("No stage titles appear specific to the user's goal");
  }

  if (hasFillerText(pathway.title) || hasFillerText(pathway.summary)) {
    issues.push("Pathway title or summary contains filler phrasing");
  }

  return { ok: issues.length === 0, issues };
}

export function pickPathwayAfterQualityCheck(
  pathway: GlassPathway,
  attempt: number,
  maxAttempts: number,
  buildRefinementPrompt: (issues: string[]) => string,
): { pathway?: GlassPathway; retryPrompt?: string; error?: string } {
  const quality = assessPathwayQuality(pathway);
  if (quality.ok) return { pathway };

  if (attempt < maxAttempts - 1) {
    return {
      retryPrompt: buildRefinementPrompt(quality.issues),
    };
  }

  return {
    pathway,
    error: quality.issues.length > 0
      ? `Pathway quality check failed: ${quality.issues.slice(0, 3).join("; ")}`
      : undefined,
  };
}
