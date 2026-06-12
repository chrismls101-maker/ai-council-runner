/**
 * IIVO Glass — True Claim Verification Engine (shared logic)
 *
 * After a Wingman session ends and the AI report is generated, Glass can
 * programmatically check certain claims instead of just marking them
 * "could not verify." This module handles the pure parts:
 *   - Claim types and result types
 *   - Extracting verifiable claims from a report + session
 *   - Resolving static claims (no I/O needed)
 *   - Formatting results for the prompt and UI
 *
 * I/O (running tsc, npm test) lives in src/main/verificationRunner.ts.
 *
 * Design principles:
 *   - Static claims are resolved here, in pure functions, with no I/O
 *   - Dynamic claims require a repoPath and are resolved by the runner
 *   - All results use concrete language ("tsc exited 0" not "tests passed")
 *   - Contradicted results are shown prominently — they override AI text
 *   - A 10-second timeout per dynamic check is enforced by the runner
 *   - Skipped claims are never surfaced as failures in the UI
 */

import type { WingmanReport, WingmanSession } from "./wingmanSession.ts";
import type { GitDiffSummary } from "./gitDiff.ts";
import type { AgentCallSummary } from "./agentProxy.ts";
import type { TerminalEvent } from "./terminalEvents.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The four possible outcomes of a verification check.
 *
 *   verified      — check ran and the claim holds
 *   contradicted  — check ran and the claim is false (shown prominently)
 *   inconclusive  — check ran but result is ambiguous (not enough signal)
 *   skipped       — check could not run (no repo, no command, timeout, error)
 */
export type VerificationStatus =
  | "verified"
  | "contradicted"
  | "inconclusive"
  | "skipped";

/**
 * The category of claim being verified.
 *
 *   typecheck         — TypeScript compiled without errors
 *   tests_pass        — test suite still passes
 *   terminal_resolved — terminal errors seen during session were later resolved
 *   agent_on_scope    — agent API calls aligned with the session goal
 *   files_match_goal  — files changed in git diff are relevant to the goal
 */
export type VerificationClaimType =
  | "typecheck"
  | "tests_pass"
  | "terminal_resolved"
  | "agent_on_scope"
  | "files_match_goal";

/**
 * A single claim extracted from the session, ready to be verified.
 * Static claims can be resolved without I/O (status is pre-set by extractor).
 * Dynamic claims need the runner to execute a command.
 */
export interface VerificationClaim {
  id: string;
  type: VerificationClaimType;
  /** Human-readable description of the claim being checked. */
  text: string;
  /**
   * Absolute path to the repo root.
   * Required for dynamic claims (typecheck, tests_pass).
   * undefined for static claims.
   */
  repoPath?: string;
  /**
   * Pre-resolved status for static claims.
   * Undefined for dynamic claims — the runner sets the result.
   */
  staticStatus?: VerificationStatus;
  /** Evidence text for static claims (set alongside staticStatus). */
  staticEvidence?: string;
}

/** The result of running (or skipping) a single verification claim. */
export interface VerificationResult {
  id: string;
  claimId: string;
  claimType: VerificationClaimType;
  /** Human-readable claim text (copied from the claim). */
  claim: string;
  status: VerificationStatus;
  /**
   * What we found. For dynamic checks: command output snippet.
   * For static checks: concise explanation of the signal used.
   */
  evidence: string;
  ranAt: number;
  /** How long the check took in ms. 0 for static checks. */
  durationMs: number;
}

/** The full verification report attached to a WingmanReport. */
export interface VerificationReport {
  results: VerificationResult[];
  ranAt: number;
  /** Total wall time for all checks (ms). */
  durationMs: number;
  /** How many checks were verified. */
  verifiedCount: number;
  /** How many checks were contradicted. */
  contradictedCount: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum characters of command output to keep as evidence. */
export const EVIDENCE_SNIPPET_LEN = 300;

// ─── ID generation ────────────────────────────────────────────────────────────

let _claimSeq = 0;
export function makeClaimId(): string {
  return `vclaim-${Date.now()}-${++_claimSeq}`;
}

let _resultSeq = 0;
export function makeResultId(): string {
  return `vresult-${Date.now()}-${++_resultSeq}`;
}

// ─── Claim extraction ─────────────────────────────────────────────────────────

/**
 * Extract a typecheck claim when:
 *   - session has a gitRepoPath, AND
 *   - the session touched TypeScript files OR terminal events included a TS error
 *
 * This is a dynamic claim — the runner will execute tsc.
 */
export function extractTypecheckClaim(
  session: Pick<WingmanSession, "gitRepoPath" | "terminalEvents">,
): VerificationClaim | null {
  if (!session.gitRepoPath) return null;

  const hasTsEvent = session.terminalEvents.some(
    (e) =>
      e.type === "build_error" ||
      e.type === "build_success" ||
      e.snippet.includes(".ts") ||
      e.snippet.includes("TS"),
  );

  if (!hasTsEvent) return null;

  return {
    id: makeClaimId(),
    type: "typecheck",
    text: "TypeScript compilation is clean (tsc --noEmit exits 0)",
    repoPath: session.gitRepoPath,
  };
}

/**
 * Extract a tests_pass claim when:
 *   - session has a gitRepoPath, AND
 *   - at least one test_pass terminal event was captured during the session
 *
 * Dynamic — runner will execute `npm test` (or detected command).
 */
export function extractTestsClaim(
  session: Pick<WingmanSession, "gitRepoPath" | "terminalEvents">,
): VerificationClaim | null {
  if (!session.gitRepoPath) return null;

  const hasTestPass = session.terminalEvents.some(
    (e) => e.type === "test_pass",
  );

  if (!hasTestPass) return null;

  return {
    id: makeClaimId(),
    type: "tests_pass",
    text: "Test suite still passes after session changes",
    repoPath: session.gitRepoPath,
  };
}

/**
 * Resolve a terminal_resolved claim statically:
 *   - If there were NO error events → inconclusive (nothing to resolve)
 *   - If errors exist AND the last event was a success → verified
 *   - If errors exist AND the last event was still an error → contradicted
 *   - If errors exist but no success followed → inconclusive
 */
export function resolveTerminalClaim(
  terminalEvents: TerminalEvent[],
): VerificationClaim | null {
  if (terminalEvents.length === 0) return null;

  const errors = terminalEvents.filter(
    (e) =>
      e.type === "build_error" ||
      e.type === "test_failure" ||
      e.type === "runtime_error",
  );

  if (errors.length === 0) return null; // no errors to verify

  const last = terminalEvents[terminalEvents.length - 1];
  const lastIsSuccess =
    last.type === "build_success" || last.type === "test_pass";
  const lastIsError =
    last.type === "build_error" ||
    last.type === "test_failure" ||
    last.type === "runtime_error";

  let staticStatus: VerificationStatus;
  let staticEvidence: string;

  if (lastIsSuccess) {
    staticStatus = "verified";
    staticEvidence = `${errors.length} error event${errors.length === 1 ? "" : "s"} captured; last terminal event was a success: "${last.label}"`;
  } else if (lastIsError) {
    staticStatus = "contradicted";
    staticEvidence = `Last terminal event was still an error: "${last.label.slice(0, 120)}"`;
  } else {
    staticStatus = "inconclusive";
    staticEvidence = `${errors.length} error event${errors.length === 1 ? "" : "s"} captured but no success event followed to confirm resolution.`;
  }

  return {
    id: makeClaimId(),
    type: "terminal_resolved",
    text: `Terminal errors from this session were resolved`,
    staticStatus,
    staticEvidence,
  };
}

/**
 * Resolve an agent_on_scope claim statically from the AgentScopeResult
 * already embedded in the report's agentCalls analysis.
 *
 * Reads the scopeHint attached to the session's agentCalls via analyzeAgentScope.
 */
export function resolveAgentScopeClaim(
  goal: string,
  agentCalls: AgentCallSummary[],
): VerificationClaim | null {
  if (agentCalls.length === 0) return null;

  // Re-derive scope analysis inline (pure, cheap)
  const goalTerms = goal
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);

  if (goalTerms.length === 0) return null;

  let matched = 0;
  for (const call of agentCalls) {
    const haystack =
      `${call.userMessageSnippet} ${call.responseSnippet} ${call.toolNames.join(" ")}`.toLowerCase();
    if (goalTerms.some((t) => haystack.includes(t))) matched++;
  }

  const total = agentCalls.length;
  const driftRatio = (total - matched) / total;

  let staticStatus: VerificationStatus;
  let staticEvidence: string;

  if (driftRatio === 0) {
    staticStatus = "verified";
    staticEvidence = `All ${total} intercepted agent call${total === 1 ? "" : "s"} contained terms related to the goal.`;
  } else if (driftRatio <= 0.25) {
    staticStatus = "inconclusive";
    staticEvidence = `${total - matched} of ${total} intercepted call${total === 1 ? "" : "s"} appeared unrelated to the goal (within acceptable range).`;
  } else {
    staticStatus = "contradicted";
    staticEvidence = `${total - matched} of ${total} intercepted agent calls appear unrelated to the goal — possible scope drift during the session.`;
  }

  return {
    id: makeClaimId(),
    type: "agent_on_scope",
    text: "Agent API calls were focused on the session goal",
    staticStatus,
    staticEvidence,
  };
}

/**
 * Resolve a files_match_goal claim statically by checking whether the
 * changed files' paths contain terms from the goal.
 *
 * Low-signal but zero-cost.
 */
export function resolveFilesMatchGoalClaim(
  goal: string,
  gitDiff: GitDiffSummary,
): VerificationClaim | null {
  if (gitDiff.filesChanged.length === 0) return null;

  // Use the existing scopeHint from gitDiff (already computed by analyzeScopeMatch)
  const { scopeHint, scopeNote } = gitDiff;

  let staticStatus: VerificationStatus;
  if (scopeHint === "on-track") {
    staticStatus = "verified";
  } else if (scopeHint === "significant-drift") {
    staticStatus = "contradicted";
  } else if (scopeHint === "possible-drift") {
    staticStatus = "inconclusive";
  } else {
    staticStatus = "inconclusive";
  }

  return {
    id: makeClaimId(),
    type: "files_match_goal",
    text: `Changed files (${gitDiff.filesChanged.length}) are relevant to the goal`,
    staticStatus,
    staticEvidence: scopeNote,
  };
}

/**
 * Master claim extractor — assembles all extractable claims from a session.
 *
 * Static claims are pre-resolved (status + evidence set).
 * Dynamic claims (typecheck, tests_pass) need the runner.
 */
export function extractClaims(
  session: WingmanSession,
  report: WingmanReport,
): VerificationClaim[] {
  const claims: VerificationClaim[] = [];

  // Static: terminal resolution
  const termClaim = resolveTerminalClaim(session.terminalEvents);
  if (termClaim) claims.push(termClaim);

  // Static: agent scope (if proxy was active)
  const agentCalls = report.agentCalls ?? session.agentCalls ?? [];
  if (agentCalls.length > 0) {
    const agentClaim = resolveAgentScopeClaim(session.goal, agentCalls);
    if (agentClaim) claims.push(agentClaim);
  }

  // Static: files match goal (if git diff present)
  if (report.gitDiff && report.gitDiff.filesChanged.length > 0) {
    const filesClaim = resolveFilesMatchGoalClaim(session.goal, report.gitDiff);
    if (filesClaim) claims.push(filesClaim);
  }

  // Dynamic: typecheck (needs runner)
  const tsClaim = extractTypecheckClaim(session);
  if (tsClaim) claims.push(tsClaim);

  // Dynamic: tests_pass (needs runner)
  const testClaim = extractTestsClaim(session);
  if (testClaim) claims.push(testClaim);

  return claims;
}

// ─── Result builders ──────────────────────────────────────────────────────────

/** Build a VerificationResult from a resolved claim. */
export function buildVerificationResult(
  claim: VerificationClaim,
  status: VerificationStatus,
  evidence: string,
  ranAt: number,
  durationMs: number,
): VerificationResult {
  return {
    id: makeResultId(),
    claimId: claim.id,
    claimType: claim.type,
    claim: claim.text,
    status,
    evidence: evidence.slice(0, EVIDENCE_SNIPPET_LEN),
    ranAt,
    durationMs,
  };
}

/** Resolve a static claim into a VerificationResult immediately. */
export function resolveStaticClaim(claim: VerificationClaim): VerificationResult {
  const now = Date.now();
  return buildVerificationResult(
    claim,
    claim.staticStatus ?? "skipped",
    claim.staticEvidence ?? "(static check — no command run)",
    now,
    0,
  );
}

/** Build a skipped result for a claim that couldn't run. */
export function buildSkippedResult(
  claim: VerificationClaim,
  reason: string,
): VerificationResult {
  return buildVerificationResult(claim, "skipped", reason, Date.now(), 0);
}

/** Assemble the final VerificationReport from a list of results. */
export function buildVerificationReport(
  results: VerificationResult[],
  ranAt: number,
  durationMs: number,
): VerificationReport {
  return {
    results,
    ranAt,
    durationMs,
    verifiedCount: results.filter((r) => r.status === "verified").length,
    contradictedCount: results.filter((r) => r.status === "contradicted").length,
  };
}

// ─── Prompt formatter ─────────────────────────────────────────────────────────

/** Format verification results for inclusion in a Wingman AI prompt. */
export function formatVerificationForPrompt(report: VerificationReport): string {
  if (report.results.length === 0) {
    return "VERIFICATION\nNo claims were verified during this session.";
  }

  const lines = [
    "VERIFICATION RESULTS (system-run checks — not AI assertions)",
    "",
  ];

  for (const r of report.results) {
    const badge =
      r.status === "verified"
        ? "✓ VERIFIED"
        : r.status === "contradicted"
          ? "✗ CONTRADICTED"
          : r.status === "inconclusive"
            ? "~ INCONCLUSIVE"
            : "— SKIPPED";
    lines.push(`${badge}: ${r.claim}`);
    if (r.status !== "skipped") {
      lines.push(`  Evidence: ${r.evidence}`);
    }
    lines.push("");
  }

  lines.push(
    `Summary: ${report.verifiedCount} verified, ${report.contradictedCount} contradicted, ` +
    `${report.results.filter((r) => r.status === "inconclusive").length} inconclusive, ` +
    `${report.results.filter((r) => r.status === "skipped").length} skipped`,
  );

  return lines.join("\n");
}

// ─── Display helpers ──────────────────────────────────────────────────────────

/** Human-readable label for a verification status. */
export function statusLabel(status: VerificationStatus): string {
  switch (status) {
    case "verified":      return "Verified";
    case "contradicted":  return "Contradicted";
    case "inconclusive":  return "Inconclusive";
    case "skipped":       return "Skipped";
  }
}

/**
 * CSS modifier token for a verification status.
 * Maps to wm-hb-verify-badge--{token} classes.
 */
export function statusToken(status: VerificationStatus): string {
  switch (status) {
    case "verified":      return "ok";
    case "contradicted":  return "bad";
    case "inconclusive":  return "warn";
    case "skipped":       return "off";
  }
}

/** Summary line: "3 verified · 1 contradicted" */
export function verificationSummaryLine(report: VerificationReport): string {
  const parts: string[] = [];
  const total = report.results.length;
  const skipped = report.results.filter((r) => r.status === "skipped").length;
  const shown = total - skipped;

  if (report.verifiedCount > 0)
    parts.push(`${report.verifiedCount} verified`);
  if (report.contradictedCount > 0)
    parts.push(`${report.contradictedCount} contradicted`);

  const inconclusive = report.results.filter((r) => r.status === "inconclusive").length;
  if (inconclusive > 0)
    parts.push(`${inconclusive} inconclusive`);

  if (parts.length === 0) return `${shown} check${shown === 1 ? "" : "s"} ran — no clear result`;
  return parts.join(" · ");
}
