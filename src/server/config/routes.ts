import type { WorkflowId } from "./workflows.js";

export type RouterSelection = WorkflowId | "direct_answer";

export const DIRECT_ANSWER_ID = "direct_answer" as const;

export const DIRECT_ANSWER_META = {
  id: DIRECT_ANSWER_ID,
  name: "Direct Answer",
  purpose: "Simple questions answered by one model — no full council.",
};

export function isRouterSelection(value: string): value is RouterSelection {
  return value === DIRECT_ANSWER_ID || value in
    Object.fromEntries(
      [
        "sales-attack",
        "product-decision",
        "market-research",
        "competitive-intelligence",
        "technical-audit",
      ].map((id) => [id, true]),
    );
}
