/** Dedupe forced audio → Coder launches (bus auto-run + card click). */

export const FORCED_CODER_LAUNCH_DEDUPE_MS = 30_000;

type ForcedLaunchRecord = { at: number; hadWorkspace: boolean };

const recentForcedLaunches = new Map<string, ForcedLaunchRecord>();

/**
 * Skip duplicate forced launches within 30s when either attempt had a workspace.
 * Launches without workspace are recorded but do not block retry until workspace exists.
 */
export function shouldSkipDuplicateForcedCoderLaunch(
  prompt: string,
  forceAutoRun: boolean | undefined,
  hadWorkspaceNow = false,
  now = Date.now(),
): boolean {
  if (forceAutoRun !== true) return false;
  const key = prompt.trim();
  if (!key) return false;
  const last = recentForcedLaunches.get(key);
  if (!last) return false;
  if (now - last.at >= FORCED_CODER_LAUNCH_DEDUPE_MS) return false;
  return last.hadWorkspace || hadWorkspaceNow;
}

export function recordForcedCoderLaunch(
  prompt: string,
  forceAutoRun: boolean | undefined,
  hadWorkspace: boolean,
  now = Date.now(),
): void {
  if (forceAutoRun !== true) return;
  const key = prompt.trim();
  if (!key) return;
  recentForcedLaunches.set(key, { at: now, hadWorkspace });
  const cutoff = now - FORCED_CODER_LAUNCH_DEDUPE_MS;
  for (const [k, record] of recentForcedLaunches) {
    if (record.at < cutoff) recentForcedLaunches.delete(k);
  }
}

export function resetForcedCoderLaunchDedupeForTests(): void {
  recentForcedLaunches.clear();
}

export const FORCED_CODER_MISSING_WORKSPACE_TOAST =
  "Choose a project folder to auto-start Glass Coder.";
