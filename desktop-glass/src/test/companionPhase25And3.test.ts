import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeCompanionGuidance, mergeUiMaps } from "../shared/mergeCompanionUiMap.ts";
import {
  activeSegmentIndexAtTime,
  buildSegmentTimings,
  wordTimingsFromAlignment,
} from "../shared/ttsAlignment.ts";
import {
  createPresenceEngineState,
  tickPresenceEngine,
} from "../shared/companionPresenceEngine.ts";

test("mergeUiMaps prefers local ax marks over duplicate vision marks", () => {
  const local = {
    captureId: "c1",
    width: 1000,
    height: 800,
    marks: [
      {
        id: "ax-1",
        label: "Submit",
        source: "ax" as const,
        bounds: { x: 0.1, y: 0.2, w: 0.1, h: 0.05 },
      },
    ],
  };
  const remote = {
    captureId: "c1",
    width: 1000,
    height: 800,
    marks: [
      {
        id: "m1",
        label: "Submit",
        source: "vision" as const,
        bounds: { x: 0.11, y: 0.21, w: 0.09, h: 0.04 },
      },
      {
        id: "m2",
        label: "Other",
        source: "vision" as const,
        bounds: { x: 0.5, y: 0.5, w: 0.1, h: 0.1 },
      },
    ],
  };
  const merged = mergeUiMaps(local, remote);
  assert.equal(merged.marks.some((m) => m.id === "ax-1"), true);
  assert.equal(merged.marks.some((m) => m.id === "m2"), true);
  assert.equal(merged.marks.some((m) => m.id === "m1"), false);
});

test("buildSegmentTimings maps speech segments to alignment clock", () => {
  const alignment = {
    characters: "First. Second.".split(""),
    character_start_times_seconds: Array.from({ length: 14 }, (_, i) => i * 0.1),
    character_end_times_seconds: Array.from({ length: 14 }, (_, i) => (i + 1) * 0.1),
  };
  const timings = buildSegmentTimings(
    [
      { segmentIndex: 0, text: "First." },
      { segmentIndex: 1, text: "Second." },
    ],
    alignment,
  );
  assert.equal(timings.length, 2);
  assert.ok(timings[0]!.startSeconds <= timings[1]!.startSeconds);
});

test("activeSegmentIndexAtTime picks segment for playback clock", () => {
  const timings = [
    { segmentIndex: 0, startSeconds: 0, endSeconds: 1.2 },
    { segmentIndex: 1, startSeconds: 1.2, endSeconds: 2.5 },
  ];
  assert.equal(activeSegmentIndexAtTime(timings, 0.5), 0);
  assert.equal(activeSegmentIndexAtTime(timings, 1.5), 1);
});

test("presence engine updates manifestations on segment tick", () => {
  const plan = {
    captureId: "c",
    speech: [
      { segmentIndex: 0, text: "One" },
      { segmentIndex: 1, text: "Two" },
    ],
    manifestations: [
      { type: "glow" as const, targetMarkId: "m1", enterAtSegment: 0, exitAtSegment: 0 },
      { type: "callout" as const, targetMarkId: "m2", enterAtSegment: 1 },
    ],
  };
  const timings = [
    { segmentIndex: 0, startSeconds: 0, endSeconds: 1 },
    { segmentIndex: 1, startSeconds: 1, endSeconds: 2 },
  ];
  let engine = createPresenceEngineState(plan, timings);
  assert.equal(engine.activeManifestations[0]?.type, "glow");
  engine = tickPresenceEngine(engine, 1.1);
  assert.equal(engine.currentSegmentIndex, 1);
  assert.equal(engine.activeManifestations[0]?.type, "callout");
});

test("wordTimingsFromAlignment groups characters into words", () => {
  const words = wordTimingsFromAlignment({
    characters: ["H", "i", " ", "t", "h", "e", "r", "e"],
    character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
    character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
  });
  assert.deepEqual(words.map((w) => w.word), ["Hi", "there"]);
});

test("mergeCompanionGuidance combines local and remote payload", () => {
  const local = {
    captureId: "c",
    width: 100,
    height: 100,
    marks: [{ id: "dom-1", bounds: { x: 0, y: 0, w: 0.2, h: 0.2 }, source: "dom" as const }],
  };
  const remote = {
    uiMap: {
      captureId: "c",
      width: 100,
      height: 100,
      marks: [{ id: "m1", bounds: { x: 0.5, y: 0.5, w: 0.1, h: 0.1 }, source: "vision" as const }],
    },
    guidancePlan: {
      captureId: "c",
      speech: [{ segmentIndex: 0, text: "Look here." }],
      manifestations: [{ type: "glow" as const, targetMarkId: "dom-1", enterAtSegment: 0 }],
    },
  };
  const merged = mergeCompanionGuidance(local, remote);
  assert.ok(merged?.uiMap.marks.some((m) => m.id === "dom-1"));
  assert.ok(merged?.uiMap.marks.some((m) => m.id === "m1"));
});
