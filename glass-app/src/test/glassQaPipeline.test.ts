import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateLocalChecksGroup,
  combineQaFixPrompts,
  deriveQaCompletionLists,
  deriveQaShipState,
  detectLintCommandFromScripts,
  detectTestCommandFromScripts,
  initialQaChecks,
  parseLintOutput,
  parseTestOutput,
  qaHasFailures,
  qaHasHardLocalFailures,
  qaOverallStatusLabel,
  qaProgressCounters,
  reviewHasActionableFindings,
  shouldRunTestsForChanges,
} from "../shared/glassQaPipeline.ts";
import {
  parseJestFailures,
  parseTypeScriptDiagnostics,
} from "../shared/glassQaStructuredParsers.ts";

describe("glassQaPipeline shared", () => {
  it("initialQaChecks has grouped local checks", () => {
    const checks = initialQaChecks();
    assert.equal(checks.length, 7);
    assert.equal(checks[0].id, "local-checks");
  });

  it("parseTestOutput extracts pass and fail counts", () => {
    const parsed = parseTestOutput("✓ 26 tests passed\nTests: 1 failed, 25 passed");
    assert.equal(parsed.passed, 26);
    assert.equal(parsed.failed, 1);
  });

  it("parseLintOutput extracts errors and warnings", () => {
    const parsed = parseLintOutput("✖ 2 problems (1 error, 1 warning)");
    assert.equal(parsed.errors, 1);
    assert.equal(parsed.warnings, 1);
  });

  it("detectTestCommandFromScripts prefers test script", () => {
    assert.equal(detectTestCommandFromScripts({ test: "vitest run" }), "npm run test");
  });

  it("detectLintCommandFromScripts prefers lint script", () => {
    assert.equal(detectLintCommandFromScripts({ lint: "eslint ." }), "npm run lint");
  });

  it("combineQaFixPrompts merges failed check prompts", () => {
    const prompt = combineQaFixPrompts([
      { id: "types", label: "Types", status: "fail", fixPrompt: "Fix types" },
      { id: "tests", label: "Tests", status: "pass" },
    ]);
    assert.match(prompt, /Fix types/);
  });

  it("qaOverallStatusLabel reflects running state", () => {
    const checks = initialQaChecks().map((c, i) => (
      i === 1 ? { ...c, status: "running" as const } : c
    ));
    assert.equal(qaOverallStatusLabel(checks), "Running…");
  });

  it("qaHasFailures detects fail status", () => {
    assert.equal(qaHasFailures([{ id: "lint", label: "Lint", status: "fail" }]), true);
  });

  it("qaHasHardLocalFailures detects local shell failures", () => {
    assert.equal(qaHasHardLocalFailures([
      { id: "types", label: "Typecheck", status: "fail" },
    ]), true);
  });

  it("shouldRunTestsForChanges ignores docs-only edits", () => {
    assert.equal(shouldRunTestsForChanges(["README.md"]), false);
    assert.equal(shouldRunTestsForChanges(["src/auth.ts"]), true);
  });

  it("reviewHasActionableFindings ignores short clean verdicts", () => {
    assert.equal(reviewHasActionableFindings("Looks good. No issues."), false);
    assert.equal(reviewHasActionableFindings("Missing null check on line 42."), true);
  });

  it("aggregateLocalChecksGroup rolls up child status", () => {
    const checks = initialQaChecks().map((c) => {
      if (c.id === "types") return { ...c, status: "pass" as const };
      if (c.id === "tests") return { ...c, status: "fail" as const };
      if (c.id === "lint") return { ...c, status: "pass" as const };
      return c;
    });
    assert.equal(aggregateLocalChecksGroup(checks).status, "fail");
  });

  it("deriveQaShipState distinguishes warnings from ready", () => {
    const checks = initialQaChecks().map((c) => (
      c.id === "lint" ? { ...c, status: "warn" as const, detail: "3 warnings" } : { ...c, status: "pass" as const }
    ));
    assert.equal(deriveQaShipState(checks), "known-warnings");
  });

  it("deriveQaCompletionLists names warnings and skips", () => {
    const lists = deriveQaCompletionLists([
      { id: "types", label: "Typecheck", status: "pass" },
      { id: "preview", label: "Preview smoke", status: "skipped", detail: "Preview inactive", skipReason: "unavailable" },
      { id: "lint", label: "Lint", status: "warn", detail: "3 warnings" },
    ]);
    assert.equal(lists.shipState, "known-warnings");
    assert.equal(lists.warnings.length, 1);
    assert.equal(lists.skipped.length, 1);
  });

  it("qaProgressCounters summarizes pipeline state", () => {
    const counters = qaProgressCounters([
      { id: "types", label: "Typecheck", status: "pass" },
      { id: "tests", label: "Tests", status: "fail" },
      { id: "lint", label: "Lint", status: "skipped", detail: "No lint" },
    ]);
    assert.match(counters.summaryLine, /QA 3\/3/);
    assert.equal(counters.fail, 1);
  });
});

describe("glassQaStructuredParsers", () => {
  it("parseTypeScriptDiagnostics extracts file and code", () => {
    const failures = parseTypeScriptDiagnostics(
      "src/auth.ts(12,4): error TS18048: 'user' is possibly 'undefined'.",
    );
    assert.equal(failures[0]?.file, "src/auth.ts");
    assert.equal(failures[0]?.code, "TS18048");
  });

  it("parseJestFailures extracts expected and received", () => {
    const failures = parseJestFailures(`
● auth middleware rejects missing token
  expect(received).toBe(expected)
  Expected: 401
  Received: 500
  at Object.<anonymous> (src/middleware/auth.test.ts:44:11)
`);
    assert.equal(failures[0]?.expected, "401");
    assert.equal(failures[0]?.actual, "500");
  });
});
