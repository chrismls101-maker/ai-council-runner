/**
 * Runtime app identity for capture permission diagnostics (shared shapes).
 */

import { GLASS_BUNDLE_ID, GLASS_PRODUCT_NAME, glassPrivacySettingsAppLabel } from "./glassAppIdentity.ts";

export type GlassRunningMode = "packaged" | "dev";

export interface GlassAppIdentityReport {
  appName: string;
  version: string;
  isPackaged: boolean;
  runningMode: GlassRunningMode;
  defaultApp: boolean;
  execPath: string;
  exePath: string;
  appPath: string;
  resourcesPath: string;
  bundlePath?: string;
  bundleIdentifier?: string;
  expectedBundleId: string;
  privacySettingsLabel: string;
  identityOk: boolean;
  identityNotes: string[];
}

export interface DuplicateGlassAppBundle {
  path: string;
  bundleIdentifier?: string;
  modifiedAt: string;
}

export function evaluatePackagedIdentity(report: GlassAppIdentityReport): {
  identityOk: boolean;
  identityNotes: string[];
} {
  const notes: string[] = [];
  if (!report.isPackaged) {
    notes.push(
      "Running in Electron dev mode — macOS Privacy lists this binary as Electron, not IIVO Glass.",
    );
    return { identityOk: false, identityNotes: notes };
  }
  if (report.appName !== GLASS_PRODUCT_NAME) {
    notes.push(`app.getName() is "${report.appName}" (expected "${GLASS_PRODUCT_NAME}").`);
  }
  if (report.bundleIdentifier && report.bundleIdentifier !== GLASS_BUNDLE_ID) {
    notes.push(
      `Bundle id is ${report.bundleIdentifier} (expected ${GLASS_BUNDLE_ID}). TCC grants apply per bundle id.`,
    );
  } else if (!report.bundleIdentifier) {
    notes.push("Could not read CFBundleIdentifier from the running .app bundle.");
  }
  if (!report.execPath.includes("IIVO Glass.app")) {
    notes.push(`Executable path does not look like packaged IIVO Glass: ${report.execPath}`);
  }
  const identityOk =
    report.isPackaged &&
    report.appName === GLASS_PRODUCT_NAME &&
    (!report.bundleIdentifier || report.bundleIdentifier === GLASS_BUNDLE_ID);
  if (identityOk) {
    notes.push(`Packaged identity OK — look for "${glassPrivacySettingsAppLabel(true)}" in Privacy settings.`);
  }
  return { identityOk, identityNotes: notes };
}
