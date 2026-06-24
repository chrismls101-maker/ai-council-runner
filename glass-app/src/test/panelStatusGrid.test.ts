import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPanelStatusCards } from "../shared/panelStatusGrid.ts";

test("status grid includes spec labels", () => {
  const cards = buildPanelStatusCards({
    sessionStatus: null,
    sttStatus: "configured",
    sttEndpoint: "server",
    systemAudioStatus: "available",
    windowContextStatus: "available",
  });
  const labels = cards.map((c) => c.label);
  assert.deepEqual(labels, ["Server", "STT", "Capture", "Audio", "Permissions", "Session", "Screen"]);
});

test("screen context card shows captured status", () => {
  const cards = buildPanelStatusCards({
    sttStatus: "configured",
    sttEndpoint: "server",
    systemAudioStatus: "available",
    windowContextStatus: "available",
    screenContext: {
      kind: "captured",
      label: "Screen context: captured 12s ago",
      ageSeconds: 12,
    },
  });
  const screen = cards.find((c) => c.key === "screen_context");
  assert.match(screen?.status ?? "", /captured/i);
});

test("server card shows offline on network error", () => {
  const cards = buildPanelStatusCards({
    lastError: "fetch failed ECONNREFUSED",
    sttStatus: "configured",
    sttEndpoint: "server",
    systemAudioStatus: "available",
    windowContextStatus: "available",
  });
  assert.equal(cards[0].status, "Offline");
  assert.equal(cards[0].level, "error");
});

test("permissions card warns when accessibility needed", () => {
  const cards = buildPanelStatusCards({
    sttStatus: "disabled",
    sttEndpoint: "none",
    systemAudioStatus: "requires_permission",
    windowContextStatus: "permission_required",
  });
  const permissions = cards.find((c) => c.key === "permissions");
  assert.match(permissions?.status ?? "", /Accessibility/);
  assert.match(permissions?.status ?? "", /Screen Recording/);
});

test("screen context card includes visual ask diagnostics detail", () => {
  const cards = buildPanelStatusCards({
    sttStatus: "configured",
    sttEndpoint: "server",
    systemAudioStatus: "available",
    windowContextStatus: "available",
    screenContext: { kind: "ready", label: "Screen: ready" },
    visualAskPayload: {
      originalWidth: 1920,
      originalHeight: 1080,
      originalSizeBytes: 2_000_000,
      optimizedWidth: 1280,
      optimizedHeight: 720,
      optimizedSizeBytes: 900_000,
      optimizedMimeType: "image/jpeg",
      compressionApplied: true,
      status: "ok",
      qualityPreset: "text",
      visualFrameMode: "center_crop",
    },
    visualAskDiagnostics: {
      phase: "idle",
      serverResult: "success",
      userMessage: "Optimized screen image to 878.9 KB.",
    },
  });
  const screen = cards.find((c) => c.key === "screen_context");
  assert.match(screen?.detail ?? "", /text/);
  assert.match(screen?.detail ?? "", /center crop/);
});

test("session card reflects active session", () => {
  const cards = buildPanelStatusCards({
    sessionStatus: "active",
    sttStatus: "configured",
    sttEndpoint: "server",
    systemAudioStatus: "available",
    windowContextStatus: "available",
  });
  assert.equal(cards.find((c) => c.key === "session")?.status, "Active");
});
