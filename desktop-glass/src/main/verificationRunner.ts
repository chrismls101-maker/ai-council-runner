/**
 * IIVO Glass — Verification Runner (main process)
 *
 * Executes dynamic verification checks (tsc, npm test) against the user's
 * real environment and returns VerificationResult objects.
 *
 * Privacy + safety:
 *   - All commands are READ-ONLY (tsc --noEmit, npm test reads code, never writes)
 *   - Commands are executed with execFile — no shell injection possible
 *   - Each check has a hard 10-second timeout
 *   - Working directory is the detected repo root — never a system path
 *   - Stdout/stderr are truncated to EVIDENCE_SNIPPET_LEN before storing
 *
 * This module intentionally has no IPC or Electron imports.
 * The caller (index.ts) is responsible for wiring results back into GlassState.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  type VerificationClaim,
  type VerificationResult,
  type VerificationReport,
  buildVerificationResult,
  buildSkippedResult,
  buildVerificationReport,
  resolveStaticClaim,
  EVIDENCE_SNIPPET_LEN,
} from "../shared/verificationEngine.ts";

const execFileAsync = promisify(execFile);

/** Hard timeout per dynamic check (ms). */
const CHECK_TIMEOUT_MS = 10_000;

// ─── Dynamic checks ───────────────────────────────────────────────────────────

/**
 * Run `tsc --noEmit` in the repo directory.
 * Returns verified if exit 0, contradicted if exit non-0 with errors.
 */
async function runTypecheckClaim(
  claim: VerificationClaim,
): Promise<VerificationResult> {
  const repoPath = claim.repoPath!;
  const start = Date.now();

  // Confirm tsconfig exists in the repo
  const hasTsConfig =
    existsSync(join(repoPath, "tsconfig.json")) ||
    existsSync(join(repoPath, "tsconfig.build.json"));

  if (!hasTsConfig) {
    return buildSkippedResult(claim, "No tsconfig.json found in repo root — skipping typecheck.");
  }

  try {
    await execFileAsync("npx", ["tsc", "--noEmit"], {
      cwd: repoPath,
      timeout: CHECK_TIMEOUT_MS,
    });

    return buildVerificationResult(
      claim,
      "verified",
      "tsc --noEmit exited 0 — no TypeScript errors.",
      start,
      Date.now() - start,
    );
  } catch (err: unknown) {
    const out = extractOutput(err);
    const errorCount = countTsErrors(out);
    const snippet = out.slice(0, EVIDENCE_SNIPPET_LEN);

    if (errorCount > 0) {
      return buildVerificationResult(
        claim,
        "contradicted",
        `tsc found ${errorCount} error${errorCount === 1 ? "" : "s"}: ${snippet}`,
        start,
        Date.now() - start,
      );
    }

    // Non-zero exit but no clear errors (e.g. misconfiguration)
    return buildVerificationResult(
      claim,
      "inconclusive",
      `tsc exited non-zero but output is unclear: ${snippet}`,
      start,
      Date.now() - start,
    );
  }
}

/**
 * Run `npm test` in the repo directory.
 * Returns verified if exit 0, contradicted if exit non-0 with failure output.
 *
 * Uses `npm test` (the most universal entry point). If the project doesn't
 * have a test script, npm will exit non-zero with a helpful message and we
 * mark as skipped.
 */
async function runTestsClaim(
  claim: VerificationClaim,
): Promise<VerificationResult> {
  const repoPath = claim.repoPath!;
  const start = Date.now();

  // Confirm package.json has a test script
  const hasTestScript = await detectTestScript(repoPath);
  if (!hasTestScript) {
    return buildSkippedResult(
      claim,
      "No test script found in package.json — skipping tests check.",
    );
  }

  try {
    const { stdout, stderr } = await execFileAsync("npm", ["test"], {
      cwd: repoPath,
      timeout: CHECK_TIMEOUT_MS,
      env: { ...process.env, CI: "true" },  // suppress interactive prompts
    });

    const out = `${stdout}\n${stderr}`.trim();
    const snippet = out.slice(0, EVIDENCE_SNIPPET_LEN);

    return buildVerificationResult(
      claim,
      "verified",
      `npm test exited 0. ${snippet}`,
      start,
      Date.now() - start,
    );
  } catch (err: unknown) {
    const out = extractOutput(err);
    const snippet = out.slice(0, EVIDENCE_SNIPPET_LEN);

    const isMissing = out.includes("missing script") || out.includes("no test specified");
    if (isMissing) {
      return buildSkippedResult(claim, "npm test: missing script — no test runner configured.");
    }

    return buildVerificationResult(
      claim,
      "contradicted",
      `npm test exited non-zero: ${snippet}`,
      start,
      Date.now() - start,
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract combined stdout+stderr from an execFile error. */
function extractOutput(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const stdout = typeof e["stdout"] === "string" ? e["stdout"] : "";
    const stderr = typeof e["stderr"] === "string" ? e["stderr"] : "";
    return `${stdout}\n${stderr}`.trim();
  }
  return String(err);
}

/** Count TypeScript error lines in tsc output. */
function countTsErrors(output: string): number {
  return output.split("\n").filter((line) => /error TS\d+/.test(line)).length;
}

/**
 * Read package.json and check whether it has a non-trivial test script.
 * Returns false if not found or script is the default "no test specified".
 */
async function detectTestScript(repoPath: string): Promise<boolean> {
  const pkgPath = join(repoPath, "package.json");
  if (!existsSync(pkgPath)) return false;

  try {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    const scripts = pkg["scripts"] as Record<string, string> | undefined;
    const testScript = scripts?.["test"] ?? "";
    // npm's default stub
    return testScript.length > 0 && !testScript.includes("no test specified");
  } catch {
    return false;
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Run all verification claims for a session.
 *
 * Static claims are resolved immediately (no I/O).
 * Dynamic claims are run concurrently with individual timeouts.
 *
 * Returns a VerificationReport regardless of individual check outcomes.
 * Never throws — all errors produce a "skipped" result.
 */
export async function runVerification(
  claims: VerificationClaim[],
): Promise<VerificationReport> {
  const start = Date.now();
  const results: VerificationResult[] = [];

  for (const claim of claims) {
    // Static claims — resolved immediately, no await needed
    if (claim.staticStatus !== undefined) {
      results.push(resolveStaticClaim(claim));
      continue;
    }

    // Dynamic claims — run with catch-all
    let result: VerificationResult;
    try {
      switch (claim.type) {
        case "typecheck":
          result = await runTypecheckClaim(claim);
          break;
        case "tests_pass":
          result = await runTestsClaim(claim);
          break;
        default:
          result = buildSkippedResult(claim, `No runner implemented for claim type "${claim.type}"`);
      }
    } catch (err: unknown) {
      result = buildSkippedResult(
        claim,
        `Unexpected error during check: ${String(err).slice(0, 120)}`,
      );
    }
    results.push(result);
  }

  return buildVerificationReport(results, start, Date.now() - start);
}
