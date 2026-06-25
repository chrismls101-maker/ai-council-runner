import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyGlassBrowseDemoCategory,
  glassBrowseDemoAnswer,
} from "../../src/components/glass-landing/glassBrowseDemo.ts";

describe("glass browse demo copy", () => {
  it("classifies command categories", () => {
    assert.equal(classifyGlassBrowseDemoCategory("how do I download glass"), "download");
    assert.equal(classifyGlassBrowseDemoCategory("open agents on this page"), "agents");
    assert.equal(classifyGlassBrowseDemoCategory("what about privacy"), "privacy");
    assert.equal(classifyGlassBrowseDemoCategory("launch check"), "launch");
    assert.equal(classifyGlassBrowseDemoCategory("delete my memory"), "memory");
    assert.equal(classifyGlassBrowseDemoCategory("build loop from here"), "build_loop");
  });

  it("returns Aletheia-voice answers", () => {
    const answer = glassBrowseDemoAnswer("download glass");
    assert.match(answer, /Here's what I see on this page/i);
    assert.match(answer, /DMG|GitHub/i);
  });
});
