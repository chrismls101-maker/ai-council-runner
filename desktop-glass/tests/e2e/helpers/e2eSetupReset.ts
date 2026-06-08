import type { Page } from "@playwright/test";

/** Reset session, copilot, and injected setup state between E2E tests. */
export async function resetE2eSetupState(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.glass.send({ type: "stop-everything" });
    window.glass.send({ type: "copilot-set-mode", mode: "off" });
    window.glass.send({ type: "session-end" });
    window.glass.send({ type: "e2e-reset-setup-state" });
  });
}
