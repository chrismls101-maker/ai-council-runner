import type { DecisionQuality } from "../types/decisionQuality";
import type { MemoryType, SaveMemoryDraft } from "../types/memory";

export interface SuggestedMemoryItem {
  id: string;
  draft: Partial<SaveMemoryDraft> & { type: MemoryType };
  label: string;
}

function slugId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function buildSuggestedMemories(input: {
  workflowId?: string;
  preset?: string;
  finalAnswer?: string;
  decisionQuality?: DecisionQuality | null;
  researchSources?: string[];
  researchMode?: string;
  projectName?: string;
}): SuggestedMemoryItem[] {
  const suggestions: SuggestedMemoryItem[] = [];
  const project =
    input.projectName ||
    (input.preset === "ai-front-desk-sales-test" ? "AI Front Desk" : "");

  if (
    input.workflowId === "sales-attack" &&
    input.preset === "ai-front-desk-sales-test"
  ) {
    suggestions.push({
      id: slugId("fact"),
      label: "Project Fact about AI Front Desk positioning",
      draft: {
        type: "project_fact",
        projectName: "AI Front Desk",
        title: "AI Front Desk positioning",
        content:
          "AI Front Desk sells missed-call recovery and lead capture, not staff replacement.",
        tags: "positioning, offer",
      },
    });
  }

  if (input.decisionQuality?.recommendedAction?.trim()) {
    suggestions.push({
      id: slugId("decision"),
      label: "Decision: recommended action",
      draft: {
        type: "decision",
        projectName: project || "Project",
        decision: input.decisionQuality.recommendedAction.trim(),
        reason:
          input.decisionQuality.whyThisScore ||
          input.decisionQuality.nextAction24h ||
          "From IIVO decision quality summary.",
        confidence: (input.decisionQuality.confidence?.toLowerCase() ??
          "medium") as SaveMemoryDraft["confidence"],
        decisionStatus: "active",
        content: input.decisionQuality.recommendedAction.trim(),
        title: input.decisionQuality.recommendedAction.trim().slice(0, 80),
      },
    });
  }

  if (input.researchMode === "entity_search" && input.researchSources?.length) {
    const url = input.researchSources[0];
    suggestions.push({
      id: slugId("evidence"),
      label: "Evidence: verified source from entity search",
      draft: {
        type: "evidence",
        projectName: project || undefined,
        title: "Verified entity source",
        content: `Verified source from entity search: ${url}`,
        sourceUrl: url,
        sourceType: "entity_search",
      },
    });
  }

  const answer = input.finalAnswer?.trim() ?? "";
  if (
    !suggestions.length &&
    answer.length > 80 &&
    input.workflowId &&
    input.workflowId !== "direct_answer"
  ) {
    const excerpt = answer.slice(0, 280).replace(/\s+\S*$/, "");
    suggestions.push({
      id: slugId("fact"),
      label: "Project Fact from this run",
      draft: {
        type: "project_fact",
        projectName: project || "Project",
        title: "Context from recent run",
        content: excerpt,
        tags: input.workflowId,
      },
    });
  }

  return suggestions.slice(0, 3);
}
