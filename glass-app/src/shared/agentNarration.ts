/**
 * Agent narration strings — short spoken cues for Aletheia (& card status lines).
 * Design target: under 8 words, fired when a tool call starts.
 */

import type { AgentEvent, GlassAgentId } from "./ipc.ts";
import { agentCatalogName } from "./agentCatalog.ts";
import {
  verifyFailNarration,
  verifyPassNarration,
  verifyStartNarration,
} from "./coderBuildLoopShared.ts";

const MAX_NARRATION_WORDS = 8;

export function truncateNarration(text: string, maxWords = MAX_NARRATION_WORDS): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}…`;
}

function basename(path: string): string {
  const trimmed = path.trim().replace(/\/+$/, "");
  const parts = trimmed.split("/");
  return parts[parts.length - 1] || "file";
}

function toolInputRecord(toolInput: unknown): Record<string, unknown> {
  return toolInput && typeof toolInput === "object"
    ? (toolInput as Record<string, unknown>)
    : {};
}

/** Short narration when a tool call fires (not after it completes). */
export function narrateToolStart(toolName: string, toolInput: unknown): string {
  const input = toolInputRecord(toolInput);

  switch (toolName) {
    case "web_search": {
      const query = String(input.query ?? input.search_query ?? input.q ?? "").trim();
      if (query) return truncateNarration(`Searching ${query}`);
      return "Searching the web…";
    }
    case "read_file": {
      const path = String(input.path ?? "").trim();
      if (path) return truncateNarration(`Reading ${basename(path)}`);
      return "Reading a file…";
    }
    case "list_directory":
      return "Looking through files…";
    case "search_files": {
      const pattern = String(input.pattern ?? "").trim();
      if (pattern) return truncateNarration(`Searching for ${pattern}`);
      return "Searching your files…";
    }
    case "write_file":
      return "Writing your file…";
    case "edit_file": {
      const path = String(input.path ?? "").trim();
      if (path) return truncateNarration(`Proposing ${basename(path)}`);
      return "Proposing an edit…";
    }
    case "create_file": {
      const path = String(input.path ?? "").trim();
      if (path) return truncateNarration(`Proposing ${basename(path)}`);
      return "Proposing a new file…";
    }
    case "delete_file": {
      const path = String(input.path ?? "").trim();
      if (path) return truncateNarration(`Proposing delete ${basename(path)}`);
      return "Proposing file deletion…";
    }
    case "terminal-coder-trigger":
      return "Opening Glass Coder to fix the build error.";
    case "coder-verify-start": {
      const command = String(input.command ?? "").trim();
      return verifyStartNarration(command);
    }
    case "coder-verify-pass": {
      const command = String(input.command ?? "").trim();
      return verifyPassNarration(command);
    }
    case "coder-verify-fail": {
      const command = String(input.command ?? "").trim();
      return verifyFailNarration(command);
    }
    case "coder-review-start":
      return "Reviewing the changes…";
    case "coder-review-clean":
      return "Looks good.";
    case "coder-review-issues":
      return "Found a few things to fix.";
    case "coder-loop-cap":
      return "Review manually — I've iterated four times.";
    case "run_project_command": {
      const command = String(input.command ?? "").trim();
      if (command) return truncateNarration(`Running ${command}`);
      return "Running project command…";
    }
    case "qa-mode-enter":
      return "QA Mode on. Running the full pipeline.";
    case "qa-types-pass":
      return "Types clean.";
    case "qa-types-fail":
      return "Type errors found.";
    case "qa-tests-pass":
      return "Tests passing.";
    case "qa-tests-fail":
      return "Tests failing.";
    case "qa-lint-pass":
      return "Lint clean.";
    case "qa-lint-warn":
      return "Lint warnings found.";
    case "qa-lint-fail":
      return "Lint errors found.";
    case "qa-preview-pass":
      return "Preview loaded clean.";
    case "qa-review-1":
      return "Reviewing for correctness.";
    case "qa-review-2":
      return "Checking production readiness.";
    case "qa-all-pass":
      return "Everything passed. Ship it.";
    case "qa-issues-found":
      return "Pipeline found issues — review the QA board.";
    case "qa-fix-trigger":
      return "Fixing pipeline failures.";
    default:
      return truncateNarration(`Running ${toolName.replace(/_/g, " ")}`);
  }
}

export function narrateAgentStarting(agentId: GlassAgentId): string {
  return truncateNarration(`${agentCatalogName(agentId)} starting`);
}

export function narrateAgentDone(): string {
  return "Done. Check the answer panel.";
}

/** Status line on the agent card (may be slightly longer than spoken narration). */
export function agentCardStatusForEvent(ev: AgentEvent): string {
  if (ev.kind === "tool-start") {
    return narrateToolStart(ev.toolName ?? "", ev.toolInput);
  }
  if (ev.kind === "tool-done") {
    if (ev.toolName === "write_file") {
      const result = typeof ev.toolResult === "string" ? ev.toolResult.trim() : "";
      return result || "File saved.";
    }
    if (ev.toolName === "edit_file" || ev.toolName === "create_file" || ev.toolName === "delete_file") {
      const result = typeof ev.toolResult === "string" ? ev.toolResult.trim() : "";
      return result || "Change recorded.";
    }
    return "Step complete.";
  }
  if (ev.kind === "approval-required") return "Waiting for your approval…";
  if (ev.kind === "done") {
    if (ev.agentId === "coder") return "Edits complete — review the Coder panel.";
    if (ev.agentId === "research") return "Research complete — reopen Research to view.";
    if (ev.agentId === "code") return "Analysis complete — reopen Code Analyst to view.";
    if (ev.agentId === "writing") return "Draft complete — reopen Writing Studio to read.";
    return "Complete — check the Response Panel.";
  }
  if (ev.kind === "cancelled") return "Stopped.";
  if (ev.kind === "error") return ev.error ?? "Something went wrong.";
  if (ev.kind === "narrate" && ev.text) return ev.text;
  return "";
}
