import type { ResponseContract } from "./responseContract.js";
import type { RouteLane } from "./routeLane.js";

export function buildCouncilCompressionInstruction(
  lane: RouteLane,
  contract: ResponseContract,
): string {
  if (lane !== "council_hidden") return "";

  const lines = [
    "",
    "---",
    "Council compression (user-facing answer):",
    "- Council ran internally; the user must NOT see a full operator report.",
    "- Maximum 3 top-level sections in the final answer.",
    "- Do not include Decision Quality unless the contract is decision_first.",
    "- Compress strategist/critic notes into a brief \"Why this works\" after the deliverable.",
  ];

  if (contract.id === "deliverable_first") {
    lines.push(
      "- The deliverable (email, script, message) must be the first thing the user reads.",
      "- No ## Final Action Plan, Objective, or Do This First sections at the top.",
    );
  }

  if (contract.id === "rewrite_only" || contract.id === "summary_first") {
    lines.push("- Output only the rewritten/summary content plus at most one short note.");
  }

  return lines.join("\n");
}

export function shouldParseDecisionQuality(
  lane: RouteLane,
  contract: ResponseContract,
): boolean {
  if (lane === "council_hidden") return contract.id === "decision_first";
  return contract.id === "decision_first" || contract.id === "strategy_plan";
}
