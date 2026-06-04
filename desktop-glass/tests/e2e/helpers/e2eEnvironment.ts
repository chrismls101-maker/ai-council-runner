/**
 * Electron E2E environment detection and skip reasons.
 *
 * CI runners without a GUI display cannot launch headed Electron apps.
 * This is an environment requirement, not a product limitation.
 */

export function hasGuiDisplay(): boolean {
  if (process.platform === "linux") {
    return Boolean(process.env.DISPLAY?.trim());
  }
  return true;
}

export function getElectronE2eSkipReason(): string | null {
  if (process.env.GLASS_E2E_FORCE === "1") return null;

  if (!hasGuiDisplay()) {
    return (
      "Skipped because no GUI display is available. " +
      "Set GLASS_E2E_FORCE=1 only on a runner with display access."
    );
  }

  if (process.env.CI === "true" || process.env.CI === "1") {
    if (process.env.GLASS_E2E_CI === "1") return null;
    return (
      "Skipped in CI by default (standard runners lack GUI automation). " +
      "Use GLASS_E2E_CI=1 on a Linux runner with xvfb, or GLASS_E2E_FORCE=1 on a macOS runner with display access."
    );
  }

  return null;
}

/** @deprecated Use getElectronE2eSkipReason */
export function shouldSkipElectronE2e(): string | null {
  return getElectronE2eSkipReason();
}
