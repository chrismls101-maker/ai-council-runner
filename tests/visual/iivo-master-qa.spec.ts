/**
 * IIVO Master QA Runner v1 — end-to-end qualification (deterministic default).
 *
 * Requires: npm run dev (client :5173 + server :3001)
 *
 * Optional env:
 * - VISION_QA_LIVE=1 — live OpenAI vision section (also: npm run qa:master:vision-live)
 * - MASTER_QA_FULL=1 — heavier Decision Learning UI (future)
 * - BENCHMARK_QA_LIVE=1 — note to run full benchmark separately
 * - CONTEXT_QA_LIVE=1 — live context trace (not in default master)
 */

import { test } from "@playwright/test";
import { MasterQaReport } from "./masterQaReport.js";
import {
  assertEnvironmentReady,
  checkEnvironmentHealth,
  recordEnvironmentHealth,
} from "./masterQaHealth.js";
import { runMasterQaMonitorSections, setupMasterQaPage } from "./masterQaSections.js";
import { qaLog } from "./qaEnv.js";

test.describe("IIVO Master QA", () => {
  test("Master QA qualification flow", async ({ page }) => {
    test.setTimeout(45 * 60 * 1000);
    const report = new MasterQaReport();

    qaLog("═══ IIVO Master QA Runner v1 — starting ═══");

    const health = await checkEnvironmentHealth();
    recordEnvironmentHealth(report, health);
    assertEnvironmentReady(health);

    await setupMasterQaPage(page);

    try {
      await runMasterQaMonitorSections(page, report, health.vision.configured);
    } catch (err) {
      qaLog(`Master QA section error: ${err instanceof Error ? err.message : String(err)}`);
    }

    const reportPath = await report.writeJsonReport();
    report.printTerminalSummary(reportPath);

    if (report.hasFailures()) {
      const failed = report.failedSections().map((s) => s.label).join(", ");
      throw new Error(`Master QA NOT READY — failed: ${failed}`);
    }
  });
});
