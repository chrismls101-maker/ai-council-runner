/**
 * IIVO Master QA — Vision Live only (requires IMAGE_VISION_ENABLED + provider key).
 *
 * Run: npm run qa:master:vision-live
 */

import { test } from "@playwright/test";
import { MasterQaReport } from "./masterQaReport.js";
import {
  assertEnvironmentReady,
  checkEnvironmentHealth,
  recordEnvironmentHealth,
} from "./masterQaHealth.js";
import { sectionVisionLive, setupMasterQaPage } from "./masterQaSections.js";

test.describe("IIVO Master QA — Vision Live", () => {
  test.beforeAll(() => {
    process.env.VISION_QA_LIVE = "1";
  });

  test("Vision screenshot analysis live", async ({ page }) => {
    test.setTimeout(12 * 60 * 1000);
    const report = new MasterQaReport();
    const health = await checkEnvironmentHealth();
    recordEnvironmentHealth(report, health);
    assertEnvironmentReady(health);

    if (!health.vision.configured) {
      throw new Error(
        "VISION_QA_LIVE requires IMAGE_VISION_ENABLED and a configured vision provider. Check .env and restart npm run dev.",
      );
    }

    await setupMasterQaPage(page);
    await sectionVisionLive(page, report, health.vision.configured);

    const reportPath = await report.writeJsonReport();
    report.printTerminalSummary(reportPath);

    if (report.hasFailures()) {
      throw new Error("Vision live test failed — see summary.");
    }
  });
});
