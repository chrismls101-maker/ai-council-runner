import type { AttachedContextItem } from "../types/contextBridge";
import type { BuilderContextItem } from "../types/builderWorkspace";
import type { CouncilExecutionTrace } from "../types";

export function buildBuilderContextItems(
  attached: AttachedContextItem[],
  trace: CouncilExecutionTrace | null,
  includedMemories?: Array<{ title?: string; id?: string }>,
): BuilderContextItem[] {
  const items: BuilderContextItem[] = [];

  for (const ctx of attached) {
    items.push({
      id: ctx.id,
      label: ctx.title,
      kind:
        ctx.type === "screenshot"
          ? "screenshot"
          : ctx.type === "evidence"
            ? "evidence"
            : ctx.tags?.includes("lens")
              ? "lens"
              : "attachment",
      relevance: ctx.contentSummary?.slice(0, 120) ?? ctx.contentText.slice(0, 80),
    });
  }

  const ext = trace?.externalContext;
  if (ext && ext.itemCount > 0) {
    for (const item of ext.items ?? []) {
      if (!items.some((i) => i.id === item.id)) {
        items.push({
          id: item.id,
          label: item.title,
          kind:
            item.type === "screenshot"
              ? "screenshot"
              : item.title?.toLowerCase().includes("lens")
                ? "lens"
                : "attachment",
          relevance: item.relevance,
        });
      }
    }
  }

  if (trace?.visionAnalysis?.screenshotAnalyzedVisually) {
    items.push({
      id: "vision",
      label: trace.visionAnalysis.screenshotTitle ?? "Screenshot analysis",
      kind: "screenshot",
      relevance: trace.visionAnalysis.sourceUrl?.slice(0, 120) ?? "Visual context used",
    });
  }

  for (const mem of includedMemories ?? []) {
    if (mem.title) {
      items.push({
        id: mem.id ?? mem.title,
        label: mem.title,
        kind: "memory",
        relevance: "Included in response",
      });
    }
  }

  return items;
}
