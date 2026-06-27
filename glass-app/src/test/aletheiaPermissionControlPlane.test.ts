import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildAletheiaPermissionControlPlane,
  canExecuteActionOnPermissionPlane,
  detectPermissionRevocations,
  permissionPlaneBlocksCompanion,
  permissionSnapshotsEqual,
} from "../shared/aletheiaPermissionControlPlane.ts";

const fullConsent = {
  micAck: true,
  screenAck: true,
  recordingAck: true,
  tosAck: true,
};

describe("buildAletheiaPermissionControlPlane", () => {
  test("full tier when mic, screen, and accessibility are ready", () => {
    const plane = buildAletheiaPermissionControlPlane({
      consent: fullConsent,
      micPermission: "granted",
      screenCaptureReady: true,
      systemAudioStatus: "available",
      accessibilityGranted: true,
    });
    assert.equal(plane.authorityTier, "full");
    assert.equal(plane.degraded, false);
  });

  test("blocks companion when mic consent missing", () => {
    const plane = buildAletheiaPermissionControlPlane({
      consent: { ...fullConsent, micAck: false },
      micPermission: "granted",
      screenCaptureReady: true,
      systemAudioStatus: "available",
      accessibilityGranted: true,
    });
    assert.ok(permissionPlaneBlocksCompanion(plane));
    assert.equal(plane.degraded, true);
  });

  test("blocks keystroke actions when accessibility missing", () => {
    const plane = buildAletheiaPermissionControlPlane({
      consent: fullConsent,
      micPermission: "granted",
      screenCaptureReady: true,
      systemAudioStatus: "available",
      accessibilityGranted: false,
    });
    const gate = canExecuteActionOnPermissionPlane("keystroke", plane);
    assert.equal(gate.ok, false);
  });
});

describe("detectPermissionRevocations", () => {
  test("detects OS mic permission revocation", () => {
    const before = buildAletheiaPermissionControlPlane({
      consent: fullConsent,
      micPermission: "granted",
      screenCaptureReady: true,
      systemAudioStatus: "available",
      accessibilityGranted: true,
    });
    const after = buildAletheiaPermissionControlPlane({
      consent: fullConsent,
      micPermission: "denied",
      screenCaptureReady: true,
      systemAudioStatus: "available",
      accessibilityGranted: true,
    });
    const events = detectPermissionRevocations(before, after);
    assert.ok(events.some((e) => e.domain === "microphone"));
    assert.match(events[0]?.narration ?? "", /lost/i);
  });
});

describe("permissionSnapshotsEqual", () => {
  test("detects domain status change", () => {
    const before = buildAletheiaPermissionControlPlane({
      consent: fullConsent,
      micPermission: "granted",
      screenCaptureReady: true,
      systemAudioStatus: "available",
      accessibilityGranted: true,
    });
    const after = buildAletheiaPermissionControlPlane({
      consent: fullConsent,
      micPermission: "denied",
      screenCaptureReady: true,
      systemAudioStatus: "available",
      accessibilityGranted: true,
    });
    assert.equal(permissionSnapshotsEqual(before, after), false);
    assert.equal(permissionSnapshotsEqual(before, before), true);
  });
});

describe("permissionPlaneBlocksCompanion", () => {
  test("blocks when plane not loaded yet", () => {
    assert.match(permissionPlaneBlocksCompanion(undefined) ?? "", /still loading/i);
  });
});
