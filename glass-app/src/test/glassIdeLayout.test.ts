import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampGlassIdeEditorSplitRatio,
  clampGlassIdeStreamWidthPx,
  clampGlassIdeTreeWidthPx,
  GLASS_IDE_TERMINAL_COLLAPSED_CHROME_PX,
  GLASS_IDE_TERMINAL_COLLAPSE_SNAP_PX,
  clampGlassIdeEditorRatioForTerminalExpand,
  defaultGlassIdeTerminalExpandedEditorRatio,
  resolveGlassIdeLayout,
} from "../shared/glassIdeLayout.ts";

test("clampGlassIdeTreeWidthPx enforces bounds", () => {
  assert.equal(clampGlassIdeTreeWidthPx(50), 140);
  assert.equal(clampGlassIdeTreeWidthPx(300), 300);
});

test("resolveGlassIdeLayout applies defaults", () => {
  const layout = resolveGlassIdeLayout({});
  assert.equal(layout.glassIdeTreeWidthPx, 220);
  assert.equal(layout.glassIdeStreamWidthPx, 380);
  assert.equal(layout.glassIdeEditorSplitRatio, 0.62);
});

test("clampGlassIdeEditorRatioForTerminalExpand caps terminal height on expand", () => {
  assert.equal(clampGlassIdeEditorRatioForTerminalExpand(0.72), 0.65);
  assert.equal(clampGlassIdeEditorRatioForTerminalExpand(0.35), 0.62);
  assert.equal(defaultGlassIdeTerminalExpandedEditorRatio(), 0.62);
});

test("clampGlassIdeEditorSplitRatio enforces bounds", () => {
  assert.equal(clampGlassIdeEditorSplitRatio(0.1), 0.35);
  assert.equal(clampGlassIdeEditorSplitRatio(0.7), 0.7);
});

test("clampGlassIdeStreamWidthPx enforces bounds", () => {
  assert.equal(clampGlassIdeStreamWidthPx(100), 280);
  assert.equal(clampGlassIdeStreamWidthPx(900), 720);
});

test("IDE terminal collapsed chrome is shorter than collapse snap", () => {
  assert.ok(GLASS_IDE_TERMINAL_COLLAPSED_CHROME_PX < GLASS_IDE_TERMINAL_COLLAPSE_SNAP_PX);
});
