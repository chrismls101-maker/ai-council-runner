/**
 * Auto-generated Aletheia session end summary — used when companion deactivates
 * so attention recovery and session recap have something to reference.
 */

export interface AletheiaSessionEndSummaryInput {
  turnCount: number;
  pendingAdviceCount: number;
  pendingAdviceHeadline?: string;
  pendingActionSummary?: string;
  frontApp?: string;
}

export function buildAletheiaSessionEndSummary(
  input: AletheiaSessionEndSummaryInput,
): string | undefined {
  const parts: string[] = [];

  if (input.pendingAdviceCount > 0) {
    const headline = input.pendingAdviceHeadline?.trim();
    const lead = headline ? ` — "${headline.slice(0, 72)}"` : "";
    parts.push(
      `${input.pendingAdviceCount} advice card${input.pendingAdviceCount === 1 ? "" : "s"} still pending${lead}`,
    );
  }

  const action = input.pendingActionSummary?.trim();
  if (action) {
    parts.push(`Action awaiting confirm: ${action.slice(0, 100)}`);
  }

  if (parts.length > 0) {
    return parts.join("; ").slice(0, 500);
  }

  if (input.turnCount > 0) {
    const app = input.frontApp?.trim();
    return app
      ? `${input.turnCount} voice turn${input.turnCount === 1 ? "" : "s"} in ${app}`
      : `${input.turnCount} voice turn${input.turnCount === 1 ? "" : "s"}`;
  }

  return undefined;
}
