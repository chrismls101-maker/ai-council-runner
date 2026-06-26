import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveOverlayPanelNavigation,
  resolvePanelNavigation,
} from "../shared/panelTabRouting.ts";

test("resolvePanelNavigation maps legacy tabs to new IA", () => {
  assert.deepEqual(resolvePanelNavigation("copilot"), { panelTab: "session" });
  assert.deepEqual(resolvePanelNavigation("live-notes"), {
    panelTab: "capture",
    captureSubTab: "notes",
  });
  assert.deepEqual(resolvePanelNavigation("summary"), {
    panelTab: "capture",
    captureSubTab: "summary",
  });
  assert.deepEqual(resolvePanelNavigation("setup"), {
    panelTab: "session",
    openDashboardNav: "setup",
  });
  assert.deepEqual(resolvePanelNavigation("installations"), {
    panelTab: "session",
    openSettings: true,
    settingsSection: "components",
  });
  assert.deepEqual(resolvePanelNavigation("account"), {
    panelTab: "session",
    openSettings: true,
    settingsSection: "account",
  });
});

test("resolveOverlayPanelNavigation opens capture sub-views", () => {
  assert.deepEqual(resolveOverlayPanelNavigation("insights"), {
    panelTab: "capture",
    captureSubTab: "insights",
  });
  assert.deepEqual(resolveOverlayPanelNavigation("session"), {
    panelTab: "capture",
    captureSubTab: "timeline",
  });
});
