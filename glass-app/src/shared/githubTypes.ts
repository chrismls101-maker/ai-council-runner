/**
 * IIVO Glass — GitHub integration types and pure helpers.
 *
 * This module is pure — no Electron, no fs, no network.
 * Storage (safeStorage) and network (fetch) live in githubService.ts / githubClient.ts.
 *
 * Authentication model:
 *   Personal Access Token (PAT), stored encrypted via Electron safeStorage
 *   (macOS Keychain-backed AES encryption). The token is never logged, never
 *   sent anywhere except api.github.com with the standard Authorization header.
 *
 *   Recommended scope: fine-grained PAT with read access to:
 *     - Contents (to read branch names)
 *     - Pull requests (to list and read PRs)
 *     - Commit statuses + Checks (to read CI results)
 */

// ─── Config ───────────────────────────────────────────────────────────────────

/** GitHub connection config passed to API client functions. Never stored in GlassState. */
export interface GitHubConfig {
  /** PAT — decrypted in memory only for the duration of the API call. */
  token: string;
  /** api.github.com — overridable for GitHub Enterprise. */
  apiBase: string;
}

export const GITHUB_API_BASE = "https://api.github.com";

// ─── Repo info ────────────────────────────────────────────────────────────────

/**
 * GitHub owner + repo parsed from a git remote URL.
 * Covers both HTTPS and SSH remote formats.
 */
export interface GitHubRepoInfo {
  owner: string;
  repo: string;
  /** The original remote URL, normalised (no trailing .git). */
  remoteUrl: string;
}

// ─── PR summary ───────────────────────────────────────────────────────────────

export type PRState = "open" | "closed" | "merged";

export type ReviewDecision =
  | "approved"
  | "changes_requested"
  | "review_required"
  | "dismissed"
  | "unknown";

/**
 * Minimal PR summary surfaced in the Wingman report.
 * We deliberately capture the minimum needed for session context.
 */
export interface GitHubPRSummary {
  number: number;
  title: string;
  /** First 300 chars of the PR body — enough for context, not the full thing. */
  bodySnippet: string;
  state: PRState;
  reviewDecision: ReviewDecision;
  url: string;
  headBranch: string;
  baseBranch: string;
  isDraft: boolean;
  /** ISO timestamp of the last update. */
  updatedAt: string;
  author: string;
}

// ─── CI / check rollup ────────────────────────────────────────────────────────

export type CheckRollupStatus = "passing" | "failing" | "pending" | "none";

/** Aggregated CI status for a commit / PR head. */
export interface GitHubCheckRollup {
  status: CheckRollupStatus;
  /** Total number of check runs. */
  total: number;
  /** Number of failed check runs. */
  failingCount: number;
  /** Names of failing checks (up to 3). */
  failingNames: string[];
}

// ─── Full PR context (what gets attached to WingmanReport) ────────────────────

export interface GitHubPRContext {
  repoInfo: GitHubRepoInfo;
  pr: GitHubPRSummary;
  checks: GitHubCheckRollup;
  /** When this was fetched (ms since epoch). */
  fetchedAt: number;
}

// ─── PAT state surfaced to renderer ──────────────────────────────────────────

export interface GitHubPATState {
  /** Whether a PAT is saved and decryptable. */
  configured: boolean;
  /** Set if the last API call returned 401 — token is invalid or revoked. */
  tokenInvalid: boolean;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Parse a git remote URL into owner + repo.
 *
 * Handles:
 *   HTTPS: https://github.com/owner/repo.git
 *          https://github.com/owner/repo
 *   SSH:   git@github.com:owner/repo.git
 *          git@github.com:owner/repo
 *   GitHub Enterprise HTTPS/SSH on github.example.com
 *
 * Returns null for non-GitHub remotes (GitLab, Bitbucket, self-hosted other).
 */
export function parseGitHubRemote(remoteUrl: string): GitHubRepoInfo | null {
  if (!remoteUrl) return null;

  const url = remoteUrl.trim();

  // HTTPS: https://github.com/owner/repo[.git]
  const httpsMatch = url.match(
    /^https?:\/\/(?:[^@]+@)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
  );
  if (httpsMatch) {
    return {
      owner: httpsMatch[1],
      repo: httpsMatch[2],
      remoteUrl: url.replace(/\.git$/, "").replace(/\/$/, ""),
    };
  }

  // SSH: git@github.com:owner/repo[.git]
  const sshMatch = url.match(
    /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i,
  );
  if (sshMatch) {
    return {
      owner: sshMatch[1],
      repo: sshMatch[2],
      remoteUrl: `https://github.com/${sshMatch[1]}/${sshMatch[2]}`,
    };
  }

  // GitHub Enterprise HTTPS: https://github.example.com/owner/repo[.git]
  const gheHttpsMatch = url.match(
    /^https?:\/\/(?:[^@]+@)?([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
  );
  if (gheHttpsMatch) {
    // Only accept if the hostname looks like a GitHub Enterprise host
    // (not a non-GitHub service like gitlab.com or bitbucket.org)
    const hostname = gheHttpsMatch[1].toLowerCase();
    if (
      hostname !== "gitlab.com" &&
      hostname !== "bitbucket.org" &&
      hostname !== "dev.azure.com" &&
      !hostname.includes("gitlab") &&
      !hostname.includes("bitbucket")
    ) {
      return {
        owner: gheHttpsMatch[2],
        repo: gheHttpsMatch[3],
        remoteUrl: url.replace(/\.git$/, "").replace(/\/$/, ""),
      };
    }
  }

  return null;
}

// ─── Display helpers ──────────────────────────────────────────────────────────

/** Human-readable review decision label. */
export function reviewDecisionLabel(decision: ReviewDecision): string {
  switch (decision) {
    case "approved":          return "Approved";
    case "changes_requested": return "Changes requested";
    case "review_required":   return "Review required";
    case "dismissed":         return "Dismissed";
    case "unknown":           return "No review";
  }
}

/** CSS token for a review decision (maps to wm-hb-pr-review--{token} classes). */
export function reviewDecisionToken(decision: ReviewDecision): string {
  switch (decision) {
    case "approved":          return "ok";
    case "changes_requested": return "bad";
    case "review_required":   return "warn";
    case "dismissed":         return "warn";
    case "unknown":           return "off";
  }
}

/** Human-readable check rollup label. */
export function checkRollupLabel(rollup: GitHubCheckRollup): string {
  switch (rollup.status) {
    case "passing": return `CI passing (${rollup.total} checks)`;
    case "failing": return `CI failing — ${rollup.failingCount} of ${rollup.total} checks failed`;
    case "pending": return `CI pending (${rollup.total} checks)`;
    case "none":    return "No CI checks";
  }
}

/** CSS token for a check rollup status. */
export function checkRollupToken(status: CheckRollupStatus): string {
  switch (status) {
    case "passing": return "ok";
    case "failing": return "bad";
    case "pending": return "warn";
    case "none":    return "off";
  }
}

/**
 * Map a GitHub GraphQL reviewDecision string to our ReviewDecision type.
 * GraphQL returns: APPROVED, CHANGES_REQUESTED, REVIEW_REQUIRED, DISMISSED, or null.
 */
export function parseReviewDecision(raw: string | null | undefined): ReviewDecision {
  switch (raw?.toUpperCase()) {
    case "APPROVED":          return "approved";
    case "CHANGES_REQUESTED": return "changes_requested";
    case "REVIEW_REQUIRED":   return "review_required";
    case "DISMISSED":         return "dismissed";
    default:                  return "unknown";
  }
}

/**
 * Derive a CheckRollupStatus from raw GitHub Checks API data.
 * conclusions: "success" | "failure" | "neutral" | "cancelled" | "skipped" | "timed_out" | "action_required" | null
 */
export function deriveCheckRollupStatus(
  checkRuns: Array<{ name: string; conclusion: string | null; status: string }>,
): GitHubCheckRollup {
  if (checkRuns.length === 0) {
    return { status: "none", total: 0, failingCount: 0, failingNames: [] };
  }

  const failing = checkRuns.filter(
    (c) =>
      c.conclusion === "failure" ||
      c.conclusion === "timed_out" ||
      c.conclusion === "action_required" ||
      c.conclusion === "cancelled",
  );

  const pending = checkRuns.filter(
    (c) => c.status === "in_progress" || c.status === "queued" || c.conclusion === null,
  );

  let status: CheckRollupStatus;
  if (failing.length > 0) {
    status = "failing";
  } else if (pending.length > 0) {
    status = "pending";
  } else {
    status = "passing";
  }

  return {
    status,
    total: checkRuns.length,
    failingCount: failing.length,
    failingNames: failing.slice(0, 3).map((c) => c.name),
  };
}

/**
 * Truncate a PR body to at most maxLen characters for display in reports.
 */
export function truncatePRBody(body: string | null | undefined, maxLen = 300): string {
  if (!body) return "";
  const cleaned = body.replace(/\r\n/g, "\n").trim();
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen - 1) + "…" : cleaned;
}
