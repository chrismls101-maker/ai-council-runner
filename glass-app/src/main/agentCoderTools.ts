/**
 * Glass Coder — path sandbox and edit/create proposal helpers (unit-testable).
 */

import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { collapseUnchanged, computeUnifiedDiff } from "../shared/diff.ts";
import type { DiffLine, UnifiedDiff } from "../shared/diff.ts";
import type { AgentPendingApprovalPayload } from "../shared/ipc.ts";

export function expandAgentPath(filePath: string): string {
  const trimmed = filePath.trim();
  if (trimmed.startsWith("~/")) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return trimmed;
}

/** Resolve a project-relative or absolute path against the workspace root. */
export function resolveProjectPath(filePath: string, projectRoot: string): string {
  const trimmed = filePath.trim();
  if (!trimmed) return trimmed;
  const expanded = expandAgentPath(trimmed);
  if (path.isAbsolute(expanded)) return path.resolve(expanded);
  return path.resolve(path.resolve(expandAgentPath(projectRoot)), expanded);
}

/** Reject paths outside the configured project root (after resolve). */
export function assertPathInProjectRoot(filePath: string, projectRoot: string): string | null {
  const root = path.resolve(expandAgentPath(projectRoot));
  const resolved = resolveProjectPath(filePath, projectRoot);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    return `Path is outside the project root: ${filePath}`;
  }
  return null;
}

export function relativePathFromRoot(absPath: string, projectRoot: string): string {
  const root = path.resolve(expandAgentPath(projectRoot));
  const resolved = path.resolve(expandAgentPath(absPath));
  const rel = path.relative(root, resolved);
  return rel || path.basename(resolved);
}

export interface EditProposalResult {
  ok: true;
  proposedContent: string;
  approval: AgentPendingApprovalPayload;
}

export interface ProposalError {
  ok: false;
  error: string;
}

export type ProposalResult = EditProposalResult | ProposalError;

export function proposeEditContent(
  filePath: string,
  beforeContent: string,
  contentHash: string,
  fileExisted: boolean,
  projectRoot: string,
  oldString: string,
  newString: string,
  description: string,
): ProposalResult {
  if (!oldString) {
    return { ok: false, error: "old_string is required" };
  }

  const first = beforeContent.indexOf(oldString);
  if (first < 0) {
    return { ok: false, error: "old_string not found in file — read_file again and retry" };
  }
  const last = beforeContent.lastIndexOf(oldString);
  if (first !== last) {
    return { ok: false, error: "old_string is ambiguous (found multiple times) — use a more specific snippet" };
  }

  const proposedContent =
    beforeContent.slice(0, first) + newString + beforeContent.slice(first + oldString.length);

  if (proposedContent === beforeContent) {
    return { ok: false, error: "Edit would not change the file" };
  }

  const diff = computeUnifiedDiff(beforeContent, proposedContent);
  const displayLines = collapseUnchanged(diff);
  const resolved = path.resolve(expandAgentPath(filePath));

  return {
    ok: true,
    proposedContent,
    approval: {
      filePath: resolved,
      relativePath: relativePathFromRoot(resolved, projectRoot),
      description: description.trim() || "Edit file",
      displayLines,
      diff,
      contentHash,
      proposedContent,
      fileExisted,
    },
  };
}

export function proposeCreateContent(
  filePath: string,
  content: string,
  projectRoot: string,
  description: string,
  fileAlreadyExists: boolean,
): ProposalResult {
  if (fileAlreadyExists) {
    return { ok: false, error: "File already exists — use edit_file instead" };
  }

  const beforeContent = "";
  const diff = computeUnifiedDiff(beforeContent, content);
  const displayLines = collapseUnchanged(diff);
  const resolved = resolveProjectPath(filePath, projectRoot);

  return {
    ok: true,
    proposedContent: content,
    approval: {
      filePath: resolved,
      relativePath: relativePathFromRoot(resolved, projectRoot),
      description: description.trim() || "Create file",
      displayLines,
      diff,
      contentHash: "",
      proposedContent: content,
      fileExisted: false,
    },
  };
}

export function proposeDeleteContent(
  filePath: string,
  beforeContent: string,
  contentHash: string,
  projectRoot: string,
  description: string,
): ProposalResult {
  const resolved = resolveProjectPath(filePath, projectRoot);
  const diff = computeUnifiedDiff(beforeContent, "");
  const displayLines = collapseUnchanged(diff);

  return {
    ok: true,
    proposedContent: "",
    approval: {
      filePath: resolved,
      relativePath: relativePathFromRoot(resolved, projectRoot),
      description: description.trim() || "Delete file",
      displayLines,
      diff,
      contentHash,
      proposedContent: "",
      fileExisted: true,
      isDelete: true,
    },
  };
}
