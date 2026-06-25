import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  glassDmgFilename,
  parseGlassVersion,
} from "../../dist/server/glass/glassUpdateFeed.js";

describe("glass download helpers", () => {
  it("parses semver from GitHub release tags", () => {
    assert.equal(parseGlassVersion("v0.8.2"), "0.8.2");
    assert.equal(parseGlassVersion("0.9.0"), "0.9.0");
  });

  it("builds DMG filenames for each architecture", () => {
    assert.equal(glassDmgFilename("0.8.2", "arm64"), "IIVO-Glass-0.8.2-arm64.dmg");
    assert.equal(glassDmgFilename("0.8.2", "x64"), "IIVO-Glass-0.8.2-x64.dmg");
  });
});
