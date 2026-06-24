import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectFailureSignatures,
  computeRerunChecks,
  detectRepeatedFailures,
  extractRecoveryPlan,
  mergeChecksForRerun,
} from "../shared/glassQaRecovery.ts";
import { initialQaChecks } from "../shared/glassQaPipeline.ts";
import { resolvePackageRootForPath } from "../shared/glassQaMonorepo.ts";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("glassQaRecovery", () => {
  it("computeRerunChecks includes dependents for test failures", () => {
    const rerun = computeRerunChecks(["tests"], { previewWasRun: true });
    assert.deepEqual(rerun, ["types", "tests", "preview"]);
  });

  it("computeRerunChecks reruns lint only for lint failures", () => {
    const rerun = computeRerunChecks(["lint"]);
    assert.deepEqual(rerun, ["lint"]);
  });

  it("detectRepeatedFailures flags identical signatures", () => {
    const sigs = ["tests|auth.test.ts|44|Expected 401"];
    const result = detectRepeatedFailures(sigs, [sigs]);
    assert.equal(result.repeated, true);
  });

  it("extractRecoveryPlan surfaces structured failures", () => {
    const plan = extractRecoveryPlan([
      {
        id: "tests",
        label: "Tests",
        status: "fail",
        failures: [{
          source: "tests",
          severity: "error",
          message: "Expected 401, received 500",
          file: "auth.test.ts",
          line: 44,
        }],
      },
    ]);
    assert.match(plan[0], /auth.test.ts/);
  });

  it("mergeChecksForRerun preserves passing checks", () => {
    const merged = mergeChecksForRerun(
      initialQaChecks(),
      [{ id: "lint", label: "Lint", status: "pass", detail: "Clean" }],
      new Set(["types", "tests"]),
    );
    const lint = merged.find((c) => c.id === "lint");
    const types = merged.find((c) => c.id === "types");
    assert.equal(lint?.status, "pass");
    assert.equal(types?.status, "pending");
  });

  it("collectFailureSignatures sorts stable keys", () => {
    const sigs = collectFailureSignatures([
      { id: "tests", label: "Tests", status: "fail", detail: "1 failed" },
    ]);
    assert.equal(sigs.length, 1);
  });
});

describe("glassQaMonorepo", () => {
  it("resolvePackageRootForPath finds nearest package.json", () => {
    const root = mkdtempSync(join(tmpdir(), "glass-qa-"));
    const pkgDir = join(root, "packages", "api");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, "package.json"), "{}");
    const resolved = resolvePackageRootForPath(root, "packages/api/src/index.ts");
    assert.equal(resolved, pkgDir);
  });
});
