import {
  OUTCOME_STATUS_LABELS,
  tokenModeLabel as tokenModeDisplay,
  type RunHistorySummary,
} from "../types";
import { PRESET_OPTIONS } from "../types";

export type SidebarSection =
  | "console"
  | "history"
  | "final-plans"
  | "research"
  | "memory"
  | "context-library"
  | "decision-learning"
  | "benchmark-lab"
  | "settings"
  | "trust";

export type HistoryFilter =
  | "all"
  | "sales-attack"
  | "product-decision"
  | "market-research"
  | "competitive-intelligence"
  | "technical-audit"
  | "errors";

export const WORKFLOW_ICONS: Record<string, string> = {
  "sales-attack": "⌖",
  "product-decision": "▣",
  "market-research": "◎",
  "competitive-intelligence": "⬡",
  "technical-audit": ">_",
  direct_answer: "◦",
  auto: "↯",
};

export const HISTORY_FILTERS: { value: HistoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "sales-attack", label: "Sales Attack" },
  { value: "product-decision", label: "Product Decision" },
  { value: "market-research", label: "Market Research" },
  { value: "competitive-intelligence", label: "Competitive Intelligence" },
  { value: "technical-audit", label: "Technical Audit" },
  { value: "errors", label: "Errors" },
];

export const SIDEBAR_NAV: { id: SidebarSection; label: string; icon: string }[] = [
  { id: "history", label: "Decision History", icon: "history" },
  { id: "memory", label: "Memory Vault", icon: "memory" },
  { id: "context-library", label: "Context Library", icon: "context" },
  { id: "settings", label: "Settings", icon: "settings" },
  { id: "trust", label: "Trust & Privacy", icon: "trust" },
];

/** Nav sections that open the slide-out panel. */
export const PANEL_TOGGLE_SECTIONS: SidebarSection[] = [
  "history",
  "memory",
  "research",
  "final-plans",
];

/** Sections that open the optional side panel (history list, memory vault). */
export const SIDE_PANEL_SECTIONS: SidebarSection[] = ["history", "memory", "final-plans", "research"];

/** Sections that fill the main canvas (no chat composer). */
export const MAIN_PANEL_SECTIONS: SidebarSection[] = [
  "settings",
  "trust",
  "decision-learning",
  "benchmark-lab",
  "context-library",
];

export const HISTORY_LIBRARY_TABS: {
  id: SidebarSection;
  label: string;
}[] = [
  { id: "history", label: "All" },
  { id: "final-plans", label: "Saved Plans" },
  { id: "research", label: "Research" },
];

const PRESET_SHORT: Record<string, string> = {
  "ai-front-desk-sales-test": "AI Front Desk",
};

const STOP_WORDS = new Set([
  "the", "a", "an", "for", "and", "or", "to", "in", "on", "at", "with",
  "my", "our", "i", "we", "need", "want", "help", "please", "can", "you",
  "me", "is", "are", "was", "be", "this", "that", "it", "of", "from",
]);

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function extractMeaningfulWords(prompt: string, maxWords = 8): string {
  const words = prompt
    .trim()
    .replace(/\s+/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[^\w]+|[^\w]+$/g, ""))
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()));
  return words.slice(0, maxWords).map(titleCase).join(" ");
}

/** Client-side title fallback when API omits title (older runs). */
export function generateDecisionTitle(
  preset: string,
  workflowId: string,
  workflowName: string,
  prompt: string,
): string {
  const excerpt = extractMeaningfulWords(prompt, 6);
  const presetShort = PRESET_SHORT[preset] ?? PRESET_OPTIONS.find((p) => p.value === preset)?.label;

  if (presetShort && preset !== "none" && excerpt) {
    const short = PRESET_SHORT[preset] ?? presetShort.replace(" Test", "");
    return `${short} — ${excerpt}`;
  }
  if (workflowId === "competitive-intelligence" && excerpt) {
    return `Competitor Review — ${excerpt}`;
  }
  if (workflowId === "technical-audit" && excerpt) {
    return `Technical Audit — ${excerpt}`;
  }
  if (workflowId === "market-research" && excerpt) {
    const lower = excerpt.toLowerCase();
    if (lower.includes("research") || lower.includes("market")) return excerpt;
    return `${excerpt} Market Research`;
  }
  if (workflowId === "product-decision" && excerpt) {
    if (excerpt.toLowerCase().includes("decision")) return excerpt;
    return `${excerpt} Decision`;
  }
  return excerpt || workflowName || "Decision Record";
}

export function displayTitle(item: RunHistorySummary): string {
  return (
    item.title ??
    generateDecisionTitle(
      item.preset ?? "none",
      item.workflowId,
      item.workflowName,
      item.prompt ?? item.promptPreview,
    )
  );
}

export function formatStatus(status: string): string {
  if (status === "complete") return "Complete";
  if (status === "partial") return "Partial";
  if (status === "error") return "Error";
  return status;
}

export function formatHistoryQualityLine(item: RunHistorySummary): string | null {
  const parts: string[] = [item.workflowName];
  if (item.confidence) parts.push(`${item.confidence} confidence`);
  if (item.riskLevel) parts.push(`${item.riskLevel} risk`);
  if (item.outcomeStatus) {
    const label =
      OUTCOME_STATUS_LABELS[item.outcomeStatus as keyof typeof OUTCOME_STATUS_LABELS] ??
      item.outcomeStatus;
    parts.push(`Outcome: ${label}`);
  }
  return parts.length > 1 ? parts.join(" · ") : null;
}

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function filterHistory(
  items: RunHistorySummary[],
  filter: HistoryFilter,
  query: string,
): RunHistorySummary[] {
  let result = items;

  if (filter === "errors") {
    result = result.filter(
      (i) => i.status === "error" || i.status === "partial",
    );
  } else if (filter !== "all") {
    result = result.filter((i) => i.workflowId === filter);
  }

  const q = query.trim().toLowerCase();
  if (!q) return result;

  return result.filter((item) => {
    const title = displayTitle(item).toLowerCase();
    const workflow = item.workflowName.toLowerCase();
    const prompt = (item.prompt ?? item.promptPreview).toLowerCase();
    const finalPlan = (item.finalPlanPreview ?? "").toLowerCase();
    return (
      title.includes(q) ||
      workflow.includes(q) ||
      prompt.includes(q) ||
      finalPlan.includes(q)
    );
  });
}

export function isFinalPlanRun(item: RunHistorySummary): boolean {
  return Boolean(item.hasFinalPlan ?? item.finalPlanPreview);
}

export function isResearchBrief(item: RunHistorySummary): boolean {
  const researchWorkflows = ["market-research", "competitive-intelligence"];
  return (
    researchWorkflows.includes(item.workflowId) ||
    (item.sourceCount ?? 0) > 0 ||
    Boolean(item.hasResearchOutput)
  );
}

export function workflowIcon(workflowId: string): string {
  return WORKFLOW_ICONS[workflowId] ?? "◆";
}

export function tokenModeLabel(mode?: string): string {
  if (!mode) return "—";
  if (mode === "small" || mode === "standard" || mode === "deep") {
    return tokenModeDisplay(mode);
  }
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}
