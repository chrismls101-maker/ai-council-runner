import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAletheiaDisplayAwareness,
  formatAletheiaDisplayContext,
} from "../shared/aletheiaDisplayAwareness.ts";
import {
  buildAletheiaSurfaceContext,
  resolveAletheiaSurface,
  spokenTextForSurface,
} from "../shared/aletheiaSurfaceDoctrine.ts";

const displays = [
  {
    id: 1,
    label: "Primary Display",
    bounds: { x: 0, y: 0, width: 2560, height: 1600 },
    workArea: { x: 0, y: 25, width: 2560, height: 1575 },
    scaleFactor: 2,
    isPrimary: true,
    cursorInside: false,
    internal: true,
  },
  {
    id: 2,
    label: "HDMI Display (Display 2)",
    bounds: { x: 2560, y: 0, width: 3840, height: 2160 },
    workArea: { x: 2560, y: 0, width: 3840, height: 2115 },
    scaleFactor: 1,
    isPrimary: false,
    cursorInside: true,
    internal: false,
  },
];

test("buildAletheiaDisplayAwareness lists overlay and cursor displays", () => {
  const snapshot = buildAletheiaDisplayAwareness({
    connectedDisplays: displays,
    displayTarget: "all_displays",
    overlayDisplayId: 1,
    activeApp: "Cursor",
  });
  assert.ok(snapshot);
  assert.equal(snapshot!.displayCount, 2);
  assert.match(snapshot!.contextBlock, /Overlay\/chrome on: Primary Display/);
  assert.match(snapshot!.contextBlock, /Cursor is on: HDMI Display/);
  assert.ok(formatAletheiaDisplayContext(snapshot));
});

test("resolveAletheiaSurface maps companion and command bar", () => {
  assert.equal(resolveAletheiaSurface({ companionModeActive: true }), "companion");
  assert.equal(resolveAletheiaSurface({ companionModeActive: false }), "command_bar");
  assert.equal(
    resolveAletheiaSurface({ companionModeActive: false, aletheiaDashboardActive: true }),
    "dashboard",
  );
});

test("spokenTextForSurface caps strip replies shorter than companion", () => {
  const long = "word ".repeat(80).trim();
  const strip = spokenTextForSurface(long, { surface: "strip" });
  const companion = spokenTextForSurface(long, { surface: "companion" });
  assert.ok(strip.length < companion.length);
});

test("buildAletheiaSurfaceContext returns companion directive", () => {
  assert.match(buildAletheiaSurfaceContext({ surface: "companion" }), /voice companion/i);
});
