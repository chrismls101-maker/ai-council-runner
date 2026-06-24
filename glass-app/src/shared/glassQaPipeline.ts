/**
 * Glass QA Pipeline — shared types and pure helpers.
 */

import {
  formatStructuredFailure,
  parseEslintDiagnostics,
  parseTestFailures,
  parseTypeScriptDiagnostics,
} from "./glassQaStructuredParsers.ts";

export type QaCheckId =
  | "apply-guard"
  | "local-checks"
  | "types"
  | "tests"
  | "lint"
  | "preview"
  | "review-1"
  | "review-2";

export type QaCheckStatus =
  | "pending"
  | "running"
  | "pass"
  | "warn"
  | "fail"
  | "skipped"
  | "deferred"
  | "blocked";

export type QaSkipReason = "unavailable" | "not-applicable" | "disabled";

export type QaShipState =
  | "ready-to-ship"
  | "known-warnings"
  | "blocked"
  | "needs-human-judgment";

export interface QaStructuredFailure {
  source: "types" | "tests" | "lint" | "preview" | "review";
  severity: "error" | "warning";
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  testName?: string;
  rule?: string;
  message: string;
  expected?: string;
  actual?: string;
  rawExcerpt?: string;
}

export interface QaPreviewProbeResult {
  skipped?: boolean;
  errors?: string[];
  unhandledRejections?: string[];
  networkErrors?: string[];
  bootTimedOut?: boolean;
  blankScreen?: boolean;
}

export interface QaCheck {
  id: QaCheckId;
  label: string;
  status: QaCheckStatus;
  detail?: string;
  fixPrompt?: string;
  command?: string;
  durationMs?: number;
  failures?: QaStructuredFailure[];
  skipReason?: QaSkipReason;
  /** Child check ids when this row is a group parent. */
  groupChildren?: QaCheckId[];
  deferredReason?: string;
}

export type QaPipelineStatus = "waiting" | "running" | "done";

export interface QaPipelineState {
  runId: string;
  status: QaPipelineStatus;
  checks: QaCheck[];
  autoFix?: boolean;
  waitingReason?: "pending-approval" | "incomplete" | "superseded";
  pendingApprovalCount?: number;
}

export interface QaProgressCounters {
  total: number;
  complete: number;
  fail: number;
  warn: number;
  skip: number;
  deferred: number;
  summaryLine: string;
}

const LOCAL_CHILD_IDS: QaCheckId[] = ["types", "tests", "lint"];

export function initialQaChecks(): QaCheck[] {
  return [
    {
      id: "local-checks",
      label: "Local checks",
      status: "pending",
      groupChildren: LOCAL_CHILD_IDS,
    },
    { id: "types", label: "Typecheck", status: "pending" },
    { id: "tests", label: "Tests", status: "pending" },
    { id: "lint", label: "Lint", status: "pending" },
    { id: "preview", label: "Preview smoke", status: "pending" },
    { id: "review-1", label: "Review: Correctness", status: "pending" },
    { id: "review-2", label: "Review: Production readiness", status: "pending" },
  ];
}

export function applyGuardCheck(pendingCount: number): QaCheck {
  return {
    id: "apply-guard",
    label: "Waiting for applied state",
    status: "blocked",
    detail: pendingCount === 1
      ? "1 pending approval"
      : `${pendingCount} pending approvals`,
  };
}

export function deferredReviewCheck(id: "review-1" | "review-2", reason: string): QaCheck {
  return {
    id,
    label: id === "review-1" ? "Review: Correctness" : "Review: Production readiness",
    status: "deferred",
    deferredReason: reason,
    detail: reason,
  };
}

export function qaStatusIcon(status: QaCheckStatus): string {
  switch (status) {
    case "running":
      return "⟳";
    case "pass":
      return "✓";
    case "warn":
      return "⚠";
    case "fail":
      return "✗";
    case "skipped":
      return "–";
    case "deferred":
      return "◷";
    case "blocked":
      return "■";
    default:
      return "○";
  }
}

export function qaOverallStatusLabel(checks: QaCheck[]): string {
  if (checks.some((c) => c.status === "blocked")) return "Waiting…";
  if (checks.some((c) => c.status === "running")) return "Running…";
  if (checks.some((c) => c.status === "fail")) return "Issues found";
  if (checks.some((c) => c.status === "warn")) return "Warnings";
  if (checks.every((c) => (
    c.status === "pass" || c.status === "skipped" || c.status === "deferred"
  ))) return "All clear";
  return "QA Pipeline";
}

export function qaHasFailures(checks: QaCheck[]): boolean {
  return checks.some((c) => c.status === "fail");
}

export function qaHasHardLocalFailures(checks: QaCheck[]): boolean {
  return checks.some((c) => (
    (c.id === "types" || c.id === "tests" || c.id === "lint" || c.id === "preview")
    && c.status === "fail"
  ));
}

export function qaProgressCounters(checks: QaCheck[]): QaProgressCounters {
  const actionable = checks.filter((c) => c.id !== "local-checks" && c.id !== "apply-guard");
  const total = actionable.length;
  const complete = actionable.filter((c) => (
    c.status === "pass" || c.status === "fail" || c.status === "warn"
    || c.status === "skipped" || c.status === "deferred"
  )).length;
  const fail = actionable.filter((c) => c.status === "fail").length;
  const warn = actionable.filter((c) => c.status === "warn").length;
  const skip = actionable.filter((c) => c.status === "skipped").length;
  const deferred = actionable.filter((c) => c.status === "deferred").length;
  return {
    total,
    complete,
    fail,
    warn,
    skip,
    deferred,
    summaryLine: `QA ${complete}/${total} · ${fail} fail · ${warn} warn · ${skip} skip`,
  };
}

export function aggregateLocalChecksGroup(checks: QaCheck[]): QaCheck {
  const children = LOCAL_CHILD_IDS.map((id) => checks.find((c) => c.id === id)).filter(Boolean) as QaCheck[];
  const running = children.some((c) => c.status === "running");
  const failed = children.some((c) => c.status === "fail");
  const warned = children.some((c) => c.status === "warn");
  const skipped = children.every((c) => c.status === "skipped");
  const pending = children.some((c) => c.status === "pending");
  let status: QaCheckStatus = "pending";
  if (running) status = "running";
  else if (failed) status = "fail";
  else if (warned) status = "warn";
  else if (skipped) status = "skipped";
  else if (children.every((c) => c.status === "pass" || c.status === "skipped")) status = "pass";
  else if (!pending) status = "pass";

  return {
    id: "local-checks",
    label: "Local checks",
    status,
    groupChildren: LOCAL_CHILD_IDS,
    detail: children
      .filter((c) => c.status !== "pending" && c.status !== "running")
      .map((c) => `${c.label}: ${c.status}`)
      .join(" · ") || undefined,
  };
}

export function deriveQaShipState(checks: QaCheck[]): QaShipState | null {
  const actionable = checks.filter((c) => c.id !== "local-checks" && c.id !== "apply-guard");
  if (!actionable.length) return null;
  if (actionable.some((c) => c.status === "running" || c.status === "pending" || c.status === "blocked")) {
    return null;
  }
  if (actionable.some((c) => c.status === "fail")) return "blocked";
  const hasWarn = actionable.some((c) => c.status === "warn");
  const hasAvailabilitySkip = actionable.some((c) => (
    c.status === "skipped" && c.skipReason !== "not-applicable"
  ));
  if (hasWarn || hasAvailabilitySkip) return "known-warnings";
  return "ready-to-ship";
}

export function qaShipStateLabel(state: QaShipState): string {
  switch (state) {
    case "ready-to-ship":
      return "Ready to ship";
    case "known-warnings":
      return "Known warnings";
    case "blocked":
      return "Blocked";
    case "needs-human-judgment":
      return "Needs human judgment";
    default:
      return "QA complete";
  }
}

export function buildStructuredFixPrompt(checks: QaCheck[], context: {
  taskGoal?: string;
  iteration?: number;
  changedFiles?: string[];
}): string {
  const failed = checks.filter((c) => c.status === "fail");
  if (!failed.length) return "";

  const deterministic = failed.filter((c) => (
    c.id === "types" || c.id === "tests" || c.id === "lint" || c.id === "preview"
  ));
  const deterministicOrder = ["tests", "types", "preview", "lint"] as const;
  deterministic.sort((a, b) => {
    const ai = deterministicOrder.indexOf(a.id as typeof deterministicOrder[number]);
    const bi = deterministicOrder.indexOf(b.id as typeof deterministicOrder[number]);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  const reviews = failed.filter((c) => c.id === "review-1" || c.id === "review-2");

  const lines: string[] = [
    "Glass QA Mode found issues. Fix all high-confidence blockers in one minimal pass.",
  ];

  if (context.taskGoal?.trim()) {
    lines.push("", `Task: ${context.taskGoal.trim()}`);
  }
  if (context.iteration && context.iteration > 1) {
    lines.push(`QA fix iteration: ${context.iteration}`);
  }
  if (context.changedFiles?.length) {
    lines.push("", "In-scope files:", ...context.changedFiles.map((f) => `- ${f}`));
  }

  if (deterministic.length) {
    lines.push("", "## Deterministic blockers");
    for (const check of deterministic) {
      lines.push("", `### ${check.label}`);
      if (check.command) lines.push(`Command: ${check.command}`);
      if (check.failures?.length) {
        for (const f of check.failures) {
          lines.push(`- ${formatStructuredFailure(f)}`);
        }
      } else if (check.fixPrompt) {
        lines.push(check.fixPrompt);
      }
    }
  }

  if (reviews.length) {
    lines.push("", "## AI review findings");
    for (const check of reviews) {
      lines.push("", `### ${check.label}`);
      if (check.fixPrompt) lines.push(check.fixPrompt);
    }
  }

  lines.push(
    "",
    "## Guardrails",
    "- Preserve currently passing checks.",
    "- Do not expand scope beyond touched files unless required.",
    "- Prefer minimal behavior-preserving fixes over style cleanups.",
    "",
    "## Success criteria",
    "- Previously failed checks pass.",
    "- No new failures introduced.",
    "- Summarize rationale in 3 bullets.",
  );

  return lines.join("\n");
}

export function combineQaFixPrompts(checks: QaCheck[]): string {
  return buildStructuredFixPrompt(checks, {});
}

export function parseTestOutput(output: string): { passed: number | null; failed: number } {
  const passMatch = output.match(/(\d+)\s+(?:tests?\s+)?passed/i)
    ?? output.match(/Tests:\s*(\d+)\s+passed/i);
  const failMatch = output.match(/(\d+)\s+(?:tests?\s+)?failed/i)
    ?? output.match(/Tests:\s*\d+\s+passed,\s*(\d+)\s+failed/i);
  return {
    passed: passMatch ? parseInt(passMatch[1], 10) : null,
    failed: failMatch ? parseInt(failMatch[1], 10) : 0,
  };
}

export function parseLintOutput(output: string): { errors: number; warnings: number } {
  const errorMatch = output.match(/(\d+)\s+error/i);
  const warnMatch = output.match(/(\d+)\s+warning/i);
  return {
    errors: errorMatch ? parseInt(errorMatch[1], 10) : 0,
    warnings: warnMatch ? parseInt(warnMatch[1], 10) : 0,
  };
}

export function buildTypeFailures(output: string): QaStructuredFailure[] {
  return parseTypeScriptDiagnostics(output);
}

export function buildTestFailures(output: string): QaStructuredFailure[] {
  return parseTestFailures(output);
}

export function buildLintFailures(output: string, errorsOnly = true): QaStructuredFailure[] {
  const parsed = parseEslintDiagnostics(output);
  return errorsOnly ? parsed.filter((f) => f.severity === "error") : parsed;
}

export function failuresFixExcerpt(failures: QaStructuredFailure[], rawOutput: string): string {
  if (failures.length) {
    return failures.map(formatStructuredFailure).join("\n");
  }
  return rawOutput.slice(-2000);
}

export interface PackageScripts {
  test?: string;
  vitest?: string;
  jest?: string;
  lint?: string;
  eslint?: string;
}

export function detectTestCommandFromScripts(scripts: PackageScripts): string | null {
  if (scripts.test) return "npm run test";
  if (scripts.vitest) return "npm run vitest";
  if (scripts.jest) return "npm run jest";
  return null;
}

export function detectLintCommandFromScripts(scripts: PackageScripts): string | null {
  if (scripts.lint) return "npm run lint";
  if (scripts.eslint) return "npm run eslint";
  return null;
}

const CODE_FILE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/i;
const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx|js|jsx)$/i;

export function shouldRunTestsForChanges(changedPaths: string[]): boolean {
  return changedPaths.some((p) => CODE_FILE_RE.test(p) || TEST_FILE_RE.test(p));
}

export function reviewHasActionableFindings(findings: string): boolean {
  const text = findings.trim().toLowerCase();
  if (!text) return false;
  const cleanPhrases = [
    "looks good",
    "looks correct",
    "no issues",
    "nothing to fix",
    "ship it",
    "lgtm",
    "no material",
    "no actionable",
  ];
  if (cleanPhrases.some((p) => text.includes(p)) && text.length < 160) return false;
  return true;
}

export function buildPreviewFailures(probe: QaPreviewProbeResult): QaStructuredFailure[] {
  const failures: QaStructuredFailure[] = [];
  const push = (message: string, excerpt?: string): void => {
    failures.push({
      source: "preview",
      severity: "error",
      message,
      rawExcerpt: excerpt ?? message,
    });
  };

  for (const msg of probe.errors ?? []) push(msg, msg);
  for (const msg of probe.unhandledRejections ?? []) {
    push(`Unhandled rejection: ${msg}`, msg);
  }
  for (const msg of probe.networkErrors ?? []) {
    push(`Network error: ${msg}`, msg);
  }
  if (probe.bootTimedOut) push("Preview boot timed out");
  if (probe.blankScreen) push("Preview appears blank after load");

  return failures.slice(0, 12);
}

export interface QaCompletionLists {
  passed: string[];
  warnings: string[];
  skipped: string[];
  failed: string[];
  shipState: QaShipState | null;
  shipLabel: string | null;
}

export function deriveQaCompletionLists(
  checks: QaCheck[],
  recovery?: import("./glassQaRecovery.ts").QaRecoveryState | null,
): QaCompletionLists {
  const actionable = checks.filter((c) => c.id !== "local-checks" && c.id !== "apply-guard");
  const passed: string[] = [];
  const warnings: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const check of actionable) {
    if (check.status === "pass" || check.status === "deferred") {
      passed.push(check.label);
    } else if (check.status === "warn") {
      warnings.push(check.detail ? `${check.label}: ${check.detail}` : check.label);
    } else if (check.status === "skipped") {
      const reason = check.skipReason === "not-applicable"
        ? "not applicable"
        : check.skipReason === "disabled"
          ? "disabled"
          : "unavailable";
      skipped.push(`${check.label}: ${check.detail ?? reason}`);
    } else if (check.status === "fail") {
      failed.push(check.label);
    }
  }

  if (recovery?.needsHumanJudgment) {
    return {
      passed,
      warnings,
      skipped,
      failed,
      shipState: "needs-human-judgment",
      shipLabel: qaShipStateLabel("needs-human-judgment"),
    };
  }

  const shipState = deriveQaShipState(checks);
  return {
    passed,
    warnings,
    skipped,
    failed,
    shipState,
    shipLabel: shipState ? qaShipStateLabel(shipState) : null,
  };
}
