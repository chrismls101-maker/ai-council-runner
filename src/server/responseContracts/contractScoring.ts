import type { ResponseContract } from "./responseContract.js";
import type { TaskIntent } from "./taskIntent.js";

export type ContractViolationKind =
  | "contract_violation"
  | "deliverable_not_first"
  | "wrong_output_format";

const FORBIDDEN_OPENING_PATTERNS = [
  /^##\s*Final Action Plan/im,
  /^###\s*Do This First/im,
  /^##\s*Decision Quality/im,
  /^##\s*Risk Flags/im,
  /^##\s*Objective/im,
  /^##\s*Recommended Action/im,
  /^\*\*Recommended Action:\*\*/im,
  /^Recommended Action:/im,
];

export function answerOpensWithForbiddenSection(answer: string, contract: ResponseContract): boolean {
  const trimmed = answer.trim().slice(0, 800);
  for (const pattern of FORBIDDEN_OPENING_PATTERNS) {
    if (pattern.test(trimmed)) {
      if (contract.id === "strategy_plan" || contract.id === "decision_first") {
        if (/^##\s*Final Action Plan/im.test(trimmed) && contract.id === "strategy_plan") {
          continue;
        }
        if (/^##\s*Decision Quality/im.test(trimmed) && contract.id === "decision_first") {
          continue;
        }
      }
      return true;
    }
  }
  for (const forbidden of contract.forbiddenOpeningSections) {
    const re = new RegExp(`^#+\\s*${forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "im");
    if (re.test(trimmed)) return true;
    if (new RegExp(`^${forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "im").test(trimmed)) {
      return true;
    }
  }
  return false;
}

export function answerHasDeliverableSignals(answer: string, intent: TaskIntent): boolean {
  const lower = answer.toLowerCase();
  switch (intent) {
    case "asset_generation":
      return (
        /\bsubject:\s*\S/i.test(answer) ||
        /\b(dear |hi |hello )[\w]/i.test(answer) ||
        /\b(email body|cold email|cta:|call to action)\b/i.test(lower) ||
        (answer.length > 120 && /\n\n/.test(answer))
      );
    case "rewrite_polish":
      return answer.length > 40 && !answerOpensWithForbiddenSection(answer, {
        id: "rewrite_only",
        forbiddenOpeningSections: ["Final Action Plan"],
      } as ResponseContract);
    case "support_response":
      return /\b(hi |hello |dear |thanks for|we're sorry|refund|account)\b/i.test(lower);
    case "summary":
      return answer.length > 30;
    case "decision":
      return /\b(recommend|build first|choose|start with|prioritize)\b/i.test(lower);
    default:
      return answer.length > 50;
  }
}

export function scoreContractCompliance(
  contract: ResponseContract,
  intent: TaskIntent,
  answer: string,
): { violations: ContractViolationKind[]; notes: string[] } {
  const violations: ContractViolationKind[] = [];
  const notes: string[] = [];
  if (!answer.trim()) return { violations, notes };

  if (answerOpensWithForbiddenSection(answer, contract)) {
    violations.push("wrong_output_format", "contract_violation");
    notes.push(
      `Answer opened with a council report section; contract ${contract.id} forbids that opener.`,
    );
  }

  if (contract.id === "deliverable_first") {
    if (!answerHasDeliverableSignals(answer, intent)) {
      violations.push("deliverable_not_first");
      notes.push("User asked for a deliverable but no clear email/copy/script appeared.");
    } else if (violations.includes("wrong_output_format")) {
      violations.push("deliverable_not_first");
      notes.push("Deliverable may exist but was buried after a strategy report opener.");
    }
  }

  if (contract.id === "rewrite_only" && violations.includes("wrong_output_format")) {
    notes.push("Rewrite task returned council report formatting instead of copy.");
  }

  return { violations: [...new Set(violations)], notes };
}
