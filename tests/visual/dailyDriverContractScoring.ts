/**
 * Daily Driver contract compliance checks (mirrors server contractScoring for Playwright QA).
 */

import type { FrictionKind } from "./dailyDriverReport.js";

const FORBIDDEN_OPENING = [
  /^##\s*Final Action Plan/im,
  /^###\s*Do This First/im,
  /^##\s*Decision Quality/im,
  /^##\s*Risk Flags/im,
  /^##\s*Objective/im,
  /^\*\*Recommended Action:\*\*/im,
];

export type QaContractProfile =
  | "deliverable_first"
  | "rewrite_only"
  | "support_reply_first"
  | "summary_first"
  | "decision_first"
  | "strategy_plan";

export function inferQaContractFromPrompt(prompt: string): QaContractProfile {
  if (
    /\b(privacy promises?|legal risks?|what .+ should (it|we|you) avoid|avoid (making|promising|claiming)|not legal advice)\b/i.test(
      prompt,
    )
  ) {
    return "decision_first";
  }
  if (/\b(write|draft).*(cold email|outreach email|sales email)\b/i.test(prompt)) {
    return "deliverable_first";
  }
  if (/\brewrite\b/i.test(prompt)) return "rewrite_only";
  if (/\b(support response|customer says|reply to a customer)\b/i.test(prompt)) {
    return "support_reply_first";
  }
  if (/\bsummarize\b/i.test(prompt)) return "summary_first";
  if (/\b(which should|should i .+ or)\b/i.test(prompt)) return "decision_first";
  if (/\b(strategy|go-to-market|gtm|campaign plan)\b/i.test(prompt)) return "strategy_plan";
  return "deliverable_first";
}

export function scoreAnswerContract(
  prompt: string,
  answer: string,
): { frictions: FrictionKind[]; notes: string[] } {
  const frictions: FrictionKind[] = [];
  const notes: string[] = [];
  if (!answer.trim()) return { frictions, notes };

  const contract = inferQaContractFromPrompt(prompt);
  const head = answer.trim().slice(0, 900);

  if (contract !== "strategy_plan" && contract !== "decision_first") {
    for (const re of FORBIDDEN_OPENING) {
      if (re.test(head)) {
        frictions.push("wrong_output_format", "contract_violation");
        notes.push(
          `Response contract violation: answer opened with council report formatting; expected ${contract.replace(/_/g, " ")}.`,
        );
        break;
      }
    }
  }

  if (contract === "deliverable_first") {
    const hasDeliverable =
      /\bsubject:\s*\S/i.test(answer) ||
      /\b(dear |hi |hello )[\w]/i.test(answer) ||
      (answer.length > 100 && /\n\n/.test(answer));
    if (!hasDeliverable) {
      frictions.push("deliverable_not_first");
      notes.push("User asked for a deliverable but no clear email/copy/script appeared.");
    } else if (frictions.includes("wrong_output_format")) {
      frictions.push("deliverable_not_first");
      notes.push("Deliverable may exist but was buried after a strategy report opener.");
    }
  }

  if (contract === "rewrite_only" && frictions.includes("wrong_output_format")) {
    notes.push("Rewrite task returned council report formatting instead of rewritten copy.");
  }

  return { frictions: [...new Set(frictions)], notes };
}
