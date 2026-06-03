/**
 * Guards Daily Driver runner against stale submit helper references.
 * Runtime ReferenceError is not caught by tsc when the call site uses an unimported name
 * only if checks are skipped — this test reads the runner source directly.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

const runnerPath = join(dirname(fileURLToPath(import.meta.url)), "dailyDriverRunner.ts");

test.describe("Daily Driver runner imports", () => {
  test("runPromptScenario uses submitComposerPromptRobust, not stale submitComposerPrompt", () => {
    const src = readFileSync(runnerPath, "utf8");
    expect(src).toContain("submitComposerPromptRobust");
    expect(src).toMatch(/import\s*\{[^}]*submitComposerPromptRobust[^}]*\}\s*from\s*["']\.\/qaStepHelpers/);
    expect(src).not.toMatch(/\bsubmitComposerPrompt\s*\(/);
  });

  test("runPromptScenario uses waitForRunComplete from runWaitHelpers", () => {
    const src = readFileSync(runnerPath, "utf8");
    expect(src).toContain("waitForRunComplete");
    expect(src).toMatch(/import\s*\{[^}]*waitForRunComplete[^}]*\}\s*from\s*["']\.\/runWaitHelpers/);
    expect(src).not.toMatch(/\bwaitForRunActivityOrComplete\s*\(/);
  });
});
