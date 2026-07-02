/**
 * Unit tests for Live Orientation types and memory proficiency FSM.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyL3Adaptations,
  deriveOrientationActions,
  enrichOrientationRegion,
  filterRegionsForSession,
  fractionBoundsToScreenPx,
  parseOrientationL2Json,
  parseOrientationRegionsJson,
  shouldTriggerOrientation,
  ORIENTATION_LONG_ABSENCE_MS,
} from "../shared/liveOrientationTypes.ts";
import {
  applyRegionActionConfirmed,
  applyRegionPresented,
  applySessionComplete,
  defaultAppProficiencyProfile,
} from "../shared/liveOrientationProficiency.ts";

describe("liveOrientationTypes", () => {
  it("converts fractional bounds to screen pixels", () => {
    const px = fractionBoundsToScreenPx(
      { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      { x: 0, y: 0, width: 1000, height: 800 },
    );
    assert.equal(px.x, 100);
    assert.equal(px.y, 160);
    assert.equal(px.width, 300);
    assert.equal(px.height, 320);
  });

  it("derives L4 actions by region role", () => {
    assert.equal(deriveOrientationActions("navigation")[0]?.op, "navigate_to");
    assert.equal(deriveOrientationActions("action")[0]?.op, "demonstrate");
    assert.equal(deriveOrientationActions("content")[0]?.op, "open_in_glass");
    assert.equal(deriveOrientationActions("settings")[0]?.op, "skip");
  });

  it("parses vision region JSON", () => {
    const regions = parseOrientationRegionsJson([
      {
        id: "sidebar",
        label: "Sidebar",
        bounds: { x: 0, y: 0, width: 0.2, height: 1 },
        priority: 1,
        role: "navigation",
        l1: "Main navigation.",
      },
    ]);
    assert.equal(regions.length, 1);
    assert.equal(regions[0]?.id, "sidebar");
    assert.equal(regions[0]?.l4[0]?.op, "navigate_to");
  });

  it("parses L2 workflow guidance", () => {
    const found = parseOrientationL2Json({ found: true, guidance: "Use templates instead." });
    assert.equal(found.found, true);
    assert.equal(found.guidance, "Use templates instead.");
    const none = parseOrientationL2Json({ found: false });
    assert.equal(none.found, false);
  });

  it("applies L3 priority adaptations", () => {
    const regions = enrichOrientationRegion({
      id: "a",
      label: "A",
      bounds: { x: 0, y: 0, width: 0.1, height: 0.1 },
      priority: 2,
      role: "content",
      l1: "A region",
    });
    const b = enrichOrientationRegion({
      id: "b",
      label: "B",
      bounds: { x: 0.2, y: 0, width: 0.1, height: 0.1 },
      priority: 1,
      role: "content",
      l1: "B region",
    });
    assert.ok(regions && b);
    const adapted = applyL3Adaptations([regions, b], [
      { regionId: "a", priority: 0, l3Note: "Important for your role." },
    ]);
    assert.equal(adapted[0]?.id, "a");
    assert.equal(adapted[0]?.l3, "Important for your role.");
  });

  it("trigger rules fire for new app and long absence", () => {
    const now = Date.now();
    assert.equal(shouldTriggerOrientation({ profile: null, now, currentVersion: null }).reason, "new_app");
    const profile = defaultAppProficiencyProfile("com.notion", "Notion", now - ORIENTATION_LONG_ABSENCE_MS - 1);
    profile.sessionCount = 10;
    assert.equal(
      shouldTriggerOrientation({ profile, now, currentVersion: "1.0" }).reason,
      "long_absence",
    );
  });

  it("filters resurfaced never-touched regions back into session", () => {
    const regions = parseOrientationRegionsJson([
      {
        id: "sidebar",
        label: "Sidebar",
        bounds: { x: 0, y: 0, width: 0.2, height: 1 },
        priority: 1,
        role: "navigation",
        l1: "Main navigation.",
      },
      {
        id: "toolbar",
        label: "Toolbar",
        bounds: { x: 0.2, y: 0, width: 0.8, height: 0.1 },
        priority: 2,
        role: "action",
        l1: "Toolbar actions.",
      },
    ]);
    const profile = defaultAppProficiencyProfile("com.notion", "Notion");
    profile.knownRegions = ["sidebar", "toolbar"];
    profile.neverTouchedRegions = ["sidebar"];
    profile.masteredRegions = ["toolbar"];
    const filtered = filterRegionsForSession(regions, profile, {
      forceIncludeRegionIds: ["sidebar"],
    });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.id, "sidebar");
  });
});

describe("liveOrientationProficiency", () => {
  it("transitions region presented → familiar → mastered", () => {
    let profile = defaultAppProficiencyProfile("com.test.app", "TestApp");
    profile = applyRegionPresented(profile, "toolbar");
    let result = applyRegionActionConfirmed(profile, "toolbar");
    assert.equal(result.level, "familiar");
    result = applyRegionActionConfirmed(result.profile, "toolbar");
    result = applyRegionActionConfirmed(result.profile, "toolbar");
    assert.equal(result.level, "mastered");
    assert.ok(result.profile.masteredRegions.includes("toolbar"));
  });

  it("records session completion with goal history", () => {
    const profile = defaultAppProficiencyProfile("com.figma", "Figma");
    const completed = applySessionComplete(
      profile,
      ["layers", "toolbar"],
      "Finish the Q3 report mockup",
      "2.0.0",
    );
    assert.equal(completed.sessionCount, 1);
    // Being presented never suppresses a region — it stays out of knownRegions
    // (familiar) until the user actually interacts with it.
    assert.ok(!completed.knownRegions.includes("layers"));
    assert.ok(completed.presentedRegions?.includes("layers"));
    assert.ok(completed.neverTouchedRegions.includes("layers"));
    assert.ok(completed.goalHistory.includes("Finish the Q3 report mockup"));
    assert.equal(completed.lastAppVersion, "2.0.0");
  });

  it("presentation alone never adds to knownRegions", () => {
    let profile = defaultAppProficiencyProfile("com.test.app", "TestApp");
    profile = applyRegionPresented(profile, "automations");
    assert.ok(!profile.knownRegions.includes("automations"));
    assert.ok(profile.presentedRegions?.includes("automations"));
    assert.ok(profile.neverTouchedRegions.includes("automations"));
    // Only a confirmed interaction advances to familiar and clears neverTouched.
    const result = applyRegionActionConfirmed(profile, "automations");
    assert.equal(result.level, "familiar");
    assert.ok(result.profile.knownRegions.includes("automations"));
    assert.ok(!result.profile.neverTouchedRegions.includes("automations"));
  });
});
