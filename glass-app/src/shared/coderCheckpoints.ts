/**
 * Glass Coder loop checkpoints — snapshot applied files before each fix iteration.
 */

import type { AgentChangeLogEntry } from "./ipc.ts";

export interface CoderCheckpoint {
  runId: string;
  iteration: number;
  at: number;
  /** Applied files with optional backup paths for rollback. */
  files: Array<{ path: string; relativePath: string; backupPath?: string }>;
}

export function buildCoderCheckpoint(
  runId: string,
  iteration: number,
  changeLog: AgentChangeLogEntry[],
  now = Date.now(),
): CoderCheckpoint {
  const files = changeLog
    .filter((e) => e.runId === runId && e.action === "applied")
    .map((e) => ({
      path: e.path,
      relativePath: e.relativePath,
      backupPath: e.backupPath,
    }));
  return { runId, iteration, at: now, files };
}

export function latestCheckpointForRun(
  checkpoints: CoderCheckpoint[] | null | undefined,
  runId: string,
): CoderCheckpoint | null {
  if (!checkpoints?.length) return null;
  const matches = checkpoints.filter((c) => c.runId === runId);
  if (!matches.length) return null;
  return matches.reduce((a, b) => (a.iteration >= b.iteration ? a : b));
}

/** True when a rollback checkpoint exists with applied files for this run/session. */
export function canRollbackRun(
  checkpoints: CoderCheckpoint[] | null | undefined,
  runId: string | null | undefined,
): boolean {
  const id = runId?.trim();
  if (!id) return false;
  const cp = latestCheckpointForRun(checkpoints, id);
  return Boolean(cp?.files.length);
}
