import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildConnectedDisplaySnapshots,
  formatDisplayTargetLabelFromSnapshots,
  labelForDisplay,
  normalizeDisplayTarget,
  resolveEffectiveDisplayId,
} from "../shared/displayInfo.ts";
import {
  commandBarLayoutFromDisplay,
  overlayLayoutFromDisplay,
  panelLayoutFromDisplay,
  type DisplayLayoutContext,
} from "../shared/glassLayoutMath.ts";
import { serializeDisplayTarget } from "../shared/glassSettings.ts";

const primary: DisplayLayoutContext = {
  id: 1,
  scaleFactor: 2,
  bounds: { x: 0, y: 0, width: 2560, height: 1600 },
  workArea: { x: 0, y: 25, width: 2560, height: 1575 },
};

const tv: DisplayLayoutContext = {
  id: 2,
  scaleFactor: 1,
  bounds: { x: 2560, y: 0, width: 3840, height: 2160 },
  workArea: { x: 2560, y: 0, width: 3840, height: 2115 },
};

const displayBounds = [
  { id: primary.id, bounds: primary.bounds },
  { id: tv.id, bounds: tv.bounds },
];

test("display list mapping labels primary and HDMI external", () => {
  const snapshots = buildConnectedDisplaySnapshots(
    [
      { id: primary.id, bounds: primary.bounds, workArea: primary.workArea, scaleFactor: 2, internal: true },
      { id: tv.id, bounds: tv.bounds, workArea: tv.workArea, scaleFactor: 1, internal: false },
    ],
    primary.id,
    { x: 3000, y: 400 },
  );

  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[0].label, "Primary Display");
  assert.match(snapshots[1].label, /HDMI Display/);
  assert.equal(snapshots[1].cursorInside, true);
});

test("labelForDisplay uses external and hdmi heuristics", () => {
  assert.equal(labelForDisplay({ id: 1, bounds: primary.bounds, internal: true }, 0, 1), "Primary Display");
  assert.match(
    labelForDisplay({ id: 2, bounds: tv.bounds, internal: false }, 1, 1),
    /HDMI Display \(Display 2\)/,
  );
});

test("resolveEffectiveDisplayId uses selected display id", () => {
  assert.equal(
    resolveEffectiveDisplayId(2, displayBounds, { x: 100, y: 100 }, primary.id),
    2,
  );
});

test("resolveEffectiveDisplayId follow mouse uses cursor display", () => {
  assert.equal(
    resolveEffectiveDisplayId("follow_mouse", displayBounds, { x: 3200, y: 500 }, primary.id),
    tv.id,
  );
});

test("normalizeDisplayTarget falls back when display removed", () => {
  assert.equal(normalizeDisplayTarget(99, [1, 2]), "primary");
  assert.equal(normalizeDisplayTarget(2, [1, 2]), 2);
});

test("normalizeDisplayTarget preserves all_displays with multiple monitors", () => {
  assert.equal(normalizeDisplayTarget("all_displays", [1, 2]), "all_displays");
  assert.equal(normalizeDisplayTarget("all_displays", [1]), "primary");
});

test("overlay uses selected display workArea", () => {
  const overlay = overlayLayoutFromDisplay(tv);
  assert.deepEqual(overlay, tv.workArea);
});

test("command bar centered on selected display workArea", () => {
  const bar = commandBarLayoutFromDisplay(tv);
  const center = bar.x + bar.width / 2;
  assert.equal(center, tv.workArea.x + tv.workArea.width / 2);
  assert.ok(bar.y + bar.height <= tv.workArea.y + tv.workArea.height);
});

test("panel stays within selected display workArea", () => {
  const panel = panelLayoutFromDisplay(tv);
  assert.ok(panel.x >= tv.workArea.x);
  assert.ok(panel.x + panel.width <= tv.workArea.x + tv.workArea.width);
  assert.ok(panel.y >= tv.workArea.y);
});

test("formatDisplayTargetLabelFromSnapshots resolves numeric target", () => {
  const snapshots = buildConnectedDisplaySnapshots(
    [
      { id: primary.id, bounds: primary.bounds, workArea: primary.workArea, scaleFactor: 2 },
      { id: tv.id, bounds: tv.bounds, workArea: tv.workArea, scaleFactor: 1, internal: false },
    ],
    primary.id,
    { x: 0, y: 0 },
  );
  assert.match(formatDisplayTargetLabelFromSnapshots(tv.id, snapshots), /HDMI/);
});

test("serializeDisplayTarget persists numeric display selection", () => {
  assert.equal(serializeDisplayTarget(tv.id), "2");
  assert.equal(serializeDisplayTarget("follow_mouse"), "follow_mouse");
});
