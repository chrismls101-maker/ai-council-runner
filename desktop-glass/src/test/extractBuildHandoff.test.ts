import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLAUDE_DESKTOP_BUNDLE_ID,
  EXTRACT_BUILD_TARGETS,
  extractBuildClaudeDesktopNotice,
  extractBuildHandoffNotice,
  isExtractBuildTarget,
} from "../shared/extractBuildHandoff.ts";

describe("Claude desktop constants", () => {
  it("uses Anthropic desktop bundle id", () => {
    assert.equal(CLAUDE_DESKTOP_BUNDLE_ID, "com.anthropic.claudefordesktop");
  });

  it("desktop notice mentions Claude app", () => {
    assert.match(extractBuildClaudeDesktopNotice(), /Claude app/i);
  });
});

describe("isExtractBuildTarget", () => {
  it("accepts valid targets only", () => {
    assert.equal(isExtractBuildTarget("glass"), true);
    assert.equal(isExtractBuildTarget("cursor"), true);
    assert.equal(isExtractBuildTarget("claude"), true);
    assert.equal(isExtractBuildTarget("chatgpt"), false);
    assert.equal(isExtractBuildTarget(null), false);
  });
});

describe("EXTRACT_BUILD_TARGETS", () => {
  it("includes glass, cursor, and claude", () => {
    const ids = EXTRACT_BUILD_TARGETS.map((t) => t.id);
    assert.deepEqual(ids, ["glass", "cursor", "claude"]);
  });
});

describe("extractBuildHandoffNotice", () => {
  it("mentions Enter for each target", () => {
    for (const target of ["glass", "cursor", "claude"] as const) {
      assert.match(extractBuildHandoffNotice(target), /Enter/i);
    }
  });
});
