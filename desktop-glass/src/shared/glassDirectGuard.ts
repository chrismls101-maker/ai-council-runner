/**
 * Regression guards for IIVO Glass direct-only command bar path.
 */

export const COUNCIL_RESPONSE_MARKERS =
  /\b(Final Action Plan|Decision Quality|Risk Flags|Recommended Action|Sales Attack|Product Decision|Final Judge|Strategist complete)\b/i;

export function glassAskRequestIsDirectOnly(body: Record<string, unknown>): boolean {
  return body.mode !== "council" && body.executionMode !== "council";
}

export function glassDirectResponseIsClean(answer: string): boolean {
  return !COUNCIL_RESPONSE_MARKERS.test(answer);
}

export function sourceExcludesRunCouncilFull(source: string): boolean {
  return !/\brunCouncilFull\b/.test(source);
}

export function commandBarShouldNotAutoOpenBrowser(onSuccess: boolean): boolean {
  return !onSuccess;
}
