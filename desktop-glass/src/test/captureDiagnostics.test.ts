import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCaptureDiagnosticsReport,
  buildSuggestedNextAction,
  guessScreenRecordingStatus,
  guessSystemAudioStatus,
} from "../shared/captureDiagnostics.ts";
import { evaluatePackagedIdentity } from "../shared/glassAppIdentityReport.ts";
import type { GlassAppIdentityReport } from "../shared/glassAppIdentityReport.ts";

const packagedIdentity: GlassAppIdentityReport = {
  appName: "IIVO Glass",
  version: "0.1.0",
  isPackaged: true,
  runningMode: "packaged",
  packagingVariant: "applications",
  packagingVariantLabel: "Installed (/Applications)",
  defaultApp: false,
  execPath: "/Applications/IIVO Glass.app/Contents/MacOS/IIVO Glass",
  exePath: "/Applications/IIVO Glass.app/Contents/MacOS/IIVO Glass",
  appPath: "/Applications/IIVO Glass.app/Contents/Resources/app.asar",
  resourcesPath: "/Applications/IIVO Glass.app/Contents/Resources",
  bundlePath: "/Applications/IIVO Glass.app",
  bundleIdentifier: "com.iivo.glass",
  expectedBundleId: "com.iivo.glass",
  privacySettingsLabel: "IIVO Glass",
  identityOk: false,
  identityNotes: [],
};

test("packaged com.iivo.glass identity evaluates OK", () => {
  const evaluated = evaluatePackagedIdentity(packagedIdentity);
  assert.equal(evaluated.identityOk, true);
});

test("diagnostic report includes app path and probe lines", () => {
  const report = buildCaptureDiagnosticsReport({
    generatedAt: new Date().toISOString(),
    runningMode: "packaged",
    appIdentity: { ...packagedIdentity, ...evaluatePackagedIdentity(packagedIdentity) },
    selectedDisplayId: 1,
    probes: [
      {
        kind: "screen",
        types: ["screen"],
        ok: true,
        sourceCount: 1,
        sources: [{ id: "s1", name: "Screen 1" }],
      },
    ],
    screenCaptureProbe: "ready",
    windowCaptureProbe: "ready",
    systemAudioStatus: "source_enumeration_failed",
    systemAudioDetail: "Failed to get sources.",
    screenRecordingGuess: "ok",
    systemAudioGuess: "Screen capture works",
    suggestedNextAction: "Retry system audio",
    duplicateAppBundles: [],
  });
  assert.match(report.lines.join("\n"), /Exec:/);
  assert.match(report.lines.join("\n"), /screen: pass/);
  assert.match(report.lines.join("\n"), /Screen Capture: ready/);
});

test("screen ready + system audio fail suggests separate next action", () => {
  const action = buildSuggestedNextAction({
    screenProbe: "ready",
    windowProbe: "ready",
    systemStatus: "source_enumeration_failed",
    identityOk: true,
    isPackaged: true,
    screenEnumFailed: false,
  });
  assert.match(action, /Screen Recording is OK/i);
});

test("screen enumeration failed suggests tcc reset steps", () => {
  const action = buildSuggestedNextAction({
    screenProbe: "source_enumeration_failed",
    windowProbe: "source_enumeration_failed",
    systemStatus: "source_enumeration_failed",
    identityOk: true,
    isPackaged: true,
    screenEnumFailed: true,
  });
  assert.match(action, /tccutil reset ScreenCapture/i);
});

test("guessScreenRecordingStatus names failed to get sources", () => {
  const guess = guessScreenRecordingStatus("source_enumeration_failed", {
    kind: "screen",
    types: ["screen"],
    ok: false,
    sourceCount: 0,
    sources: [],
    errorMessage: "Failed to get sources.",
  });
  assert.match(guess, /failed to get sources/i);
});

test("guessSystemAudioStatus when screen ready and audio enum failed", () => {
  const guess = guessSystemAudioStatus("source_enumeration_failed", true);
  assert.match(guess, /Screen capture works/i);
});
