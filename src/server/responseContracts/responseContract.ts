import type { TaskIntentResult } from "./taskIntent.js";

export type ResponseContractId =
  | "deliverable_first"
  | "rewrite_only"
  | "support_reply_first"
  | "summary_first"
  | "decision_first"
  | "strategy_plan"
  | "analysis_findings"
  | "vision_findings"
  | "research_brief"
  | "direct_answer";

export type ResponseContract = {
  id: ResponseContractId;
  label: string;
  answerMustStartWith: string[];
  requiredSections?: string[];
  optionalSections?: string[];
  forbiddenOpeningSections: string[];
  maxIntroWords?: number;
  styleInstruction: string;
};

const FORBIDDEN_COUNCIL_REPORT = [
  "Final Action Plan",
  "Recommended Action",
  "Decision Quality",
  "Risk Flags",
  "Do This First",
  "Do This Next",
  "Do Not Do",
  "Objective",
  "Next Move",
  "Problem Summary",
];

const CONTRACTS: Record<ResponseContractId, ResponseContract> = {
  deliverable_first: {
    id: "deliverable_first",
    label: "Deliverable first",
    answerMustStartWith: ["Subject", "Email", "Message", "Script", "Voicemail", "DM", "Copy"],
    optionalSections: ["Why this works", "Follow-up", "CTA"],
    forbiddenOpeningSections: FORBIDDEN_COUNCIL_REPORT,
    maxIntroWords: 30,
    styleInstruction:
      "Start with the requested deliverable (e.g. subject lines + email body). No council report opener.",
  },
  rewrite_only: {
    id: "rewrite_only",
    label: "Rewrite only",
    answerMustStartWith: ["Rewritten", "Here is", "Version"],
    forbiddenOpeningSections: [...FORBIDDEN_COUNCIL_REPORT, "strategic analysis", "Here is a strategic"],
    maxIntroWords: 20,
    styleInstruction: "Return rewritten copy first. Concise. No strategy memo.",
  },
  support_reply_first: {
    id: "support_reply_first",
    label: "Support reply first",
    answerMustStartWith: ["Hi", "Hello", "Thanks", "Subject", "Dear"],
    forbiddenOpeningSections: FORBIDDEN_COUNCIL_REPORT,
    maxIntroWords: 15,
    styleInstruction: "Start with a copy-paste support reply. Optional brief internal note after.",
  },
  summary_first: {
    id: "summary_first",
    label: "Summary first",
    answerMustStartWith: ["Summary", "TL;DR", "Key points", "In short"],
    forbiddenOpeningSections: FORBIDDEN_COUNCIL_REPORT,
    maxIntroWords: 25,
    styleInstruction: "Lead with the summary. No extra analysis unless asked.",
  },
  decision_first: {
    id: "decision_first",
    label: "Decision first",
    answerMustStartWith: ["Recommendation", "I recommend", "Build", "Choose", "Start with", "Yes", "No"],
    requiredSections: ["recommendation", "why", "risk", "next"],
    optionalSections: ["Decision Quality"],
    forbiddenOpeningSections: ["Final Action Plan", "Do This First", "Do This Next"],
    styleInstruction: "Start with a clear recommendation, then why, risks, and next step.",
  },
  strategy_plan: {
    id: "strategy_plan",
    label: "Strategy plan",
    answerMustStartWith: ["Plan", "Strategy", "Final Action Plan", "Objective", "Recommendation"],
    requiredSections: ["Final Action Plan"],
    forbiddenOpeningSections: [],
    styleInstruction: "Practical plan sections allowed when user asked for strategy or a plan.",
  },
  analysis_findings: {
    id: "analysis_findings",
    label: "Analysis findings",
    answerMustStartWith: ["Findings", "Key findings", "Analysis", "Assessment"],
    forbiddenOpeningSections: [],
    styleInstruction: "Start with findings, then risks and recommendations.",
  },
  vision_findings: {
    id: "vision_findings",
    label: "Vision findings",
    answerMustStartWith: ["I see", "Visible", "On the screenshot", "The screenshot shows", "Layout"],
    forbiddenOpeningSections: FORBIDDEN_COUNCIL_REPORT,
    styleInstruction: "Start with visible observations, then what matters and next move.",
  },
  research_brief: {
    id: "research_brief",
    label: "Research brief",
    answerMustStartWith: ["Answer", "Finding", "Research", "Summary"],
    forbiddenOpeningSections: [],
    styleInstruction: "Lead with the answer or finding. Cite sources when available.",
  },
  direct_answer: {
    id: "direct_answer",
    label: "Direct answer",
    answerMustStartWith: [],
    forbiddenOpeningSections: FORBIDDEN_COUNCIL_REPORT,
    styleInstruction: "Clear direct answer. No council report formatting unless requested.",
  },
};

export function selectResponseContract(
  intent: TaskIntentResult,
  _prompt: string,
): ResponseContract {
  switch (intent.intent) {
    case "asset_generation":
      return CONTRACTS.deliverable_first;
    case "rewrite_polish":
      return CONTRACTS.rewrite_only;
    case "summary":
      return CONTRACTS.summary_first;
    case "support_response":
      return CONTRACTS.support_reply_first;
    case "decision":
      return CONTRACTS.decision_first;
    case "strategy":
      return CONTRACTS.strategy_plan;
    case "analysis":
      return CONTRACTS.analysis_findings;
    case "research":
      return CONTRACTS.research_brief;
    case "vision_analysis":
      return CONTRACTS.vision_findings;
    case "direct_answer":
      return CONTRACTS.direct_answer;
    default:
      return CONTRACTS.direct_answer;
  }
}

export function getResponseContract(id: ResponseContractId): ResponseContract {
  return CONTRACTS[id];
}
