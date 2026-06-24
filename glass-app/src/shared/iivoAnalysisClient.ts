/**
 * IIVO Analysis client — pure helpers only.
 *
 * Railway inference path (runCouncilAnalysis, estimateCouncilCredits,
 * buildCouncilRunRequest) has been retired. Council deliberation now runs
 * locally via src/main/councilBusPipeline.ts → runLocalCouncilDeliberation().
 *
 * This file is kept for the two pure helpers still imported by index.ts.
 * If those usages are inlined, this file can be deleted entirely.
 */

import { SESSION_ANALYSIS_PROMPT } from "./sessionPayload.ts";

export function buildSessionAnalysisPrompt(): string {
  return SESSION_ANALYSIS_PROMPT;
}

export function buildAnalysisFailureNotice(error: string): string {
  return `${error} You can try Open in IIVO instead.`;
}
