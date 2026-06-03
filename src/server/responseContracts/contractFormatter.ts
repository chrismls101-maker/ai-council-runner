import type { ResponseContract } from "./responseContract.js";
import type { TaskIntentResult } from "./taskIntent.js";
import type { RouteLane } from "./routeLane.js";

export function buildContractInstruction(
  contract: ResponseContract,
  intent: TaskIntentResult,
): string {
  const forbidden = contract.forbiddenOpeningSections.map((s) => `"${s}"`).join(", ");
  const mustStart =
    contract.answerMustStartWith.length > 0
      ? `The answer MUST begin with the deliverable (e.g. ${contract.answerMustStartWith.slice(0, 4).join(", ")}).`
      : "Lead with the answer the user asked for.";

  const lines = [
    "",
    "---",
    "IIVO Response Contract (required for the user-facing answer):",
    `- Task intent: ${intent.intent}`,
    `- Contract: ${contract.label} (${contract.id})`,
    `- ${mustStart}`,
    `- Style: ${contract.styleInstruction}`,
  ];

  if (forbidden) {
    lines.push(
      `- Do NOT open with council report sections: ${forbidden}.`,
      "- Do not expose internal agent debate, chain-of-thought, or council process.",
      "- If your base workflow prompt requires Final Action Plan sections, this Response Contract overrides that for the user-facing answer.",
    );
  }

  if (contract.maxIntroWords) {
    lines.push(`- Keep any intro under ${contract.maxIntroWords} words before the deliverable.`);
  }

  switch (contract.id) {
    case "deliverable_first":
      lines.push(
        "- For cold email: include Subject line(s), full email body, and CTA before any strategy notes.",
        "- Optional after the asset: brief \"Why this works\" (max 3 bullets).",
      );
      break;
    case "rewrite_only":
      lines.push("- Provide the rewritten copy immediately. Optional: 2–3 alternate versions if helpful.");
      break;
    case "support_reply_first":
      lines.push("- First block must be ready to send to the customer.");
      break;
    case "decision_first":
      lines.push(
        "- First sentence = recommendation. Then why, risks, next step.",
        "- Decision Quality section allowed but keep compact.",
      );
      break;
    case "strategy_plan":
      lines.push("- Final Action Plan and plan sections are allowed for this strategy request.");
      break;
    case "vision_findings":
      lines.push("- Describe what is visible first, then implications and next move.");
      break;
    default:
      break;
  }

  return lines.join("\n");
}

export function buildFinalJudgeContractTask(contract: ResponseContract): string {
  if (contract.id === "deliverable_first") {
    return "Produce the final USER-FACING answer. Put the requested deliverable first (email, script, copy). Use prior council work internally only. Do not open with Final Action Plan.";
  }
  if (contract.id === "rewrite_only" || contract.id === "summary_first" || contract.id === "support_reply_first") {
    return "Produce the final USER-FACING answer per the Response Contract. Prior outputs are internal context only.";
  }
  if (contract.id === "decision_first") {
    return "Produce the final answer: recommendation first, then rationale, risks, and next step.";
  }
  return "Produce the final execution plan per the Response Contract. Cut weak ideas. Prioritize ruthlessly.";
}

export function buildLaneLatencyNote(lane: RouteLane, targetSeconds?: number): string {
  if (!targetSeconds) return "";
  return `Target response time: ~${targetSeconds}s (${lane}).`;
}
