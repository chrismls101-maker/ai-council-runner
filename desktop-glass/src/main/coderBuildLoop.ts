/**
 * Glass Build Loop — project memory, post-run verify, review, and auto-fix orchestration.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  AgentChangeLogEntry,
  AgentEvent,
  CoderReviewState,
  CoderVerifyState,
} from "../shared/ipc.ts";
import {
  buildReviewFixPrompt,
  buildVerifyFixPrompt,
  canStartLoopFix,
  CODER_LOOP_MAX_ITERATIONS,
  incrementLoopForFix,
  reviewLooksClean,
} from "../shared/coderBuildLoopShared.ts";
import { narrateToolStart } from "../shared/agentNarration.ts";
import { runAgent } from "./agentRunner.ts";
import { resolveBuildCommand } from "./agentBuildVerify.ts";
import { readFileForDiff, runShellCommand } from "./glassActions.ts";
import { askIivoGlass } from "./glassAskClient.ts";
import { expandAgentPath } from "./agentCoderTools.ts";
import type { CoderBuildLoopHost } from "../shared/coderBuildLoopHost.ts";

export {
  buildReviewFixPrompt,
  buildVerifyFixPrompt,
  canStartLoopFix,
  CODER_LOOP_MAX_ITERATIONS,
  incrementLoopForFix,
  reviewLooksClean,
};
export type { CoderBuildLoopHost };

const VERIFY_TIMEOUT_MS = 60_000;
const REVIEW_FILE_MAX = 5;
const REVIEW_SNIPPET_MAX = 4_096;

function announceBuildLoop(host: CoderBuildLoopHost, text: string): void {
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
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    let output = "";
    let settled = false;

    const finish = (ok: boolean, message?: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok, output: message ?? output.trim() });
    };

    const cancel = runShellCommand(
      `cd ${JSON.stringify(cwd)} && ${cmd} 2>&1`,
      (chunk) => { output += chunk; },
      (exitCode) => finish(exitCode === 0),
    );

    const timer = setTimeout(() => {
      cancel();
      finish(false, `Build verify timed out after ${timeoutMs / 1000}s`);
    }, timeoutMs);
  });
}

function buildProjectMemoryPrompt(projectRoot: string): string {
  return [
    `Analyze the project at: ${projectRoot}`,
    "",
    "Produce a GLASS_CONTEXT.md file for this project. It will be read by Glass Coder at the start of every run to understand the codebase without re-exploring it each time.",
    "",
    "The file must include:",
    "1. **What this project is** — one paragraph, purpose and tech stack",
    "2. **Architecture** — how the codebase is structured, key directories, data flow",
    "3. **Key files map** — the 10-20 most important files with one-line descriptions",
    "4. **Coding patterns** — conventions, how to add features, patterns to follow",
    "5. **Build & test commands** — how to build, run, and test the project",
    "6. **What's been built** — major features and their status",
    "7. **Out of scope** — things explicitly not in this project",
    "",
    "Use list_directory and read_file to explore the project. Read the README, package.json, and key source files.",
    'Write the result using write_file with filename exactly "GLASS_CONTEXT.md".',
    "Keep it under 600 lines — dense and useful, not exhaustive.",
  ].join("\n");
}

export async function generateProjectMemory(
  projectRoot: string,
  host: CoderBuildLoopHost,
  signal?: AbortSignal,
): Promise<void> {
  if (host.isAgentActive()) {
    host.setProjectMemoryState({ status: "error", error: "An agent is already running." });
    host.push();
    return;
  }

  const absRoot = expandAgentPath(projectRoot);
  host.setProjectMemoryState({ status: "generating" });
  host.push();

  const runId = `memory-${Date.now()}`;
  const prompt = buildProjectMemoryPrompt(absRoot);
  let agentError: string | undefined;

  try {
    await new Promise<void>((resolve) => {
      void runAgent({
        agentId: "code",
        prompt,
        runId,
        outputDir: absRoot,
        codeWorkspaceRoot: absRoot,
        signal,
        onEvent: (ev: AgentEvent) => {
          if (ev.runId !== runId) return;
          if (ev.kind === "done") resolve();
          if (ev.kind === "error") {
            agentError = ev.error ?? "Code Analyst failed";
            resolve();
          }
          if (ev.kind === "cancelled") {
            agentError = "Cancelled";
            resolve();
          }
        },
      }).catch((err: unknown) => {
        agentError = err instanceof Error ? err.message : String(err);
        resolve();
      });
    });

    const contextPath = join(absRoot, "GLASS_CONTEXT.md");
    if (agentError === "Cancelled") {
      host.setProjectMemoryState({ status: "idle" });
      host.setLastNotice("Project memory generation cancelled.");
    } else if (agentError) {
      host.setProjectMemoryState({ status: "error", error: agentError });
    } else if (existsSync(contextPath)) {
      host.setProjectMemoryState({ status: "done" });
      host.setLastNotice("Project memory generated — Glass Coder will use it on every run.");
    } else {
      host.setProjectMemoryState({
        status: "error",
        error: "Code Analyst finished but GLASS_CONTEXT.md was not created.",
      });
    }
  } catch (err) {
    host.setProjectMemoryState({
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
  host.push();
}

export async function runCoderVerify(
  runId: string,
  projectRoot: string,
  changedPaths: string[],
  host: CoderBuildLoopHost,
): Promise<{ pass: boolean; skipped: boolean }> {
  if (!host.isCoderRunCurrent(runId)) {
    if (host.getVerifyState()?.runId === runId) {
      host.setVerifyState(null);
      host.push();
    }
    return { pass: true, skipped: true };
  }

  if (host.getVerifyState()?.runId === runId) {
    return { pass: host.getVerifyState()?.status === "pass", skipped: false };
  }

  const anchor = pickVerifyAnchor(projectRoot, changedPaths);
  const buildCmd = await resolveBuildCommand(anchor);
  if (!buildCmd) {
    host.setVerifyState(null);
    host.push();
    return { pass: true, skipped: true };
  }

  host.setVerifyState({ status: "running", runId, command: buildCmd.cmd });
  announceBuildLoop(host, narrateToolStart("coder-verify-start", { command: buildCmd.cmd }));
  host.push();

  const { ok, output } = await runShellWithTimeout(buildCmd.cmd, buildCmd.cwd, VERIFY_TIMEOUT_MS);

  if (!host.isCoderRunCurrent(runId)) {
    if (host.getVerifyState()?.runId === runId) {
      host.setVerifyState(null);
      host.push();
    }
    return { pass: true, skipped: true };
  }

  if (ok) {
    host.setVerifyState({ status: "pass", runId, command: buildCmd.cmd });
    announceBuildLoop(host, narrateToolStart("coder-verify-pass", { command: buildCmd.cmd }));
    host.push();
    return { pass: true, skipped: false };
  }

  host.setVerifyState({
    status: "fail",
    runId,
    command: buildCmd.cmd,
    output: output.slice(0, 4000),
  });
  announceBuildLoop(host, narrateToolStart("coder-verify-fail", { command: buildCmd.cmd }));
  host.push();
  return { pass: false, skipped: false };
}

export async function runCoderReview(
  runId: string,
  projectRoot: string,
  changedPaths: string[],
  host: CoderBuildLoopHost,
): Promise<void> {
  if (!changedPaths.length || !host.isCoderRunCurrent(runId)) return;

  host.setReviewState({ status: "running", runId });
  announceBuildLoop(host, narrateToolStart("coder-review-start", {}));
  host.push();

  try {
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

    if (!fileSections.length) {
      host.setReviewState(null);
      host.push();
      return;
    }

    const reviewPrompt = [
      "You are a senior code reviewer. Glass Coder just applied changes to the following files.",
      "Review them for: bugs, type issues, missing error handling, pattern violations, or anything that could break at runtime.",
      "Be specific — name the file, line area, and what to fix.",
      "If the code looks correct, say so briefly. Do not invent problems.",
      "",
      "Files changed:",
      ...fileSections,
      "",
      "Respond in markdown. Keep it under 400 words.",
    ].join("\n");

    const response = await askIivoGlass(host.getConfig(), {
      prompt: reviewPrompt,
      modelPurpose: "default",
      responseStyle: "full",
    });

    if (!host.isCoderRunCurrent(runId)) return;

    const findings = response.answer?.trim() ?? "";
    const isClean = reviewLooksClean(findings);

    host.setReviewState({
      status: "done",
      runId,
      findings,
      fileCount: changedPaths.length,
    });
    announceBuildLoop(
      host,
      narrateToolStart(isClean ? "coder-review-clean" : "coder-review-issues", {}),
    );
    host.push();

    if (isClean) {
      setTimeout(() => {
        const current = host.getReviewState();
        if (current?.runId === runId && current.status === "done") {
          host.setReviewState({ ...current, status: "dismissed" });
          host.push();
        }
      }, 3000);
    }
  } catch (err) {
    console.warn("[coder-review] failed:", err);
    host.setReviewState(null);
    host.push();
  }
}

export async function orchestrateAfterCoderDone(
  runId: string,
  projectRoot: string,
  host: CoderBuildLoopHost,
): Promise<void> {
  const settings = host.getSettings();
  const changedPaths = appliedPathsForRun(host.getChangeLog(), runId);
  if (!changedPaths.length || !host.isCoderRunCurrent(runId)) return;

  let verifyPassed = true;
  if (settings.coderAutoVerify !== false) {
    const verify = await runCoderVerify(runId, projectRoot, changedPaths, host);
    if (verify.skipped) {
      verifyPassed = true;
    } else {
      verifyPassed = verify.pass;
      if (!verifyPassed) return;
    }
  }

  if (settings.coderAutoReview !== false && verifyPassed) {
    await runCoderReview(runId, projectRoot, changedPaths, host);
  }
}
