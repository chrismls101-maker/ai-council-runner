/**
 * IIVO Glass — GitHub REST API client (shared, pure)
 *
 * Pure module — no Electron, no fs, no safeStorage.
 * All network calls use the standard `fetch` API.
 * The caller (githubService.ts) is responsible for loading the PAT and
 * wiring error state back into GlassState.
 *
 * API surface used:
 *   GET /repos/{owner}/{repo}/pulls?head={owner}:{branch}&state=open
 *   GET /repos/{owner}/{repo}/commits/{ref}/check-runs
 *
 * Rate limits:
 *   Authenticated: 5,000 req/hr — we make at most 2 calls per session end.
 *   We always send If-None-Match if we have a cached ETag (not implemented in
 *   V1 — noted as future improvement).
 *
 * Privacy:
 *   The PAT is only present in the Authorization header — it is never logged,
 *   never stored in GlassState, and is passed in as a parameter rather than
 *   read from a module-level variable.
 */

import {
  GITHUB_API_BASE,
  parseReviewDecision,
  deriveCheckRollupStatus,
  truncatePRBody,
  type GitHubConfig,
  type GitHubRepoInfo,
  type GitHubPRSummary,
  type GitHubCheckRollup,
  type GitHubPRContext,
  type PRState,
} from "./githubTypes.ts";

// ─── Errors ───────────────────────────────────────────────────────────────────

export class GitHubAuthError extends Error {
  constructor(message = "GitHub PAT is invalid or revoked (401)") {
    super(message);
    this.name = "GitHubAuthError";
  }
}

export class GitHubRateLimitError extends Error {
  constructor(message = "GitHub API rate limit exceeded (403)") {
    super(message);
    this.name = "GitHubRateLimitError";
  }
}

export class GitHubNotFoundError extends Error {
  constructor(message = "GitHub resource not found (404)") {
    super(message);
    this.name = "GitHubNotFoundError";
  }
}

// ─── Request helper ───────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Fetch a GitHub API endpoint with auth header and timeout.
 * Throws typed errors for 401 / 403 / 404.
 * Returns parsed JSON or throws for other non-2xx responses.
 */
async function ghFetch<T>(
  config: GitHubConfig,
  path: string,
): Promise<T> {
  const base = config.apiBase ?? GITHUB_API_BASE;
  const url = `${base}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401) throw new GitHubAuthError();
  if (response.status === 403) throw new GitHubRateLimitError();
  if (response.status === 404) throw new GitHubNotFoundError();

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText} for ${path}`);
  }

  return response.json() as Promise<T>;
}

// ─── PR fetching ──────────────────────────────────────────────────────────────

interface RawPR {
  number: number;
  title: string;
  body: string | null;
  state: string;
  draft: boolean;
  html_url: string;
  updated_at: string;
  head: { ref: string; label: string };
  base: { ref: string };
  user: { login: string };
}

/**
 * Fetch the open PR for a given branch in the repo.
 * Returns null if no open PR is found (404 or empty list).
 */
export async function fetchOpenPRForBranch(
  config: GitHubConfig,
  repoInfo: GitHubRepoInfo,
  branch: string,
): Promise<GitHubPRSummary | null> {
  const { owner, repo } = repoInfo;

  // Query: PRs where head branch = owner:branch
  const path = `/repos/${owner}/${repo}/pulls?head=${encodeURIComponent(owner)}%3A${encodeURIComponent(branch)}&state=open&per_page=1`;

  let prs: RawPR[];
  try {
    prs = await ghFetch<RawPR[]>(config, path);
  } catch (err) {
    if (err instanceof GitHubNotFoundError) return null;
    throw err;
  }

  if (!prs || prs.length === 0) return null;

  const pr = prs[0];
  return buildPRSummary(pr);
}

/**
 * Fetch a specific PR by number.
 * Useful when the branch-based lookup misses (e.g. fork PRs).
 */
export async function fetchPRByNumber(
  config: GitHubConfig,
  repoInfo: GitHubRepoInfo,
  prNumber: number,
): Promise<GitHubPRSummary | null> {
  const { owner, repo } = repoInfo;
  const path = `/repos/${owner}/${repo}/pulls/${prNumber}`;

  try {
    const pr = await ghFetch<RawPR>(config, path);
    return buildPRSummary(pr);
  } catch (err) {
    if (err instanceof GitHubNotFoundError) return null;
    throw err;
  }
}

function buildPRSummary(pr: RawPR): GitHubPRSummary {
  // reviewDecision is not available via REST v3 — it requires GraphQL.
  // We return "unknown" here; a future upgrade can add GraphQL support.
  return {
    number: pr.number,
    title: pr.title,
    bodySnippet: truncatePRBody(pr.body),
    state: (pr.state === "closed" ? "closed" : pr.draft ? "open" : pr.state) as PRState,
    reviewDecision: "unknown",
    url: pr.html_url,
    headBranch: pr.head.ref,
    baseBranch: pr.base.ref,
    isDraft: pr.draft,
    updatedAt: pr.updated_at,
    author: pr.user.login,
  };
}

// ─── Check runs ───────────────────────────────────────────────────────────────

interface RawCheckRun {
  name: string;
  status: string;
  conclusion: string | null;
}

interface RawCheckRunsResponse {
  total_count: number;
  check_runs: RawCheckRun[];
}

/**
 * Fetch CI check runs for a specific commit ref.
 * Returns a rolled-up status across all checks.
 */
export async function fetchCheckRollup(
  config: GitHubConfig,
  repoInfo: GitHubRepoInfo,
  ref: string,
): Promise<GitHubCheckRollup> {
  const { owner, repo } = repoInfo;
  const path = `/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}/check-runs?per_page=100`;

  try {
    const data = await ghFetch<RawCheckRunsResponse>(config, path);
    return deriveCheckRollupStatus(data.check_runs ?? []);
  } catch (err) {
    if (err instanceof GitHubNotFoundError) {
      return { status: "none", total: 0, failingCount: 0, failingNames: [] };
    }
    throw err;
  }
}

// ─── Combined context fetch ───────────────────────────────────────────────────

/**
 * Fetch the full PR context for a session:
 *   1. Find the open PR for the branch
 *   2. Fetch CI checks for the PR head commit (or the branch ref)
 *
 * Returns null if no open PR is found.
 * Throws GitHubAuthError / GitHubRateLimitError on auth/rate issues.
 */
export async function fetchPRContext(
  config: GitHubConfig,
  repoInfo: GitHubRepoInfo,
  branch: string,
): Promise<GitHubPRContext | null> {
  const pr = await fetchOpenPRForBranch(config, repoInfo, branch);
  if (!pr) return null;

  // Fetch checks for the head branch ref — gracefully degrade if it fails
  let checks: GitHubCheckRollup;
  try {
    checks = await fetchCheckRollup(config, repoInfo, pr.headBranch);
  } catch {
    checks = { status: "none", total: 0, failingCount: 0, failingNames: [] };
  }

  return {
    repoInfo,
    pr,
    checks,
    fetchedAt: Date.now(),
  };
}
