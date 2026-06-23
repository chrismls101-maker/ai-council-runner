/**
 * Glass QA Pipeline — shared types and pure helpers.
 */

export type QaCheckId = "types" | "tests" | "lint" | "preview" | "review-1" | "review-2";

export type QaCheckStatus = "pending" | "running" | "pass" | "warn" | "fail" | "skipped";

export interface QaCheck {
  id: QaCheckId;
  label: string;
  status: QaCheckStatus;
  detail?: string;
  fixPrompt?: string;
}

export type QaPipelineStatus = "idle" | "running" | "done";

export interface QaPipelineState {
  runId: string;
  status: QaPipelineStatus;
  checks: QaCheck[];
  autoFix?: boolean;
}

export function initialQaChecks(): QaCheck[] {
  return [
    { id: "types", label: "Types & build", status: "pending" },
    { id: "tests", label: "Tests", status: "pending" },
    { id: "lint", label: "Lint", status: "pending" },
    { id: "preview", label: "Live preview", status: "pending" },
    { id: "review-1", label: "Review pass 1 — correctness", status: "pending" },
    { id: "review-2", label: "Review pass 2 — production", status: "pending" },
  ];
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
    default:
      return "○";
  }
}

export function qaOverallStatusLabel(checks: QaCheck[]): string {
  if (checks.some((c) => c.status === "running")) return "Running…";
  if (checks.some((c) => c.status === "fail")) return "Issues found";
  if (checks.some((c) => c.status === "warn")) return "Warnings";
  if (checks.every((c) => c.status === "pass" || c.status === "skipped")) return "All clear";
  return "QA Pipeline";
}

export function qaHasFailures(checks: QaCheck[]): boolean {
  return checks.some((c) => c.status === "fail");
}

export function combineQaFixPrompts(checks: QaCheck[]): string {
  const parts = checks
    .filter((c) => c.status === "fail" && c.fixPrompt?.trim())
    .map((c) => `## ${c.label}\n${c.fixPrompt!.trim()}`);
  if (!parts.length) return "";
  return [
    "Glass QA Mode found issues across the pipeline. Fix all of the following in one pass:",
    "",
    ...parts,
  ].join("\n");
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
  ];
  if (cleanPhrases.some((p) => text.includes(p)) && text.length < 120) return false;
  return true;
}
