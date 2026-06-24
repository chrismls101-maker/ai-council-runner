/**
 * Glass IDE stream — lightweight phase section dividers (Wireframe 2 rhythm).
 */

import type { CoderRunPhase } from "./glassIdeRunPhase.ts";
import { coderRunPhaseLabel } from "./glassIdeRunPhase.ts";
import type { CoderTranscriptCollapsedDisplayItem } from "./glassIdeTranscriptCollapse.ts";
import { INSPECT_TOOL_NAMES } from "./glassIdeTranscriptCollapse.ts";
import { isCoderWriteTool } from "./glassIdeCoderTranscript.ts";
import type { GlassState } from "./ipc.ts";
import { pathsMatchRelative } from "./glassIdeInlineDiff.ts";

export interface CoderTranscriptPhaseMarker {
  kind: "phase-marker";
  id: string;
  phase: CoderRunPhase;
  label: string;
}

export type CoderTranscriptStreamItem =
  | CoderTranscriptCollapsedDisplayItem
  | CoderTranscriptPhaseMarker;

function toolAwaitingApproval(
  item: Extract<CoderTranscriptCollapsedDisplayItem, { kind: "tool" }>,
  pending: GlassState["agentPendingApproval"],
  activeRunId: string | null,
): boolean {
  if (!pending || pending.agentId !== "coder" || !activeRunId || pending.runId !== activeRunId) {
    return false;
  }
  if (item.status !== "running") return false;
  if (item.toolUseId && item.toolUseId === pending.pendingToolId) return true;
  if (item.relativePath && pending.relativePath && pathsMatchRelative(item.relativePath, pending.relativePath)) {
    return true;
  }
  return false;
}

export function inferStreamPhaseForDisplayItem(
  item: CoderTranscriptCollapsedDisplayItem,
  ctx: {
    pendingApproval: GlassState["agentPendingApproval"];
    activeRunId: string | null;
  },
): CoderRunPhase | null {
  if (item.kind === "inspect-cluster") return "inspect";
  if (item.kind === "text" || item.kind === "text-collapsed" || item.kind === "status") {
    return null;
  }
  if (item.kind === "verify") {
    return item.status === "fail" || item.status === "warn" ? "recover" : "verify";
  }
  if (item.kind !== "tool") return null;

  if (item.toolName === "run_project_command") {
    if (item.status === "error" || (item.exitCode != null && item.exitCode !== 0)) {
      return "recover";
    }
    return "verify";
  }

  if (isCoderWriteTool(item.toolName)) {
    if (toolAwaitingApproval(item, ctx.pendingApproval, ctx.activeRunId)) return "apply";
    return "edit";
  }

  if (INSPECT_TOOL_NAMES.has(item.toolName)) return "inspect";

  return null;
}

export function injectTranscriptPhaseMarkers(
  items: CoderTranscriptCollapsedDisplayItem[],
  ctx: {
    pendingApproval: GlassState["agentPendingApproval"];
    activeRunId: string | null;
  },
): CoderTranscriptStreamItem[] {
  const out: CoderTranscriptStreamItem[] = [];
  let lastPhase: CoderRunPhase | null = null;

  for (const item of items) {
    const phase = inferStreamPhaseForDisplayItem(item, ctx);
    if (phase && phase !== lastPhase) {
      out.push({
        kind: "phase-marker",
        id: `phase-${phase}-${item.id}`,
        phase,
        label: coderRunPhaseLabel(phase),
      });
      lastPhase = phase;
    }
    out.push(item);
  }

  return out;
}
