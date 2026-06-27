import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildAletheiaObservationSnapshot,
  observationSnapshotsEqual,
  observationSnapshotPersistKey,
} from "../shared/aletheiaObservationSignals.ts";
import { buildAletheiaPermissionControlPlane as buildPlane } from "../shared/aletheiaPermissionControlPlane.ts";

const fullConsent = {
  micAck: true,
  screenAck: true,
  recordingAck: true,
  tosAck: true,
};

function fullPermissionPlane() {
  return buildPlane({
    consent: fullConsent,
    micPermission: "granted",
    screenCaptureReady: true,
    systemAudioStatus: "available",
    accessibilityGranted: true,
  });
}

describe("buildAletheiaObservationSnapshot", () => {
  test("idle when no signals are active", () => {
    const snapshot = buildAletheiaObservationSnapshot({
      companionModeActive: false,
      companionPrivacyActive: false,
      micListening: false,
      micCapturing: false,
      companionMicActive: false,
      screenCaptureReady: false,
      screenDigestFresh: false,
      screenDigestAgeMs: null,
      clipboardMonitored: false,
      clipboardHasContent: false,
      permissionPlane: fullPermissionPlane(),
      sessionId: null,
    });
    assert.equal(snapshot.mode, "idle");
    assert.equal(snapshot.signals.find((row) => row.id === "clipboard")?.status, "off");
  });

  test("idle when only clipboard monitoring is armed without content or screen loop", () => {
    const snapshot = buildAletheiaObservationSnapshot({
      companionModeActive: false,
      companionPrivacyActive: false,
      micListening: false,
      micCapturing: false,
      companionMicActive: false,
      screenCaptureReady: false,
      screenDigestFresh: false,
      screenDigestAgeMs: null,
      clipboardMonitored: true,
      clipboardHasContent: false,
      permissionPlane: fullPermissionPlane(),
      sessionId: null,
    });
    assert.equal(snapshot.mode, "idle");
    assert.equal(snapshot.signals.find((row) => row.id === "clipboard")?.status, "idle");
  });

  test("passive when screen digest is fresh without companion", () => {
    const snapshot = buildAletheiaObservationSnapshot({
      companionModeActive: false,
      companionPrivacyActive: false,
      micListening: false,
      micCapturing: false,
      companionMicActive: false,
      screenCaptureReady: true,
      screenDigestFresh: true,
      screenDigestAgeMs: 4_000,
      clipboardMonitored: true,
      clipboardHasContent: false,
      permissionPlane: fullPermissionPlane(),
      sessionId: null,
    });
    assert.equal(snapshot.mode, "passive");
    assert.equal(snapshot.signals.find((row) => row.id === "screen")?.status, "active");
    assert.match(snapshot.engagementNote, /Passive sensing/i);
  });

  test("companion_active when companion mic is live", () => {
    const snapshot = buildAletheiaObservationSnapshot({
      companionModeActive: true,
      companionPrivacyActive: false,
      micListening: false,
      micCapturing: false,
      companionMicActive: true,
      screenCaptureReady: true,
      screenDigestFresh: false,
      screenDigestAgeMs: null,
      clipboardMonitored: true,
      clipboardHasContent: true,
      permissionPlane: fullPermissionPlane(),
      sessionId: "session-123",
      sessionSnapshotCount: 2,
    });
    assert.equal(snapshot.mode, "companion_active");
    assert.equal(snapshot.signals.find((row) => row.id === "microphone")?.status, "active");
    assert.match(snapshot.engagementNote, /not passive observation/i);
    assert.equal(snapshot.sessionSnapshotCount, 2);
  });

  test("clipboard active signal notes truncation", () => {
    const snapshot = buildAletheiaObservationSnapshot({
      companionModeActive: true,
      companionPrivacyActive: false,
      micListening: false,
      micCapturing: false,
      companionMicActive: true,
      screenCaptureReady: true,
      screenDigestFresh: false,
      screenDigestAgeMs: null,
      clipboardMonitored: true,
      clipboardHasContent: true,
      clipboardTruncated: true,
      permissionPlane: fullPermissionPlane(),
      sessionId: "session-123",
    });
    const clipboard = snapshot.signals.find((row) => row.id === "clipboard");
    assert.equal(clipboard?.status, "active");
    assert.match(clipboard?.detail ?? "", /truncated/i);
  });

  test("companion_privacy overrides companion_active", () => {
    const snapshot = buildAletheiaObservationSnapshot({
      companionModeActive: true,
      companionPrivacyActive: true,
      micListening: false,
      micCapturing: false,
      companionMicActive: false,
      screenCaptureReady: true,
      screenDigestFresh: true,
      screenDigestAgeMs: 1_000,
      clipboardMonitored: true,
      clipboardHasContent: false,
      permissionPlane: fullPermissionPlane(),
      sessionId: "session-123",
    });
    assert.equal(snapshot.mode, "companion_privacy");
  });

  test("microphone blocked when mic consent missing", () => {
    const plane = buildPlane({
      consent: { ...fullConsent, micAck: false },
      micPermission: "granted",
      screenCaptureReady: true,
      systemAudioStatus: "available",
      accessibilityGranted: true,
    });
    const snapshot = buildAletheiaObservationSnapshot({
      companionModeActive: false,
      companionPrivacyActive: false,
      micListening: false,
      micCapturing: false,
      companionMicActive: false,
      screenCaptureReady: true,
      screenDigestFresh: false,
      screenDigestAgeMs: null,
      clipboardMonitored: true,
      clipboardHasContent: false,
      permissionPlane: plane,
      sessionId: null,
    });
    assert.equal(snapshot.signals.find((row) => row.id === "microphone")?.status, "blocked");
  });

  test("screen blocked when capture not ready", () => {
    const snapshot = buildAletheiaObservationSnapshot({
      companionModeActive: false,
      companionPrivacyActive: false,
      micListening: false,
      micCapturing: false,
      companionMicActive: false,
      screenCaptureReady: false,
      screenDigestFresh: false,
      screenDigestAgeMs: null,
      clipboardMonitored: true,
      clipboardHasContent: false,
      permissionPlane: fullPermissionPlane(),
      sessionId: null,
    });
    assert.equal(snapshot.signals.find((row) => row.id === "screen")?.status, "blocked");
  });
});

describe("observationSnapshotsEqual", () => {
  test("detects signal status change", () => {
    const base = buildAletheiaObservationSnapshot({
      companionModeActive: false,
      companionPrivacyActive: false,
      micListening: false,
      micCapturing: false,
      companionMicActive: false,
      screenCaptureReady: true,
      screenDigestFresh: false,
      screenDigestAgeMs: null,
      clipboardMonitored: true,
      clipboardHasContent: false,
      permissionPlane: fullPermissionPlane(),
      sessionId: null,
    });
    const changed = buildAletheiaObservationSnapshot({
      companionModeActive: false,
      companionPrivacyActive: false,
      micListening: false,
      micCapturing: false,
      companionMicActive: false,
      screenCaptureReady: true,
      screenDigestFresh: true,
      screenDigestAgeMs: 500,
      clipboardMonitored: true,
      clipboardHasContent: false,
      permissionPlane: fullPermissionPlane(),
      sessionId: null,
    });
    assert.equal(observationSnapshotsEqual(base, base), true);
    assert.equal(observationSnapshotsEqual(base, changed), false);
  });
});

describe("observationSnapshotPersistKey", () => {
  test("stable key from mode and signal statuses", () => {
    const snapshot = buildAletheiaObservationSnapshot({
      companionModeActive: false,
      companionPrivacyActive: false,
      micListening: false,
      micCapturing: false,
      companionMicActive: false,
      screenCaptureReady: true,
      screenDigestFresh: true,
      screenDigestAgeMs: 100,
      clipboardMonitored: true,
      clipboardHasContent: true,
      permissionPlane: fullPermissionPlane(),
      sessionId: null,
    });
    assert.match(observationSnapshotPersistKey(snapshot), /^passive:/);
  });
});
