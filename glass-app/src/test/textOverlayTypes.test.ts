/**
 * Unit tests for Glass this text overlay types and extractor parsing.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  contentTypeLabel,
  deriveTextOverlayActions,
  isGlassAppName,
  isPrivacyApp,
  needsLevel1Disclaimer,
  shouldRunL2Verification,
} from "../shared/textOverlayTypes.ts";
import { parseTextOverlayVisionJson, parseAmbientReadingJson } from "../shared/textOverlayTypes.ts";

describe("textOverlayTypes", () => {
  it("labels content types for the card pill", () => {
    assert.equal(contentTypeLabel("legal_contract"), "Legal Clause");
    assert.equal(contentTypeLabel("other"), "Text");
  });

  it("skips Glass own UI", () => {
    assert.equal(isGlassAppName("Native Glass"), true);
    assert.equal(isGlassAppName("Chrome"), false);
  });

  it("matches privacy apps case-insensitively", () => {
    assert.equal(isPrivacyApp("1Password 7", ["1Password"]), true);
    assert.equal(isPrivacyApp("Safari", ["1Password"]), false);
  });

  it("routes L2 only for high-risk content types", () => {
    assert.equal(shouldRunL2Verification("legal_contract"), true);
    assert.equal(shouldRunL2Verification("email"), false);
  });

  it("adds disclaimer for legal/medical/financial", () => {
    assert.equal(needsLevel1Disclaimer("medical_health"), true);
    assert.equal(needsLevel1Disclaimer("email"), false);
  });

  it("derives max 3 rule-based actions per content type", () => {
    const actions = deriveTextOverlayActions("foreign_language");
    assert.equal(actions.length, 3);
    assert.equal(actions[0].op, "copy_to_clipboard");
  });
});

describe("textOverlayExtractor.parseTextOverlayVisionJson", () => {
  it("parses Haiku vision JSON", () => {
    const parsed = parseTextOverlayVisionJson(`Here is the result:
{"logicalUnit":"Full indemnification clause text","appName":"Preview","contentType":"legal_contract","confidence":"high"}`);
    assert.match(parsed?.logicalUnit ?? "", /indemnification/);
    assert.equal(parsed?.contentType, "legal_contract");
    assert.equal(parsed?.appName, "Preview");
  });

  it("returns null for invalid JSON", () => {
    assert.equal(parseTextOverlayVisionJson("not json"), null);
  });
});

describe("parseAmbientReadingJson", () => {
  it("parses found complex text", () => {
    const parsed = parseAmbientReadingJson(
      '{"found":true,"text":"indemnification clause","contentType":"legal_contract"}',
    );
    assert.equal(parsed?.found, true);
    assert.equal(parsed?.text, "indemnification clause");
    assert.equal(parsed?.contentType, "legal_contract");
  });

  it("returns not found when found is false", () => {
    const parsed = parseAmbientReadingJson('{"found":false,"text":null,"contentType":null}');
    assert.equal(parsed?.found, false);
  });
});
