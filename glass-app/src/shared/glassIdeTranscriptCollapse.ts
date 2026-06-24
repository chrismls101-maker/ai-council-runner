/**
 * Glass IDE transcript — progressive disclosure / collapse rules (pure).
 */

import type {
  CoderTranscriptDisplayItem,
  CoderTranscriptItem,
  CoderTranscriptToolItem,
} from "./glassIdeCoderTranscript.ts";
import { isCoderWriteTool } from "./glassIdeCoderTranscript.ts";

export const INSPECT_TOOL_NAMES = new Set([
  "read_file",
  "list_directory",
  "search_files",
  "web_search",
]);

/** Min successful inspect tools in a row before clustering. */
export const INSPECT_CLUSTER_MIN = 2;

/** Reasoning blocks longer than this collapse when superseded by evidence. */
export const REASONING_COLLAPSE_MIN_CHARS = 160;

export interface CoderTranscriptInspectClusterItem {
  kind: "inspect-cluster";
  id: string;
  count: number;
  labels: string[];
  tools: CoderTranscriptToolItem[];
}

export interface CoderTranscriptCollapsedTextItem {
  kind: "text-collapsed";
  id: string;
  text: string;
  preview: string;
}

export type CoderTranscriptCollapsedDisplayItem =
  | CoderTranscriptDisplayItem
  | CoderTranscriptInspectClusterItem
  | CoderTranscriptCollapsedTextItem;

export function isInspectToolName(toolName: string): boolean {
  return INSPECT_TOOL_NAMES.has(toolName);
}

export function reasoningPreview(text: string, maxLen = 148): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLen) return normalized;
  const slice = normalized.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  const trimmed = lastSpace > 60 ? slice.slice(0, lastSpace) : slice;
  return `${trimmed}…`;
}

function findActiveToolId(items: CoderTranscriptDisplayItem[]): string | null {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (item.kind === "tool" && item.status === "running") return item.id;
  }
  return null;
}

function findActiveTextId(
  items: CoderTranscriptDisplayItem[],
  agentRunning: boolean,
): string | null {
  if (!agentRunning) return null;
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (item.kind === "text" && item.text.trim()) return item.id;
  }
  return null;
}

function isClusterableInspectTool(
  tool: CoderTranscriptToolItem,
  activeToolId: string | null,
): boolean {
  return isInspectToolName(tool.toolName)
    && tool.status === "done"
    && tool.id !== activeToolId;
}

function shouldCompactTool(
  tool: CoderTranscriptToolItem,
  activeToolId: string | null,
): boolean {
  if (tool.id === activeToolId) return false;
  if (tool.status === "running" || tool.status === "error") return false;

  if (isInspectToolName(tool.toolName) && tool.status === "done") {
    return true;
  }

  if (isCoderWriteTool(tool.toolName) && tool.status === "done") {
    return true;
  }

  if (
    tool.toolName === "run_project_command"
    && tool.status === "done"
    && (tool.exitCode == null || tool.exitCode === 0)
  ) {
    return true;
  }

  return false;
}

function shouldCollapseReasoning(
  text: string,
  itemId: string,
  index: number,
  items: CoderTranscriptDisplayItem[],
  activeTextId: string | null,
  agentRunning: boolean,
): boolean {
  if (itemId === activeTextId) return false;
  if (text.trim().length < REASONING_COLLAPSE_MIN_CHARS) return false;

  const hasFollowingEvidence = items.slice(index + 1).some(
    (next) => next.kind === "tool" || next.kind === "verify" || next.kind === "status",
  );

  if (hasFollowingEvidence) return true;
  if (!agentRunning) return true;
  return false;
}

function flushInspectBuffer(
  buffer: CoderTranscriptToolItem[],
  out: CoderTranscriptCollapsedDisplayItem[],
): void {
  if (buffer.length === 0) return;

  if (buffer.length >= INSPECT_CLUSTER_MIN) {
    out.push({
      kind: "inspect-cluster",
      id: `inspect-cluster-${buffer[0].id}`,
      count: buffer.length,
      labels: buffer.map((tool) => tool.label),
      tools: [...buffer],
    });
  } else {
    for (const tool of buffer) {
      out.push({ ...tool, displayCompact: true });
    }
  }

  buffer.length = 0;
}

export function applyTranscriptCollapseRules(
  items: CoderTranscriptDisplayItem[],
  input: { agentRunning: boolean },
): CoderTranscriptCollapsedDisplayItem[] {
  const activeToolId = findActiveToolId(items);
  const activeTextId = findActiveTextId(items, input.agentRunning);
  const out: CoderTranscriptCollapsedDisplayItem[] = [];
  const inspectBuffer: CoderTranscriptToolItem[] = [];

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];

    if (item.kind === "tool" && isClusterableInspectTool(item, activeToolId)) {
      inspectBuffer.push(item);
      continue;
    }

    flushInspectBuffer(inspectBuffer, out);

    if (item.kind === "tool") {
      const displayCompact = shouldCompactTool(item, activeToolId);
      out.push(displayCompact ? { ...item, displayCompact: true } : item);
      continue;
    }

    if (item.kind === "text") {
      if (shouldCollapseReasoning(
        item.text,
        item.id,
        i,
        items,
        activeTextId,
        input.agentRunning,
      )) {
        out.push({
          kind: "text-collapsed",
          id: item.id,
          text: item.text,
          preview: reasoningPreview(item.text),
        });
      } else {
        out.push(item);
      }
      continue;
    }

    out.push(item);
  }

  flushInspectBuffer(inspectBuffer, out);
  return out;
}

/** Display items after verify merge + collapse (entry point for stream UI). */
export function buildCollapsedTranscriptDisplay(
  transcript: CoderTranscriptItem[],
  verifyItems: CoderTranscriptDisplayItem[],
  agentRunning: boolean,
): CoderTranscriptCollapsedDisplayItem[] {
  const merged: CoderTranscriptDisplayItem[] = [...transcript, ...verifyItems];
  return applyTranscriptCollapseRules(merged, { agentRunning });
}
