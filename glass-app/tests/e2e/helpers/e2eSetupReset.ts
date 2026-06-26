import type { Page } from "@playwright/test";

/** Full reset — listening, copilot, setup probes. Use sparingly (not every Aletheia test). */
export async function resetE2eSetupState(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.glass.closeAletheiaDashboard();
    window.glass.closeDashboard();
    window.glass.send({ type: "stop-everything" });
    window.glass.send({ type: "copilot-set-mode", mode: "off" });
    window.glass.send({ type: "session-end" });
    window.glass.send({ type: "e2e-reset-setup-state" });
    window.glass?.setOverlayPointerOverBuilderStrip?.(true);
  });
}

/**
 * Aletheia suite — close workspaces + companion only.
 * Avoids stop-everything / e2e-reset (audio teardown, setup banners, dock relayout flicker).
 */
export async function resetAletheiaE2eState(page: Page): Promise<void> {
  await page.evaluate(async () => {
    window.glass.closeAletheiaDashboard();
    window.glass.closeDashboard();
    window.glass.send({ type: "clear-last-notice" });
    window.glass.send({ type: "clear-last-error" });
    window.glass.send({
      type: "persist-consent-flags",
      flags: {
        consentMicAck: true,
        consentScreenAck: true,
        consentRecordingAck: true,
        consentTosAck: true,
      },
    });
    const state = await window.glass.getState();
    if (state.companionPrivacy?.active) {
      window.glass.send({ type: "companion-privacy-end" });
    }
    if (state.companionModeActive) {
      window.glass.send({ type: "toggle-companion-mode" });
    }
    window.glass.setBuilderStripVisible(true);
    window.glass?.setOverlayPointerOverBuilderStrip?.(true);
  });
}
