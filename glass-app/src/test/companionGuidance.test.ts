import { test } from "node:test";
import assert from "node:assert/strict";
import {
  companionSpeechFromGuidance,
  extractCompanionFence,
  findUiMark,
  initialManifestations,
  parseCompanionGuidancePayload,
  resolveMarkToScreenRect,
  stripCompanionFence,
} from "../shared/companionGuidance.ts";

const SAMPLE = `\`\`\`companion
{
  "uiMap": {
    "captureId": "cap-1",
    "width": 1920,
    "height": 1080,
    "marks": [
      { "id": "m1", "label": "Error line", "source": "vision", "bounds": { "x": 0.1, "y": 0.2, "w": 0.5, "h": 0.04 } }
    ]
  },
  "guidancePlan": {
    "captureId": "cap-1",
    "speech": [
      { "segmentIndex": 0, "text": "This error line is the problem." }
    ],
    "manifestations": [
      { "type": "glow", "targetMarkId": "m1", "enterAtSegment": 0, "exitAtSegment": 0 }
    ]
  }
}
\`\`\``;

test("extractCompanionFence parses fenced JSON", () => {
  const payload = extractCompanionFence(`Answer text\n\n${SAMPLE}`);
  assert.ok(payload);
  assert.equal(payload?.uiMap.marks[0]?.id, "m1");
  assert.equal(payload?.guidancePlan.speech[0]?.text, "This error line is the problem.");
});

test("stripCompanionFence removes companion block", () => {
  const stripped = stripCompanionFence(`Visible answer\n\n${SAMPLE}`);
  assert.equal(stripped, "Visible answer");
});

test("resolveMarkToScreenRect maps normalized bounds to pixels", () => {
  const mark = {
    id: "m1",
    bounds: { x: 0.1, y: 0.2, w: 0.5, h: 0.1 },
    source: "vision" as const,
  };
  const rect = resolveMarkToScreenRect(mark, { width: 1000, height: 800 });
  assert.equal(rect.left, 100);
  assert.equal(rect.top, 160);
  assert.equal(rect.width, 500);
  assert.equal(rect.height, 80);
});

test("initialManifestations returns segment-0 manifestations", () => {
  const payload = parseCompanionGuidancePayload(
    {
      uiMap: {
        captureId: "c",
        width: 100,
        height: 100,
        marks: [{ id: "m1", bounds: { x: 0, y: 0, w: 0.2, h: 0.2 }, source: "vision" }],
      },
      guidancePlan: {
        captureId: "c",
        speech: [{ segmentIndex: 0, text: "Hi" }],
        manifestations: [
          { type: "glow", targetMarkId: "m1", enterAtSegment: 0 },
          { type: "callout", targetMarkId: "m1", enterAtSegment: 1 },
        ],
      },
    },
    "fallback",
  );
  assert.ok(payload);
  const initial = initialManifestations(payload!.guidancePlan);
  assert.equal(initial.length, 1);
  assert.equal(initial[0]?.type, "glow");
});

test("companionSpeechFromGuidance joins ordered segments", () => {
  const text = companionSpeechFromGuidance({
    captureId: "c",
    speech: [
      { segmentIndex: 1, text: "Second." },
      { segmentIndex: 0, text: "First." },
    ],
    manifestations: [],
  });
  assert.equal(text, "First. Second.");
});

test("findUiMark resolves by id", () => {
  const uiMap = {
    captureId: "c",
    width: 100,
    height: 100,
    marks: [{ id: "m2", bounds: { x: 0, y: 0, w: 0.1, h: 0.1 }, source: "vision" as const }],
  };
  assert.equal(findUiMark(uiMap, "m2")?.id, "m2");
  assert.equal(findUiMark(uiMap, "missing"), undefined);
});
