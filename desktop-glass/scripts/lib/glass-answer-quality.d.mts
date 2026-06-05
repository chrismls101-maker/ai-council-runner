import type { QaScenario } from "../../src/shared/qaScenarioTypes.ts";

export interface GlassAnswerQualityFlags {
  generic: boolean;
  context_specific: boolean;
  wrong_route: boolean;
  stub_text: boolean;
  council_formatting: boolean;
  refusal: boolean;
  cannot_see_error: boolean;
  placeholder_visual: boolean;
  missing_expected_context: boolean;
  useful_actionable: boolean;
}

export function scoreGlassAnswerQuality(input: {
  answer: string;
  contextSummary?: string;
  routeUsed?: string;
  expectedRoute?: string;
  contextKeywords?: string[];
}): GlassAnswerQualityFlags;

export function answerSimilarity(a: string, b: string): number;

export type MeetingVerdict = "strong" | "acceptable" | "weak";

export function scoreMeetingAnswer(input: { answer: string; scenario: QaScenario }): {
  verdict: MeetingVerdict;
  mentionedAnchors: string[];
  expectedFactAnchors: string[];
  expectedCallOuts: string[];
  missingFields: string[];
  missingCalledOut: boolean;
  hallucinatedOwner: boolean;
};

export type CategoryVerdict = "strong" | "acceptable" | "weak";

export function scoreCategoryAnswer(input: { answer: string; scenario: QaScenario }): {
  verdict: CategoryVerdict;
  thin: boolean;
  genericFlag: boolean;
  actionable: boolean;
  mentionedAnchors: string[];
  expectedFactAnchors: string[];
  missingFields: string[];
  missingCalledOut: boolean;
};

export function visualFixtureFailReason(input: {
  answer: string;
  contextKeywords?: string[];
}): string | null;
