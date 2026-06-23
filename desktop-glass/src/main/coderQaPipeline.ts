/**
 * Glass QA Pipeline — full quality check sequence for Glass Coder runs.
 *
 * Checks in order:
 *   1. Types/build    — tsc / npm run build
 *   2. Tests          — detected from package.json
 *   3. Lint           — detected from eslint config
 *   4. Preview smoke  — console error scan via webview probe
 *   5. Review pass 1  — AI correctness review
 *   6. Review pass 2  — AI production readiness review
 */

import { existsSync } from "node:fs";
import { promises as fsp } from "node:fs";
import { join } from "node:path";
import type { AgentChangeLogEntry } from "../shared/ipc.ts";
import type { GlassConfig } from "../shared/config.ts";
import type { GlassUserSettings } from "../shared/glassSettings.ts";
import {
  combineQaFixPrompts,
  detectLintCommandFromScripts,
  detectTestCommandFromScripts,
  initialQaChecks,
  parseLintOutput,
  parseTestOutput,
  reviewHasActionableFindings,
  type QaCheck,
  type QaPipelineState,
} from "../shared/glassQaPipeline.ts";
import { shouldExpandForQaCheck } from "../shared/glassIdeChromeOrchestrator.ts";
import { narrateToolStart } from "../shared/agentNarration.ts";
import {
  CODER_LOOP_MAX_ITERATIONS,
} from "../shared/coderBuildLoopShared.ts";
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
  /** Spoken TTS cue (overlay narration queue) — independent of lastNotice UI. */
  narrate?: (text: string) => void;
  push: () => void;
  isCoderRunCurrent: (runId: string) => boolean;
  requestPreviewProbe: () => Promise<string[] | null>;
  broadcastOpenCoder: (payload: OpenCoderWithPromptPayload) => void;
  getLoopIteration: () => number | undefined;
  setLoopIteration: (iteration: number) => void;
  /** IDE chrome — expand terminal while shell QA checks run. */
  onShellCheckStart?: () => void;
  /** IDE chrome — post-run collapse policy. */
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
): Promise<{ ok: boolean; output: string; exitCode: number }> {
  return new Promise((resolve) => {
    let output = "";
    let settled = false;

    const finish = (ok: boolean, exitCode: number, message?: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok, output: message ?? output.trim(), exitCode });
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

async function readPackageScripts(projectRoot: string): Promise<Record<string, string>> {
  const pkgPath = join(expandAgentPath(projectRoot), "package.json");
  try {
    const raw = await fsp.readFile(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}

async function detectLintCommand(projectRoot: string): Promise<string | null> {
  const root = expandAgentPath(projectRoot);
  const scripts = await readPackageScripts(projectRoot);
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

function updateCheck(
  state: QaPipelineState,
  check: QaCheck,
  host: QaPipelineHost,
): void {
  const checks = state.checks.map((c) => (c.id === check.id ? check : c));
  host.setPipelineState({ ...state, checks });
  host.push();
}

async function runTypesCheck(
  projectRoot: string,
  changedPaths: string[],
): Promise<QaCheck> {
  const anchor = pickVerifyAnchor(projectRoot, changedPaths);
  const buildCmd = await resolveBuildCommand(anchor);
  if (!buildCmd) {
    return { id: "types", label: "Types & build", status: "skipped", detail: "No build config found" };
  }

  const result = await runShellWithTimeout(buildCmd.cmd, buildCmd.cwd, SHELL_TIMEOUT_MS);
  if (result.ok) {
    return {
      id: "types",
      label: "Types & build",
      status: "pass",
      detail: buildCmd.cmd,
    };
  }

  return {
    id: "types",
    label: "Types & build",
    status: "fail",
    detail: "Type/build errors",
    fixPrompt: `Type or build errors found (${buildCmd.cmd}):\n\n${result.output.slice(-2000)}\n\nFix all type and build errors.`,
  };
}

async function runTestsCheck(projectRoot: string): Promise<QaCheck> {
  const scripts = await readPackageScripts(projectRoot);
  const cmd = detectTestCommandFromScripts(scripts);
  if (!cmd) {
    return { id: "tests", label: "Tests", status: "skipped", detail: "No test script found" };
  }

  const root = expandAgentPath(projectRoot);
  const result = await runShellWithTimeout(cmd, root, SHELL_TIMEOUT_MS);
  const { passed, failed } = parseTestOutput(result.output);

  if (result.exitCode !== 0 || failed > 0) {
    return {
      id: "tests",
      label: "Tests",
      status: "fail",
      detail: failed ? `${failed} failed` : "Test run failed",
      fixPrompt: `Tests are failing:\n\n${result.output.slice(-2000)}\n\nFix all failing tests.`,
    };
  }

  return {
    id: "tests",
    label: "Tests",
    status: "pass",
    detail: passed != null ? `${passed} passed` : "All passed",
  };
}

async function runLintCheck(projectRoot: string): Promise<QaCheck> {
  const cmd = await detectLintCommand(projectRoot);
  if (!cmd) {
    return { id: "lint", label: "Lint", status: "skipped", detail: "No lint config found" };
  }

  const root = expandAgentPath(projectRoot);
  const result = await runShellWithTimeout(cmd, root, LINT_TIMEOUT_MS);
  const { errors, warnings } = parseLintOutput(result.output);

  if (errors > 0) {
    return {
      id: "lint",
      label: "Lint",
      status: "fail",
      detail: `${errors} error${errors > 1 ? "s" : ""}${warnings > 0 ? `, ${warnings} warning${warnings > 1 ? "s" : ""}` : ""}`,
      fixPrompt: `Lint errors found:\n\n${result.output.slice(-2000)}\n\nFix all lint errors.`,
    };
  }

  if (warnings > 0) {
    return {
      id: "lint",
      label: "Lint",
      status: "warn",
      detail: `${warnings} warning${warnings > 1 ? "s" : ""}`,
    };
  }

  return { id: "lint", label: "Lint", status: "pass", detail: "Clean" };
}

async function runPreviewSmokeCheck(host: QaPipelineHost): Promise<QaCheck> {
  const errors = await host.requestPreviewProbe();
  if (errors === null) {
    return { id: "preview", label: "Live preview", status: "skipped", detail: "No preview active" };
  }
  if (errors.length === 0) {
    return { id: "preview", label: "Live preview", status: "pass", detail: "0 console errors" };
  }
  return {
    id: "preview",
    label: "Live preview",
    status: "fail",
    detail: `${errors.length} console error${errors.length > 1 ? "s" : ""}`,
    fixPrompt: `The live preview logged console errors:\n\n${errors.slice(0, 10).join("\n")}\n\nFix the runtime errors shown in the preview.`,
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

async function runReviewPass1(
  projectRoot: string,
  changedPaths: string[],
  host: QaPipelineHost,
): Promise<QaCheck> {
  const fileSections = await buildReviewSections(projectRoot, changedPaths);
  if (!fileSections.length) {
    return { id: "review-1", label: "Review pass 1 — correctness", status: "skipped", detail: "No files to review" };
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
    return { id: "review-1", label: "Review pass 1 — correctness", status: "pass", detail: "Clean" };
  }

  return {
    id: "review-1",
    label: "Review pass 1 — correctness",
    status: "fail",
    detail: "Findings",
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
    return { id: "review-2", label: "Review pass 2 — production", status: "skipped", detail: "No files to review" };
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
    return { id: "review-2", label: "Review pass 2 — production", status: "pass", detail: "Clean" };
  }

  return {
    id: "review-2",
    label: "Review pass 2 — production",
    status: "fail",
    detail: "Findings",
    fixPrompt: `Production readiness review found issues:\n\n${findings.slice(0, 2000)}\n\nFix the production risks identified.`,
  };
}

export async function runQaPipeline(
  runId: string,
  projectRoot: string,
  host: QaPipelineHost,
): Promise<void> {
  if (!host.getSettings().qaModeEnabled) return;

  const changedPaths = appliedPathsForRun(host.getChangeLog(), runId);
  if (!changedPaths.length || !host.isCoderRunCurrent(runId)) return;

  const pipeline: QaPipelineState = {
    runId,
    status: "running",
    checks: initialQaChecks(),
    autoFix: host.getSettings().qaAutoFix === true,
  };
  host.setPipelineState(pipeline);
  announcePipeline(host, narrateToolStart("qa-mode-enter", {}));
  host.push();

  const runStep = async (runner: () => Promise<QaCheck>): Promise<boolean> => {
    const current = host.getPipelineState();
    if (!current || current.runId !== runId || !host.isCoderRunCurrent(runId)) return false;

    const nextCheck = current.checks.find((c) => c.status === "pending");
    if (!nextCheck) return true;

    const runningCheck: QaCheck = { ...nextCheck, status: "running" };
    updateCheck(current, runningCheck, host);
    if (shouldExpandForQaCheck(runningCheck.id)) {
      host.onShellCheckStart?.();
    }
    const startNarration = qaNarrationKey(runningCheck);
    if (startNarration) announcePipeline(host, narrateToolStart(startNarration, {}));

    const result = await runner();
    const afterRun = host.getPipelineState();
    if (!afterRun || afterRun.runId !== runId) return false;

    updateCheck(afterRun, result, host);
    const narrationKey = qaNarrationKey(result);
    if (narrationKey) announcePipeline(host, narrateToolStart(narrationKey, {}));

    return result.status !== "fail";
  };

  try {
    await runStep(() => runTypesCheck(projectRoot, changedPaths));
    await runStep(() => runTestsCheck(projectRoot));
    await runStep(() => runLintCheck(projectRoot));
    await runStep(() => runPreviewSmokeCheck(host));
    await runStep(() => runReviewPass1(projectRoot, changedPaths, host));
    await runStep(() => runReviewPass2(projectRoot, changedPaths, host));

    const finalState = host.getPipelineState();
    if (!finalState || finalState.runId !== runId) return;

    const hasFail = finalState.checks.some((c) => c.status === "fail");
    const hasWarn = finalState.checks.some((c) => c.status === "warn");
    host.setPipelineState({ ...finalState, status: "done" });
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

function canQaLoopFix(host: QaPipelineHost): boolean {
  return (host.getLoopIteration() ?? 1) < CODER_LOOP_MAX_ITERATIONS;
}

function bumpQaLoop(host: QaPipelineHost): void {
  host.setLoopIteration((host.getLoopIteration() ?? 1) + 1);
}

export function triggerQaFixAll(
  runId: string,
  checks: QaCheck[],
  host: QaPipelineHost,
): boolean {
  if (!canQaLoopFix(host)) {
    announcePipeline(host, narrateToolStart("coder-loop-cap", {}));
    host.push();
    return false;
  }

  const prompt = combineQaFixPrompts(checks);
  if (!prompt.trim()) return false;

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
