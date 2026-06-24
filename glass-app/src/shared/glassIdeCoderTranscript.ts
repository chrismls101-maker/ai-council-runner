/**
 * Glass IDE Coder stream — Cursor-style live transcript (reasoning + tool calls).
 */

import type { AgentEvent, AgentPendingApprovalPayload, CoderCommandReceipt, GlassState } from "./ipc.ts";
import type { DiffLine, UnifiedDiff } from "./diff.ts";
import { collapseUnchanged, computeUnifiedDiff } from "./diff.ts";
import {
  verifyFailLabel,
  verifyPassLabel,
  verifyRunningLabel,
} from "./coderBuildLoopShared.ts";
import { qaStatusIcon, type QaCheck, type QaStructuredFailure } from "./glassQaPipeline.ts";
import {
  applyTranscriptCollapseRules,
  type CoderTranscriptCollapsedDisplayItem,
  type CoderTranscriptCollapsedTextItem,
  type CoderTranscriptInspectClusterItem,
} from "./glassIdeTranscriptCollapse.ts";

export type {
  CoderTranscriptCollapsedDisplayItem,
  CoderTranscriptCollapsedTextItem,
  CoderTranscriptInspectClusterItem,
} from "./glassIdeTranscriptCollapse.ts";

export type CoderTranscriptToolStatus = "running" | "done" | "skipped" | "error";

export const CODER_WRITE_TOOL_NAMES = new Set(["create_file", "edit_file", "delete_file"]);

export interface CoderTranscriptTextItem {
  kind: "text";
  id: string;
  text: string;
}

export interface CoderTranscriptToolItem {
  kind: "tool";
  id: string;
  toolUseId: string | null;
  toolName: string;
  label: string;
  status: CoderTranscriptToolStatus;
  result?: string;
  relativePath?: string;
  languageLabel?: string;
  displayLines?: DiffLine[];
  diff?: UnifiedDiff;
  isDelete?: boolean;
  /** Command receipt — run_project_command */
  command?: string;
  commandCwd?: string;
  exitCode?: number;
  durationMs?: number;
  commandOutputHead?: string;
  commandOutputTail?: string;
  /** Display-only — compact pill / header-only (set by collapse rules). */
  displayCompact?: boolean;
}

export interface CoderTranscriptVerifyItem {
  kind: "verify";
  id: string;
  label: string;
  command?: string;
  status: "running" | "pass" | "fail" | "warn" | "skipped" | "deferred" | "blocked";
  output?: string;
  icon?: string;
  durationMs?: number;
  failures?: QaStructuredFailure[];
  deferredReason?: string;
  groupChildren?: string[];
  nestedChecks?: CoderTranscriptVerifyItem[];
}

export interface CoderTranscriptStatusItem {
  kind: "status";
  id: string;
  text: string;
}

export type CoderTranscriptItem =
  | CoderTranscriptTextItem
  | CoderTranscriptToolItem
  | CoderTranscriptStatusItem;

export type CoderTranscriptDisplayItem =
  | CoderTranscriptTextItem
  | CoderTranscriptToolItem
  | CoderTranscriptStatusItem
  | CoderTranscriptVerifyItem;

const COMMAND_OUTPUT_HEAD_LINES = 8;
const COMMAND_OUTPUT_TAIL_LINES = 12;

export function isCoderWriteTool(toolName: string): boolean {
  return CODER_WRITE_TOOL_NAMES.has(toolName);
}

export function languageLabelFromPath(filePath: string): string {
  const name = filePath.split("/").pop() ?? filePath;
  if (name.endsWith(".tsx")) return "TSX";
  if (name.endsWith(".ts")) return "TypeScript";
  if (name.endsWith(".jsx")) return "JSX";
  if (name.endsWith(".js") || name.endsWith(".mjs")) return "JavaScript";
  if (name.endsWith(".json")) return "JSON";
  if (name.endsWith(".css")) return "CSS";
  if (name.endsWith(".html")) return "HTML";
  if (name.endsWith(".md")) return "Markdown";
  if (name.endsWith(".py")) return "Python";
  if (name.endsWith(".rs")) return "Rust";
  if (name.endsWith(".go")) return "Go";
  return name.includes(".") ? name.split(".").pop()?.toUpperCase() ?? "Code" : "Code";
}

function basename(filePath: string): string {
  const trimmed = filePath.trim().replace(/\/+$/, "");
  const parts = trimmed.split("/");
  return parts[parts.length - 1] || "file";
}

function toolInputRecord(toolInput: unknown): Record<string, unknown> {
  return toolInput && typeof toolInput === "object"
    ? (toolInput as Record<string, unknown>)
    : {};
}

function pathFromToolInput(toolName: string, toolInput: unknown): string | undefined {
  const input = toolInputRecord(toolInput);
  const p = String(input.path ?? "").trim();
  return p || undefined;
}

function commandFromToolInput(toolInput: unknown): string | undefined {
  const input = toolInputRecord(toolInput);
  const cmd = String(input.command ?? "").trim();
  return cmd || undefined;
}

function splitCommandOutput(output: string): { head: string; tail: string | undefined } {
  const lines = output.split("\n");
  if (lines.length <= COMMAND_OUTPUT_HEAD_LINES + 2) {
    return { head: output, tail: undefined };
  }
  const head = lines.slice(0, COMMAND_OUTPUT_HEAD_LINES).join("\n");
  const tail = lines.slice(-COMMAND_OUTPUT_TAIL_LINES).join("\n");
  return { head, tail };
}

export function parseCommandToolResult(
  toolResult: string | undefined,
  receipt?: CoderCommandReceipt,
): Pick<
  CoderTranscriptToolItem,
  "exitCode" | "command" | "commandCwd" | "durationMs" | "commandOutputHead" | "commandOutputTail"
> {
  if (receipt) {
    const { head, tail } = splitCommandOutput(receipt.output);
    return {
      command: receipt.command,
      commandCwd: receipt.cwd,
      exitCode: receipt.exitCode,
      durationMs: receipt.durationMs,
      commandOutputHead: head,
      commandOutputTail: tail,
    };
  }
  const text = toolResult?.trim() ?? "";
  const match = text.match(/^Exit (\d+)\n?([\s\S]*)$/);
  if (!match) {
    return {
      exitCode: text.toLowerCase().startsWith("error") ? 1 : 0,
      commandOutputHead: text || undefined,
    };
  }
  const output = (match[2] ?? "").trim();
  const { head, tail } = splitCommandOutput(output);
  return {
    exitCode: Number.parseInt(match[1], 10),
    commandOutputHead: head || "(no output)",
    commandOutputTail: tail,
  };
}

function applyCommandReceipt(
  tool: CoderTranscriptToolItem,
  toolInput: unknown,
  toolResult: string | undefined,
  receipt?: CoderCommandReceipt,
): CoderTranscriptToolItem {
  if (tool.toolName !== "run_project_command") return tool;
  const parsed = parseCommandToolResult(toolResult, receipt);
  return {
    ...tool,
    command: parsed.command ?? tool.command ?? commandFromToolInput(toolInput),
    commandCwd: parsed.commandCwd ?? tool.commandCwd,
    exitCode: parsed.exitCode ?? tool.exitCode,
    durationMs: parsed.durationMs ?? tool.durationMs,
    commandOutputHead: parsed.commandOutputHead ?? tool.commandOutputHead,
    commandOutputTail: parsed.commandOutputTail ?? tool.commandOutputTail,
  };
}

function previewFromToolInput(
  toolName: string,
  toolInput: unknown,
): Pick<CoderTranscriptToolItem, "displayLines" | "diff"> | undefined {
  const input = toolInputRecord(toolInput);
  if (toolName === "create_file") {
    const content = String(input.content ?? "");
    if (!content.trim()) return undefined;
    const diff = computeUnifiedDiff("", content);
    if (diff.unchanged) return undefined;
    return { diff, displayLines: collapseUnchanged(diff) };
  }
  return undefined;
}

function applyApprovalToTool(
  tool: CoderTranscriptToolItem,
  approval: AgentPendingApprovalPayload,
): CoderTranscriptToolItem {
  return {
    ...tool,
    relativePath: approval.relativePath,
    languageLabel: languageLabelFromPath(approval.relativePath),
    displayLines: approval.displayLines,
    diff: approval.diff,
    isDelete: approval.isDelete,
  };
}
export function formatCoderToolLabel(toolName: string, toolInput: unknown): string {
  const input = toolInputRecord(toolInput);

  switch (toolName) {
    case "read_file": {
      const p = String(input.path ?? "").trim();
      return p ? `Read ${basename(p)}` : "Read file";
    }
    case "list_directory": {
      const p = String(input.path ?? "").trim();
      return p ? `Listed ${basename(p)}` : "Listed directory";
    }
    case "search_files": {
      const pattern = String(input.pattern ?? "").trim();
      return pattern ? `Searched for ${pattern}` : "Searched files";
    }
    case "edit_file": {
      const p = String(input.path ?? "").trim();
      return p ? `Edit ${basename(p)}` : "Edit file";
    }
    case "create_file": {
      const p = String(input.path ?? "").trim();
      return p ? `Create ${basename(p)}` : "Create file";
    }
    case "delete_file": {
      const p = String(input.path ?? "").trim();
      return p ? `Delete ${basename(p)}` : "Delete file";
    }
    case "run_project_command": {
      const cmd = String(input.command ?? "").trim();
      return cmd ? `Run ${cmd}` : "Run command";
    }
    case "web_search": {
      const query = String(input.query ?? input.search_query ?? "").trim();
      return query ? `Search web: ${query}` : "Web search";
    }
    case "write_file":
      return "Write file";
    default:
      return toolName.replace(/_/g, " ");
  }
}

function toolStatusFromResult(result: string | undefined, changeAction?: string): CoderTranscriptToolStatus {
  if (!result) return "done";
  const lower = result.toLowerCase();
  if (lower.includes("user skipped") || lower.includes("skipped")) return "skipped";
  if (lower.startsWith("error") || changeAction === "failed") return "error";
  const exitMatch = result.match(/^Exit (\d+)/);
  if (exitMatch && Number.parseInt(exitMatch[1], 10) !== 0) return "error";
  return "done";
}

function appendText(items: CoderTranscriptItem[], chunk: string, nextId: () => string): CoderTranscriptItem[] {
  if (!chunk) return items;
  const last = items[items.length - 1];
  if (last?.kind === "text") {
    return [...items.slice(0, -1), { ...last, text: last.text + chunk }];
  }
  return [...items, { kind: "text", id: nextId(), text: chunk }];
}

function findRunningToolIndex(items: CoderTranscriptItem[], toolUseId: string | null, toolName?: string): number {
  if (toolUseId) {
    const byId = items.findIndex(
      (item) => item.kind === "tool" && item.toolUseId === toolUseId && item.status === "running",
    );
    if (byId >= 0) return byId;
  }
  if (toolName) {
    return items.findIndex(
      (item) => item.kind === "tool" && item.toolName === toolName && item.status === "running",
    );
  }
  return items.findIndex((item) => item.kind === "tool" && item.status === "running");
}

export function applyCoderTranscriptEvent(
  items: CoderTranscriptItem[],
  ev: Pick<
    AgentEvent,
    | "kind"
    | "text"
    | "error"
    | "toolName"
    | "toolInput"
    | "toolResult"
    | "pendingToolId"
    | "pendingToolName"
    | "pendingApproval"
    | "changeLogEntry"
    | "commandReceipt"
  >,
  nextId: () => string,
): CoderTranscriptItem[] {
  if (ev.kind === "text-delta" && ev.text) {
    return appendText(items, ev.text, nextId);
  }

  if (ev.kind === "narrate" && ev.text?.trim()) {
    return [
      ...items,
      { kind: "status", id: nextId(), text: ev.text.trim() },
    ];
  }

  if (ev.kind === "tool-start" && ev.toolName) {
    const approval = ev.pendingApproval;
    const rel = approval?.relativePath ?? pathFromToolInput(ev.toolName, ev.toolInput);
    const fallbackPreview = approval ? undefined : previewFromToolInput(ev.toolName, ev.toolInput);
    const command = ev.toolName === "run_project_command"
      ? commandFromToolInput(ev.toolInput)
      : undefined;
    const commandFields = ev.commandReceipt
      ? parseCommandToolResult(undefined, ev.commandReceipt)
      : {};
    return [
      ...items,
      {
        kind: "tool",
        id: nextId(),
        toolUseId: ev.pendingToolId ?? null,
        toolName: ev.toolName,
        label: formatCoderToolLabel(ev.toolName, ev.toolInput),
        status: "running",
        relativePath: rel,
        languageLabel: rel ? languageLabelFromPath(rel) : undefined,
        isDelete: approval?.isDelete,
        displayLines: approval?.displayLines ?? fallbackPreview?.displayLines,
        diff: approval?.diff ?? fallbackPreview?.diff,
        command: command ?? commandFields.command,
        commandCwd: commandFields.commandCwd,
      },
    ];
  }

  if (ev.kind === "approval-required" && ev.pendingApproval) {
    const idx = findRunningToolIndex(items, ev.pendingToolId ?? null, ev.pendingToolName);
    if (idx < 0) return items;
    const next = [...items];
    const tool = next[idx];
    if (tool.kind === "tool") {
      next[idx] = applyApprovalToTool(tool, ev.pendingApproval);
    }
    return next;
  }

  if (ev.kind === "tool-done" && ev.toolName) {
    const idx = findRunningToolIndex(items, ev.pendingToolId ?? null, ev.toolName);
    const status = toolStatusFromResult(ev.toolResult, ev.changeLogEntry?.action);
    const result = ev.toolResult?.trim();
    const withPreview = (tool: CoderTranscriptToolItem): CoderTranscriptToolItem => {
      let nextTool = tool;
      if (ev.pendingApproval) {
        nextTool = applyApprovalToTool(nextTool, ev.pendingApproval);
      }
      nextTool = applyCommandReceipt(
        nextTool,
        ev.toolInput,
        result,
        ev.commandReceipt,
      );
      return {
        ...nextTool,
        status,
        result: result || nextTool.result,
      };
    };
    if (idx < 0) {
      const rel = pathFromToolInput(ev.toolName, ev.toolInput);
      return [
        ...items,
        withPreview(applyCommandReceipt({
          kind: "tool",
          id: nextId(),
          toolUseId: ev.pendingToolId ?? null,
          toolName: ev.toolName,
          label: formatCoderToolLabel(ev.toolName, ev.toolInput),
          status,
          result: result || undefined,
          relativePath: rel,
          languageLabel: rel ? languageLabelFromPath(rel) : undefined,
          command: ev.toolName === "run_project_command"
            ? commandFromToolInput(ev.toolInput)
            : undefined,
          ...(ev.pendingApproval ? {
            relativePath: ev.pendingApproval.relativePath,
            languageLabel: languageLabelFromPath(ev.pendingApproval.relativePath),
            displayLines: ev.pendingApproval.displayLines,
            diff: ev.pendingApproval.diff,
            isDelete: ev.pendingApproval.isDelete,
          } : {}),
        }, ev.toolInput, result, ev.commandReceipt)),
      ];
    }
    const next = [...items];
    const tool = next[idx];
    if (tool.kind === "tool") {
      next[idx] = withPreview(tool);
    }
    return next;
  }

  if (ev.kind === "error" && ev.error) {
    return appendText(items, `\n\n**Error:** ${ev.error}`, nextId);
  }

  return items;
}

export function coderTranscriptHasContent(items: CoderTranscriptItem[]): boolean {
  return items.some(
    (item) => (item.kind === "text" && item.text.trim().length > 0)
      || item.kind === "tool"
      || item.kind === "status",
  );
}

function qaCheckToVerifyItem(check: QaCheck): CoderTranscriptVerifyItem {
  return {
    kind: "verify",
    id: `qa-${check.id}`,
    label: check.label,
    command: check.command,
    status: check.status === "running"
      ? "running"
      : check.status === "pass"
        ? "pass"
        : check.status === "fail"
          ? "fail"
          : check.status === "warn"
            ? "warn"
            : check.status === "deferred"
              ? "deferred"
              : check.status === "blocked"
                ? "blocked"
                : "skipped",
    output: check.detail ?? check.deferredReason,
    icon: qaStatusIcon(check.status),
    durationMs: check.durationMs,
    failures: check.failures,
    deferredReason: check.deferredReason,
    groupChildren: check.groupChildren,
  };
}

export function buildVerifyTranscriptItems(
  state: Pick<GlassState, "agentRun" | "coderVerifyState" | "qaPipelineState" | "glassSettings">,
  runId: string | null,
): CoderTranscriptVerifyItem[] {
  const activeRunId =
    state.agentRun?.agentId === "coder" ? state.agentRun.runId : runId;
  const items: CoderTranscriptVerifyItem[] = [];

  const verify = state.coderVerifyState;
  const showVerify = !state.glassSettings.qaModeEnabled
    && verify?.runId === activeRunId
    && verify.status !== "idle";

  if (showVerify && verify) {
    const status = verify.status === "running"
      ? "running"
      : verify.status === "pass"
        ? "pass"
        : "fail";
    const label = verify.status === "running"
      ? verifyRunningLabel(verify.command)
      : verify.status === "pass"
        ? verifyPassLabel(verify.command)
        : verifyFailLabel(verify.command);
    items.push({
      kind: "verify",
      id: "verify-post-run",
      label,
      command: verify.command,
      status,
      output: verify.status === "fail" ? verify.output : undefined,
      icon: verify.status === "running" ? "⟳" : verify.status === "pass" ? "✓" : "✗",
    });
  }

  const qa = state.qaPipelineState;
  if (qa?.runId === activeRunId) {
    if (qa.status === "waiting") {
      for (const check of qa.checks) {
        if (check.status === "pending") continue;
        items.push(qaCheckToVerifyItem(check));
      }
      return items;
    }

    const localGroup = qa.checks.find((c) => c.id === "local-checks");
    const localChildren = (["types", "tests", "lint"] as const)
      .map((id) => qa.checks.find((c) => c.id === id))
      .filter((c): c is QaCheck => Boolean(c && c.status !== "pending"));

    if (localGroup && localChildren.length > 0) {
      const parent = qaCheckToVerifyItem(localGroup);
      parent.nestedChecks = localChildren.map(qaCheckToVerifyItem);
      items.push(parent);
    }

    for (const check of qa.checks) {
      if (
        check.id === "local-checks"
        || check.id === "types"
        || check.id === "tests"
        || check.id === "lint"
      ) continue;
      if (check.status === "pending") continue;
      items.push(qaCheckToVerifyItem(check));
    }
  }

  return items;
}

export function mergeCoderTranscriptDisplayItems(
  transcript: CoderTranscriptItem[],
  state: Pick<GlassState, "agentRun" | "coderVerifyState" | "qaPipelineState" | "glassSettings">,
  runId: string | null,
): CoderTranscriptCollapsedDisplayItem[] {
  const verifyItems = buildVerifyTranscriptItems(state, runId);
  const agentRunning =
    state.agentRun?.agentId === "coder" && state.agentRun.status === "running";
  const merged: CoderTranscriptDisplayItem[] = [...transcript, ...verifyItems];
  return applyTranscriptCollapseRules(merged, { agentRunning });
}
