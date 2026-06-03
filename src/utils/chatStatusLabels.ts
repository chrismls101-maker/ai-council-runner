import type { AgentId, AgentStatus } from "../types";

export const DIRECT_ANSWER_WORKFLOW = "direct_answer";

interface RoleChatLabel {
  role: string;
  running: string;
  /** Override for entity_search research step (Sales Attack). */
  entitySearchRunning?: string;
}

type WorkflowChatLabels = Record<AgentId, RoleChatLabel>;

const CHAT_LABELS: Record<string, WorkflowChatLabels> = {
  "sales-attack": {
    strategy: { role: "Strategist", running: "thinking…" },
    critic: { role: "Critic", running: "reviewing…" },
    research: {
      role: "Research Scout",
      running: "searching…",
      entitySearchRunning: "searching verified sources…",
    },
    salesWriter: { role: "Sales Writer", running: "drafting…" },
    finalJudge: { role: "Final Judge", running: "deciding…" },
  },
  "product-decision": {
    strategy: { role: "Product Strategist", running: "thinking…" },
    critic: { role: "Risk Critic", running: "reviewing…" },
    research: { role: "Market Researcher", running: "searching…" },
    salesWriter: { role: "Implementation Planner", running: "drafting…" },
    finalJudge: { role: "Final Judge", running: "deciding…" },
  },
  "market-research": {
    strategy: { role: "Research Strategist", running: "thinking…" },
    critic: { role: "Skeptic", running: "reviewing…" },
    research: { role: "Source Researcher", running: "searching…" },
    salesWriter: { role: "Opportunity Analyst", running: "analyzing…" },
    finalJudge: { role: "Final Briefing Judge", running: "deciding…" },
  },
  "competitive-intelligence": {
    strategy: { role: "Competitor Researcher", running: "searching…" },
    critic: { role: "Weakness Critic", running: "reviewing…" },
    research: { role: "Positioning Analyst", running: "analyzing…" },
    salesWriter: { role: "Strategic Operator", running: "planning…" },
    finalJudge: { role: "Final Judge", running: "deciding…" },
  },
  "technical-audit": {
    strategy: { role: "Technical Architect", running: "reviewing…" },
    critic: { role: "Risk Auditor", running: "inspecting…" },
    research: { role: "Implementation Critic", running: "challenging…" },
    salesWriter: { role: "QA Planner", running: "preparing…" },
    finalJudge: { role: "Final Technical Judge", running: "deciding…" },
  },
};

const FALLBACK_LABELS = CHAT_LABELS["sales-attack"];

export function resolveEffectiveWorkflowId(
  workflow: string,
  routerSelectedWorkflow: string | undefined,
  isDirectAnswer: boolean,
): string {
  if (isDirectAnswer) return DIRECT_ANSWER_WORKFLOW;
  if (routerSelectedWorkflow && routerSelectedWorkflow !== "auto") {
    return routerSelectedWorkflow;
  }
  if (workflow && workflow !== "auto") return workflow;
  return "sales-attack";
}

export function getCouncilBanner(workflowLabel: string): string {
  return `IIVO is running a ${workflowLabel} council…`;
}

export function getRouterCompleteLabel(
  workflowLabel: string,
  confidence?: number,
): string {
  const base = `IIVO routed this as: ${workflowLabel}`;
  if (confidence != null && confidence > 0) {
    return `${base} · ${confidence}% confidence`;
  }
  return base;
}

export function getChatAgentStatusLine(options: {
  workflowId: string;
  agentId: AgentId;
  status: AgentStatus;
  isDirectAnswer: boolean;
  entitySearchActive?: boolean;
}): string {
  const { workflowId, agentId, status, isDirectAnswer, entitySearchActive } =
    options;

  if (isDirectAnswer) {
    if (status === "complete") return "IIVO answered";
    if (status === "error") return "IIVO could not complete the answer";
    return "IIVO thinking…";
  }

  const labels = CHAT_LABELS[workflowId] ?? FALLBACK_LABELS;
  const entry = labels[agentId];
  const { role } = entry;

  if (status === "running") {
    const verb =
      entitySearchActive && agentId === "research" && entry.entitySearchRunning
        ? entry.entitySearchRunning
        : entry.running;
    return `${role} ${verb}`;
  }
  if (status === "complete") return `${role} complete`;
  if (status === "error") return `${role} failed`;
  return `${role} pending`;
}

export function getDirectAnswerStatus(
  status: AgentStatus,
  running: boolean,
): AgentStatus {
  if (status === "complete") return "complete";
  if (status === "error") return "error";
  if (running || status === "running") return "running";
  return "pending";
}

export function formatDuration(ms?: number): string {
  if (ms == null) return "";
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}
