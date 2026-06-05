/**
 * macOS app identity: packaged IIVO Glass vs Electron dev (`npm run glass:dev`).
 * TCC (Screen Recording, Microphone, etc.) keys off the app bundle id, not app.setName().
 */

export const GLASS_BUNDLE_ID = "com.iivo.glass";
export const GLASS_PRODUCT_NAME = "IIVO Glass";

export function glassMenuAppName(isPackaged: boolean): string {
  return isPackaged ? GLASS_PRODUCT_NAME : `${GLASS_PRODUCT_NAME} (Dev)`;
}

/** Shown in Setup / docs when explaining Privacy & Security list entries. */
export function glassPrivacySettingsAppLabel(isPackaged: boolean): string {
  return isPackaged
    ? GLASS_PRODUCT_NAME
    : "Electron (dev — use packaged IIVO Glass for permissions)";
}

export const GLASS_DEV_PERMISSIONS_HINT =
  "npm run glass:dev runs the stock Electron binary. macOS Privacy lists it as Electron, not IIVO Glass. Build and open the packaged app for stable permission entries.";
