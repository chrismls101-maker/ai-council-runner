import type { Page } from "@playwright/test";

/** Reset injected setup/probe state between E2E tests (IIVO_GLASS_E2E only). */
export async function resetE2eSetupState(page: Page): Promise<void> {
  await page.evaluate(() => window.glass.send({ type: "e2e-reset-setup-state" }));
}
