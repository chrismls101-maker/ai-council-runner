import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isOmniParserEnabled,
  normalizeSomMark,
  parseOmniParserResponse,
  shouldTryOmniParser,
  stripJpegDataUrl,
} from "../main/companionOmniParser.ts";

test("stripJpegDataUrl removes data URL prefix", () => {
  assert.equal(stripJpegDataUrl("data:image/jpeg;base64,abc123"), "abc123");
  assert.equal(stripJpegDataUrl("abc123"), "abc123");
});

test("normalizeSomMark maps som payload to UiMark", () => {
  const mark = normalizeSomMark(
    {
      id: "som-1",
      label: "Submit",
      bounds: { x: 0.72, y: 0.88, w: 0.08, h: 0.04 },
      confidence: 0.91,
    },
    0,
  );
  assert.deepEqual(mark, {
    id: "som-1",
    label: "Submit",
    bounds: { x: 0.72, y: 0.88, w: 0.08, h: 0.04 },
    source: "som",
  });
});

test("normalizeSomMark rejects invalid bounds", () => {
  assert.equal(normalizeSomMark({ id: "som-1", bounds: { x: 0, y: 0, w: 0, h: 0.1 } }, 0), null);
  assert.equal(normalizeSomMark({ id: "som-1" }, 0), null);
});

test("parseOmniParserResponse extracts marks array", () => {
  const marks = parseOmniParserResponse({
    marks: [
      { id: "som-1", bounds: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 }, label: "Menu" },
      { id: "som-2", bounds: { x: 0.5, y: 0.6, w: 0.2, h: 0.05 } },
    ],
    latencyMs: 12,
    modelVersion: "omniparser-mock-v1",
  });
  assert.equal(marks.length, 2);
  assert.equal(marks[0]?.source, "som");
  assert.equal(marks[1]?.label, undefined);
});

test("parseOmniParserResponse returns empty for bad payload", () => {
  assert.deepEqual(parseOmniParserResponse(null), []);
  assert.deepEqual(parseOmniParserResponse({}), []);
  assert.deepEqual(parseOmniParserResponse({ marks: "nope" }), []);
});

test("shouldTryOmniParser respects gate rules", () => {
  const prev = process.env.IIVO_COMPANION_OMNI_PARSER;
  process.env.IIVO_COMPANION_OMNI_PARSER = "1";
  assert.equal(shouldTryOmniParser(2, "Notes"), true);
  assert.equal(shouldTryOmniParser(3, "Notes"), false);
  assert.equal(shouldTryOmniParser(1, "Google Chrome"), false);
  if (prev) process.env.IIVO_COMPANION_OMNI_PARSER = prev;
  else delete process.env.IIVO_COMPANION_OMNI_PARSER;
});

test("isOmniParserEnabled false when explicitly disabled", () => {
  const prev = process.env.IIVO_COMPANION_OMNI_PARSER;
  process.env.IIVO_COMPANION_OMNI_PARSER = "0";
  assert.equal(isOmniParserEnabled(), false);
  if (prev) process.env.IIVO_COMPANION_OMNI_PARSER = prev;
  else delete process.env.IIVO_COMPANION_OMNI_PARSER;
});

test("isOmniParserEnabled true when explicitly enabled", () => {
  const prev = process.env.IIVO_COMPANION_OMNI_PARSER;
  process.env.IIVO_COMPANION_OMNI_PARSER = "1";
  assert.equal(isOmniParserEnabled(), true);
  if (prev) process.env.IIVO_COMPANION_OMNI_PARSER = prev;
  else delete process.env.IIVO_COMPANION_OMNI_PARSER;
});
