import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveScreenCaptureStatusFromProbe,
  deriveWindowCaptureStatusFromProbe,
  mapEnumerationErrorToScreenCaptureStatus,
  SCREEN_SOURCE_ENUMERATION_USER_MESSAGE,
} from "../shared/captureSourceEnumeration.ts";

test("failed to get sources maps to source_enumeration_failed for screen", () => {
  assert.equal(
    mapEnumerationErrorToScreenCaptureStatus("Failed to get sources."),
    "source_enumeration_failed",
  );
  const derived = deriveScreenCaptureStatusFromProbe({
    kind: "screen",
    types: ["screen"],
    ok: false,
    sourceCount: 0,
    sources: [],
    errorMessage: "Failed to get sources.",
  });
  assert.equal(derived.status, "source_enumeration_failed");
  assert.match(derived.detail ?? "", new RegExp(SCREEN_SOURCE_ENUMERATION_USER_MESSAGE.slice(0, 20)));
});

test("empty thumbnail maps to permission_required", () => {
  const derived = deriveScreenCaptureStatusFromProbe({
    kind: "screen",
    types: ["screen"],
    ok: true,
    sourceCount: 1,
    sources: [{ id: "1", name: "Display 1" }],
    thumbnailEmpty: true,
  });
  assert.equal(derived.status, "permission_required");
});

test("successful screen enumeration maps to ready", () => {
  const derived = deriveScreenCaptureStatusFromProbe({
    kind: "screen",
    types: ["screen"],
    ok: true,
    sourceCount: 2,
    sources: [{ id: "1", name: "Display 1" }],
    thumbnailEmpty: false,
  });
  assert.equal(derived.status, "ready");
});

test("window enumeration failure does not use screen permission message for zero windows", () => {
  const derived = deriveWindowCaptureStatusFromProbe({
    kind: "window",
    types: ["window"],
    ok: true,
    sourceCount: 0,
    sources: [],
  });
  assert.equal(derived.status, "error");
});
