import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  combineQaFixPrompts,
  detectLintCommandFromScripts,
  detectTestCommandFromScripts,
  initialQaChecks,
  parseLintOutput,
  parseTestOutput,
  qaHasFailures,
  qaOverallStatusLabel,
  reviewHasActionableFindings,
} from "../shared/glassQaPipeline.ts";

describe("glassQaPipeline shared", () => {
  it("initialQaChecks has six steps", () => {
    assert.equal(initialQaChecks().length, 6);
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
      i === 0 ? { ...c, status: "running" as const } : c
    ));
    assert.equal(qaOverallStatusLabel(checks), "Running…");
  });

  it("qaHasFailures detects fail status", () => {
    assert.equal(qaHasFailures([{ id: "lint", label: "Lint", status: "fail" }]), true);
  });

  it("reviewHasActionableFindings ignores short clean verdicts", () => {
    assert.equal(reviewHasActionableFindings("Looks good. No issues."), false);
    assert.equal(reviewHasActionableFindings("Missing null check on line 42."), true);
  });
});
