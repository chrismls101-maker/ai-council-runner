/**
 * Glass QA Pipeline — full quality check sequence for Glass Coder runs.
 */

import { existsSync } from "node:fs";
import { promises as fsp } from "node:fs";
import { join } from "node:path";
import type { AgentChangeLogEntry } from "../shared/ipc.ts";
import type { GlassConfig } from "../shared/config.ts";
import type { GlassUserSettings } from "../shared/glassSettings.ts";
import {
  aggregateLocalChecksGroup,
  buildLintFailures,
  buildStructuredFixPrompt,
  buildTestFailures,
  buildTypeFailures,
  deferredReviewCheck,
  detectLintCommandFromScripts,
  detectTestCommandFromScripts,
  failuresFixExcerpt,
  initialQaChecks,
  parseLintOutput,
  parseTestOutput,
  buildPreviewFailures,
  qaHasHardLocalFailures,
  reviewHasActionableFindings,
  shouldRunTestsForChanges,
  type QaCheck,
  type QaCheckId,
  type QaPipelineState,
  type QaPreviewProbeResult,
} from "../shared/glassQaPipeline.ts";
import { shouldExpandForQaCheck } from "../shared/glassIdeChromeOrchestrator.ts";
import { narrateToolStart } from "../shared/agentNarration.ts";
import { CODER_LOOP_MAX_ITERATIONS } from "../shared/coderBuildLoopShared.ts";
import { resolvePackageRootForPath } from "../shared/glassQaMonorepo.ts";
import {
  appendRunningLoopEntry,
  collectFailureSignatures,
  computeRerunChecks,
  detectRepeatedFailures,
  emptyQaRecoveryState,
  extractRecoveryPlan,
  mergeChecksForRerun,
  shouldRunQaCheck,
  updateLoopHistoryEntry,
  type QaRecoveryState,
} from "../shared/glassQaRecovery.ts";
import { resolveBuildCommand } from "./agentBuildVerify.ts";
import { readFileForDiff, runShellCommand } from "./glassActions.ts";
import { askIivoGlass } from "./glassAskClient.ts";
import { expandAgentPath } from "./agentCoderTools.ts";
import type { OpenCoderWithPromptPayload } from "../shared/ipc.ts";

const SHELL_TIMEOUT_MS = 120_000;
const LINT_TIMEOUT_MS = 60_000;
const REVIEW_FILE_MAX = 5;
const REVIEW_SNIPPET_MAX = 4_096;

export interface QaPipelineHost {
  getSettings: () => GlassUserSettings;
  getChangeLog: () => AgentChangeLogEntry[];
  getConfig: () => GlassConfig;
  getPipelineState: () => QaPipelineState | null | undefined;
  setPipelineState: (state: QaPipelineState | null) => void;
  setLastNotice: (notice: string) => void;
  narrate?: (text: string) => void;
  push: () => void;
  isCoderRunCurrent: (runId: string) => boolean;
  requestPreviewProbe: () => Promise<QaPreviewProbeResult | null>;
  broadcastOpenCoder: (payload: OpenCoderWithPromptPayload) => void;
  getLoopIteration: () => number | undefined;
  setLoopIteration: (iteration: number) => void;
  getLoopSessionId: () => string | null | undefined;
  getRecoveryState: () => QaRecoveryState | null | undefined;
  setRecoveryState: (state: QaRecoveryState | null) => void;
  onShellCheckStart?: () => void;
  onPipelineComplete?: (hasFail: boolean) => void;
}

function announcePipeline(host: QaPipelineHost, text: string): void {
  host.setLastNotice(text);
  host.narrate?.(text);
}

function appliedPathsForRun(changeLog: AgentChangeLogEntry[], runId: string): string[] {
  return changeLog
    .filter((e) => e.runId === runId && e.action === "applied")
    .map((e) => e.path);
}

function pickVerifyAnchor(projectRoot: string, changedPaths: string[]): string {
  const codeExt = /\.(ts|tsx|js|jsx)$/i;
  const codePath = changedPaths.find((p) => codeExt.test(p));
  if (codePath) return codePath;
  return join(projectRoot, "package.json");
}

async function runShellWithTimeout(
  cmd: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ ok: boolean; output: string; exitCode: number; durationMs: number }> {
  return new Promise((resolve) => {
    let output = "";
    let settled = false;
    const startedAt = Date.now();

    const finish = (ok: boolean, exitCode: number, message?: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok,
        output: message ?? output.trim(),
        exitCode,
        durationMs: Date.now() - startedAt,
      });
    };

    const cancel = runShellCommand(
      `cd ${JSON.stringify(cwd)} && ${cmd} 2>&1`,
      (chunk) => { output += chunk; },
      (exitCode) => finish(exitCode === 0, exitCode ?? 1),
    );

    const timer = setTimeout(() => {
      cancel();
      finish(false, 1, `Command timed out after ${timeoutMs / 1000}s`);
    }, timeoutMs);
  });
}

async function readPackageScriptsAt(cwd: string): Promise<Record<string, string>> {
  const pkgPath = join(cwd, "package.json");
  try {
    const raw = await fsp.readFile(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}

async function readPackageScripts(projectRoot: string): Promise<Record<string, string>> {
  return readPackageScriptsAt(expandAgentPath(projectRoot));
}

async function detectLintCommand(cwd: string): Promise<string | null> {
  const root = cwd.startsWith("~") ? expandAgentPath(cwd) : cwd;
  const scripts = await readPackageScriptsAt(root);
  const fromScripts = detectLintCommandFromScripts(scripts);
  if (fromScripts) return fromScripts;

  const eslintConfigs = [
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
    ".eslintrc",
    ".eslintrc.js",
    ".eslintrc.cjs",
    ".eslintrc.json",
  ];
  if (eslintConfigs.some((name) => existsSync(join(root, name)))) {
    return "npx eslint .";
  }
  return null;
}

function replaceChecks(state: QaPipelineState, updates: QaCheck[]): QaCheck[] {
  const map = new Map(updates.map((c) => [c.id, c]));
  return state.checks.map((c) => map.get(c.id) ?? c);
}

function publishChecks(
  state: QaPipelineState,
  updates: QaCheck[],
  host: QaPipelineHost,
): QaPipelineState {
  let checks = replaceChecks(state, updates);
  const group = aggregateLocalChecksGroup(checks);
  checks = replaceChecks({ ...state, checks }, [group]);
  const next = { ...state, checks };
  host.setPipelineState(next);
  host.push();
  return next;
}

async function runTypesCheck(
  projectRoot: string,
  changedPaths: string[],
): Promise<QaCheck> {
  const anchor = pickVerifyAnchor(projectRoot, changedPaths);
  const buildCmd = await resolveBuildCommand(anchor);
  if (!buildCmd) {
    return {
      id: "types",
      label: "Typecheck",
      status: "skipped",
      detail: "No typecheck command found",
      skipReason: "unavailable",
    };
  }

  const result = await runShellWithTimeout(buildCmd.cmd, buildCmd.cwd, SHELL_TIMEOUT_MS);
  if (result.ok) {
    return {
      id: "types",
      label: "Typecheck",
      status: "pass",
      detail: "Clean",
      command: buildCmd.cmd,
      durationMs: result.durationMs,
    };
  }

  const failures = buildTypeFailures(result.output);
  return {
    id: "types",
    label: "Typecheck",
    status: "fail",
    detail: failures[0] ? failures[0].message : "Type errors",
    command: buildCmd.cmd,
    durationMs: result.durationMs,
    failures,
    fixPrompt: failuresFixExcerpt(failures, result.output),
  };
}

async function runTestsCheck(projectRoot: string, changedPaths: string[]): Promise<QaCheck> {
  if (!shouldRunTestsForChanges(changedPaths)) {
    return {
      id: "tests",
      label: "Tests",
      status: "skipped",
      detail: "No code changes affecting tests",
      skipReason: "not-applicable",
    };
  }

  const pkgRoot = changedPaths.length
    ? resolvePackageRootForPath(expandAgentPath(projectRoot), changedPaths[0])
    : expandAgentPath(projectRoot);
  const scripts = await readPackageScriptsAt(pkgRoot);
  const cmd = detectTestCommandFromScripts(scripts);
  if (!cmd) {
    return {
      id: "tests",
      label: "Tests",
      status: "skipped",
      detail: "No test command found",
      skipReason: "unavailable",
    };
  }

  const result = await runShellWithTimeout(cmd, pkgRoot, SHELL_TIMEOUT_MS);
  const { passed, failed } = parseTestOutput(result.output);

  if (result.exitCode !== 0 || failed > 0) {
    const failures = buildTestFailures(result.output);
    return {
      id: "tests",
      label: "Tests",
      status: "fail",
      detail: failed ? `${failed} failed` : "Test run failed",
      command: cmd,
      durationMs: result.durationMs,
      failures,
      fixPrompt: failuresFixExcerpt(failures, result.output),
    };
  }

  return {
    id: "tests",
    label: "Tests",
    status: "pass",
    detail: passed != null ? `${passed} passed` : "All passed",
    command: cmd,
    durationMs: result.durationMs,
  };
}

async function runLintCheck(projectRoot: string, changedPaths: string[]): Promise<QaCheck> {
  const pkgRoot = changedPaths.length
    ? resolvePackageRootForPath(expandAgentPath(projectRoot), changedPaths[0])
    : expandAgentPath(projectRoot);
  const cmd = await detectLintCommand(pkgRoot);
  if (!cmd) {
    return {
      id: "lint",
      label: "Lint",
      status: "skipped",
      detail: "No lint config found",
      skipReason: "unavailable",
    };
  }

  const result = await runShellWithTimeout(cmd, pkgRoot, LINT_TIMEOUT_MS);
  const { errors, warnings } = parseLintOutput(result.output);
  const lintFailures = buildLintFailures(result.output, false);

  if (errors > 0) {
    const errorFailures = lintFailures.filter((f) => f.severity === "error");
    return {
      id: "lint",
      label: "Lint",
      status: "fail",
      detail: `${errors} error${errors > 1 ? "s" : ""}${warnings > 0 ? `, ${warnings} warning${warnings > 1 ? "s" : ""}` : ""}`,
      command: cmd,
      durationMs: result.durationMs,
      failures: errorFailures,
      fixPrompt: failuresFixExcerpt(errorFailures, result.output),
    };
  }

  if (warnings > 0) {
    return {
      id: "lint",
      label: "Lint",
      status: "warn",
      detail: `${warnings} warning${warnings > 1 ? "s" : ""}`,
      command: cmd,
      durationMs: result.durationMs,
      failures: lintFailures.filter((f) => f.severity === "warning"),
    };
  }

  return {
    id: "lint",
    label: "Lint",
    status: "pass",
    detail: "Clean",
    command: cmd,
    durationMs: result.durationMs,
  };
}

async function runPreviewSmokeCheck(host: QaPipelineHost): Promise<QaCheck> {
  const probe = await host.requestPreviewProbe();
  if (probe === null || probe.skipped) {
    return {
      id: "preview",
      label: "Preview smoke",
      status: "skipped",
      detail: "Preview inactive",
      skipReason: "unavailable",
    };
  }

  const failures = buildPreviewFailures(probe);
  if (failures.length === 0) {
    return {
      id: "preview",
      label: "Preview smoke",
      status: "pass",
      detail: "0 runtime errors",
    };
  }

  return {
    id: "preview",
    label: "Preview smoke",
    status: "fail",
    detail: `${failures.length} runtime signal${failures.length > 1 ? "s" : ""}`,
    failures,
    fixPrompt: failuresFixExcerpt(failures, failures.map((f) => f.message).join("\n")),
  };
}

async function buildReviewSections(
  projectRoot: string,
  changedPaths: string[],
): Promise<string[]> {
  const absRoot = expandAgentPath(projectRoot);
  const fileSections: string[] = [];

  for (const filePath of changedPaths.slice(0, REVIEW_FILE_MAX)) {
    const result = await readFileForDiff(filePath);
    if (!result.ok || !result.existed || !result.content) continue;
    const rel = filePath.replace(absRoot + "/", "").replace(absRoot + "\\", "");
    const snippet = result.content.length > REVIEW_SNIPPET_MAX
      ? `${result.content.slice(0, REVIEW_SNIPPET_MAX)}\n…(truncated)`
      : result.content;
    fileSections.push(`### ${rel}\n\`\`\`typescript\n${snippet}\n\`\`\``);
  }
  return fileSections;
}

async function runReviewPass1WithHost(
  projectRoot: string,
  changedPaths: string[],
  host: QaPipelineHost,
): Promise<QaCheck> {
  const fileSections = await buildReviewSections(projectRoot, changedPaths);
  if (!fileSections.length) {
    return {
      id: "review-1",
      label: "Review: Correctness",
      status: "skipped",
      detail: "No files to review",
      skipReason: "not-applicable",
    };
  }

  const reviewPrompt = [
    "Review the following changed files for correctness — bugs, logic errors, null checks, missing cases.",
    "Be specific. If nothing is wrong, say so in one sentence.",
    "",
    ...fileSections,
  ].join("\n");

  const response = await askIivoGlass(host.getConfig(), {
    prompt: reviewPrompt,
    modelPurpose: "default",
    responseStyle: "full",
  });

  const findings = response.answer?.trim() ?? "";
  if (!reviewHasActionableFindings(findings)) {
    return { id: "review-1", label: "Review: Correctness", status: "pass", detail: "Clean" };
  }

  return {
    id: "review-1",
    label: "Review: Correctness",
    status: "fail",
    detail: "Actionable findings",
    fixPrompt: `Code review (correctness) found issues:\n\n${findings.slice(0, 2000)}\n\nFix the correctness issues identified.`,
  };
}

async function runReviewPass2(
  projectRoot: string,
  changedPaths: string[],
  host: QaPipelineHost,
): Promise<QaCheck> {
  const fileSections = await buildReviewSections(projectRoot, changedPaths);
  if (!fileSections.length) {
    return {
      id: "review-2",
      label: "Review: Production readiness",
      status: "skipped",
      detail: "No files to review",
      skipReason: "not-applicable",
    };
  }

  const reviewPrompt = [
    "You are reviewing for production readiness only.",
    "Ignore style and naming. Focus: what breaks at runtime?",
    "Race conditions, unhandled promise rejections, error handling gaps,",
    "edge cases that only appear under real load or with unexpected input.",
    "Be specific. If nothing is wrong, say so in one sentence.",
    "",
    ...fileSections,
  ].join("\n");

  const response = await askIivoGlass(host.getConfig(), {
    prompt: reviewPrompt,
    modelPurpose: "default",
    responseStyle: "full",
  });

  const findings = response.answer?.trim() ?? "";
  if (!reviewHasActionableFindings(findings)) {
    return { id: "review-2", label: "Review: Production readiness", status: "pass", detail: "Clean" };
  }

  return {
    id: "review-2",
    label: "Review: Production readiness",
    status: "fail",
    detail: "Actionable findings",
    fixPrompt: `Production readiness review found issues:\n\n${findings.slice(0, 2000)}\n\nFix the production risks identified.`,
  };
}

function finalizeRecoveryAfterQa(
  host: QaPipelineHost,
  sessionId: string,
  checks: QaCheck[],
  iteration: number,
): void {
  const recovery = host.getRecoveryState();
  const base = recovery?.sessionId === sessionId
    ? recovery
    : emptyQaRecoveryState(sessionId);

  const signatures = collectFailureSignatures(checks);
  const failedChecks = checks.filter((c) => c.status === "fail");
  const hasFail = failedChecks.length > 0;
  const repeated = detectRepeatedFailures(signatures, base.signatureHistory);
  const atCap = iteration >= CODER_LOOP_MAX_ITERATIONS;

  let loopHistory = base.loopHistory;
  if (loopHistory.some((e) => e.iteration === iteration)) {
    loopHistory = updateLoopHistoryEntry(loopHistory, iteration, {
      status: hasFail ? "failed" : "passed",
      failedCheckIds: failedChecks.map((c) => c.id),
      failedLabels: failedChecks.map((c) => c.label),
    });
  }

  host.setRecoveryState({
    ...base,
    sessionId,
    iteration,
    pendingRerun: hasFail
      ? computeRerunChecks(
        failedChecks.map((c) => c.id),
        {
          previewWasSkipped: checks.some((c) => c.id === "preview" && c.status === "skipped"),
          previewWasRun: checks.some((c) => c.id === "preview" && c.status !== "skipped"),
        },
      )
      : [],
    preservedChecks: hasFail ? checks.filter((c) => c.status !== "fail") : [],
    loopHistory,
    recoveryPlan: hasFail ? extractRecoveryPlan(checks) : [],
    failureSignatures: signatures,
    signatureHistory: signatures.length
      ? [...base.signatureHistory, signatures]
      : base.signatureHistory,
    needsHumanJudgment: repeated.repeated || (atCap && hasFail),
    judgmentReason: repeated.repeated
      ? repeated.reason
      : atCap && hasFail
        ? `QA fix loop reached ${CODER_LOOP_MAX_ITERATIONS} iterations with remaining failures.`
        : null,
    lastFailedCheckId: failedChecks[0]?.id ?? null,
  });
}

export async function runQaPipeline(
  runId: string,
  projectRoot: string,
  host: QaPipelineHost,
): Promise<void> {
  if (!host.getSettings().qaModeEnabled) return;

  const changedPaths = appliedPathsForRun(host.getChangeLog(), runId);
  if (!changedPaths.length || !host.isCoderRunCurrent(runId)) return;

  const sessionId = host.getLoopSessionId() ?? runId;
  const recovery = host.getRecoveryState();
  const rerunOnly = recovery?.sessionId === sessionId && recovery.pendingRerun.length > 0
    ? recovery.pendingRerun
    : null;
  const iteration = host.getLoopIteration() ?? 1;

  const checks = rerunOnly?.length
    ? mergeChecksForRerun(
      initialQaChecks(),
      recovery!.preservedChecks,
      new Set(rerunOnly),
    )
    : initialQaChecks();

  const pipeline: QaPipelineState = {
    runId,
    status: "running",
    checks,
    autoFix: host.getSettings().qaAutoFix === true,
  };
  host.setPipelineState(pipeline);
  announcePipeline(host, narrateToolStart(
    rerunOnly?.length ? "qa-fix-trigger" : "qa-mode-enter",
    {},
  ));
  host.push();
  host.onShellCheckStart?.();

  try {
    let current = host.getPipelineState();
    if (!current || current.runId !== runId) return;

    const runLocal = ["types", "tests", "lint"].some((id) => (
      shouldRunQaCheck(id as QaCheckId, rerunOnly)
    ));

    if (runLocal) {
      const localIds = (["types", "tests", "lint"] as const)
        .filter((id) => shouldRunQaCheck(id, rerunOnly));
      const runningChildren = localIds.map((id) => {
        const existing = current!.checks.find((c) => c.id === id)!;
        return { ...existing, status: "running" as const };
      });
      current = publishChecks(current, [
        { ...current.checks.find((c) => c.id === "local-checks")!, status: "running" },
        ...runningChildren,
      ], host);

      const runners: Array<Promise<QaCheck>> = [];
      if (shouldRunQaCheck("types", rerunOnly)) {
        runners.push(runTypesCheck(projectRoot, changedPaths));
      }
      if (shouldRunQaCheck("tests", rerunOnly)) {
        runners.push(runTestsCheck(projectRoot, changedPaths));
      }
      if (shouldRunQaCheck("lint", rerunOnly)) {
        runners.push(runLintCheck(projectRoot, changedPaths));
      }

      const localResults = await Promise.all(runners);
      current = host.getPipelineState();
      if (!current || current.runId !== runId || !host.isCoderRunCurrent(runId)) return;
      current = publishChecks(current, localResults, host);
      const typesResult = localResults.find((c) => c.id === "types");
      if (typesResult) {
        const key = qaNarrationKey(typesResult);
        if (key) announcePipeline(host, narrateToolStart(key, {}));
      }
    }

    if (shouldRunQaCheck("preview", rerunOnly)) {
      const previewResult = await runPreviewSmokeCheck(host);
      current = host.getPipelineState();
      if (!current || current.runId !== runId) return;
      current = publishChecks(current, [previewResult], host);
    }

    current = host.getPipelineState();
    if (!current || current.runId !== runId) return;

    const hardLocalFail = qaHasHardLocalFailures(current.checks);
    const runReviews = !hardLocalFail && (
      shouldRunQaCheck("review-1", rerunOnly) || shouldRunQaCheck("review-2", rerunOnly)
    );

    if (hardLocalFail && (!rerunOnly || rerunOnly.some((id) => id === "review-1" || id === "review-2"))) {
      const deferred = [
        deferredReviewCheck("review-1", "Deferred until local blockers are fixed"),
        deferredReviewCheck("review-2", "Deferred until local blockers are fixed"),
      ];
      current = publishChecks(current, deferred, host);
    } else if (runReviews) {
      if (shouldRunQaCheck("review-1", rerunOnly)) {
        const review1 = await runReviewPass1WithHost(projectRoot, changedPaths, host);
        current = host.getPipelineState();
        if (!current || current.runId !== runId) return;
        current = publishChecks(current, [review1], host);

        if (review1.status === "fail") {
          current = publishChecks(current, [
            deferredReviewCheck("review-2", "Deferred until correctness review passes"),
          ], host);
        } else if (shouldRunQaCheck("review-2", rerunOnly)) {
          const review2 = await runReviewPass2(projectRoot, changedPaths, host);
          current = host.getPipelineState();
          if (!current || current.runId !== runId) return;
          current = publishChecks(current, [review2], host);
        }
      } else if (shouldRunQaCheck("review-2", rerunOnly)) {
        const review2 = await runReviewPass2(projectRoot, changedPaths, host);
        current = host.getPipelineState();
        if (!current || current.runId !== runId) return;
        current = publishChecks(current, [review2], host);
      }
    }

    const finalState = host.getPipelineState();
    if (!finalState || finalState.runId !== runId) return;

    const hasFail = finalState.checks.some((c) => c.status === "fail");
    const hasWarn = finalState.checks.some((c) => c.status === "warn");
    host.setPipelineState({ ...finalState, status: "done" });
    finalizeRecoveryAfterQa(host, sessionId, finalState.checks, iteration);
    announcePipeline(host, narrateToolStart(
      hasFail ? "qa-issues-found" : hasWarn ? "qa-lint-warn" : "qa-all-pass",
      {},
    ));
    host.onPipelineComplete?.(hasFail);
    host.push();
  } catch (err) {
    console.warn("[qa-pipeline] failed:", err);
    const current = host.getPipelineState();
    if (current?.runId === runId) {
      host.setPipelineState({ ...current, status: "done" });
      host.push();
    }
  }
}

function qaNarrationKey(check: QaCheck): string | null {
  switch (check.id) {
    case "types":
      if (check.status === "pass") return "qa-types-pass";
      if (check.status === "fail") return "qa-types-fail";
      return null;
    case "tests":
      if (check.status === "pass") return "qa-tests-pass";
      if (check.status === "fail") return "qa-tests-fail";
      return null;
    case "lint":
      if (check.status === "pass") return "qa-lint-pass";
      if (check.status === "warn") return "qa-lint-warn";
      if (check.status === "fail") return "qa-lint-fail";
      return null;
    case "preview":
      if (check.status === "pass") return "qa-preview-pass";
      return null;
    case "review-1":
      if (check.status === "running") return "qa-review-1";
      return null;
    case "review-2":
      if (check.status === "running") return "qa-review-2";
      return null;
    default:
      return null;
  }
}

function bumpQaLoop(host: QaPipelineHost): void {
  host.setLoopIteration((host.getLoopIteration() ?? 1) + 1);
}

export function triggerQaFixAll(
  runId: string,
  checks: QaCheck[],
  host: QaPipelineHost,
  context?: { taskGoal?: string; changedFiles?: string[] },
): boolean {
  const iteration = host.getLoopIteration() ?? 1;
  if (iteration >= CODER_LOOP_MAX_ITERATIONS) {
    announcePipeline(host, narrateToolStart("coder-loop-cap", {}));
    host.push();
    return false;
  }

  const prompt = buildStructuredFixPrompt(checks, {
    taskGoal: context?.taskGoal,
    iteration,
    changedFiles: context?.changedFiles,
  });
  if (!prompt.trim()) return false;

  const sessionId = host.getLoopSessionId() ?? runId;
  const failedChecks = checks.filter((c) => c.status === "fail");
  const failedIds = failedChecks.map((c) => c.id);
  const signatures = collectFailureSignatures(checks);
  const existing = host.getRecoveryState();
  const base = existing?.sessionId === sessionId
    ? existing
    : emptyQaRecoveryState(sessionId);
  const repeated = detectRepeatedFailures(signatures, base.signatureHistory);
  const nextIteration = iteration + 1;

  host.setRecoveryState({
    ...base,
    sessionId,
    iteration: nextIteration,
    pendingRerun: computeRerunChecks(failedIds, {
      previewWasSkipped: checks.some((c) => c.id === "preview" && c.status === "skipped"),
      previewWasRun: checks.some((c) => c.id === "preview" && c.status !== "skipped"),
    }),
    preservedChecks: checks.filter((c) => c.status !== "fail"),
    loopHistory: appendRunningLoopEntry(
      base.loopHistory,
      nextIteration,
      failedIds,
      failedChecks.map((c) => c.label),
    ),
    recoveryPlan: extractRecoveryPlan(checks),
    fixPromptPreview: prompt,
    failureSignatures: signatures,
    needsHumanJudgment: repeated.repeated || nextIteration >= CODER_LOOP_MAX_ITERATIONS,
    judgmentReason: repeated.repeated ? repeated.reason : null,
    lastFailedCheckId: failedIds[0] ?? null,
  });

  bumpQaLoop(host);
  host.setPipelineState(null);
  announcePipeline(host, narrateToolStart("qa-fix-trigger", {}));
  host.push();
  host.broadcastOpenCoder({
    prompt,
    autoRun: true,
    loopAutoTrigger: true,
    launchNonce: Date.now(),
  });
  return true;
}

export { CODER_LOOP_MAX_ITERATIONS };
