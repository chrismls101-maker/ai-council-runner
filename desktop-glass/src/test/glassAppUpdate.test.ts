import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultGlassUpdateTitle,
  emptyGlassAppUpdateState,
  isNewerVersion,
  parseSemver,
  resolveGlassUpdateDownloadTarget,
  type GlassUpdateManifest,
} from "../shared/glassAppUpdate.ts";

describe("glassAppUpdate", () => {
  it("parses semver tuples", () => {
    assert.deepEqual(parseSemver("0.1.0"), [0, 1, 0]);
    assert.deepEqual(parseSemver("v1.2.3"), [1, 2, 3]);
  });

  it("compares versions", () => {
    assert.equal(isNewerVersion("0.2.0", "0.1.0"), true);
    assert.equal(isNewerVersion("0.1.0", "0.1.0"), false);
    assert.equal(isNewerVersion("0.1.1", "0.1.10"), false);
  });

  it("builds empty update state", () => {
    assert.deepEqual(emptyGlassAppUpdateState("0.1.0"), {
      phase: "idle",
      currentVersion: "0.1.0",
    });
  });

  it("defaults update title", () => {
    assert.equal(defaultGlassUpdateTitle("0.2.0"), "NEW SYSTEM UPDATE · v0.2.0");
  });

  it("resolves darwin download targets", () => {
    const manifest: GlassUpdateManifest = {
      version: "0.2.0",
      darwinArm64Dmg: "/tmp/arm64.dmg",
      darwinUniversalDmg: "/tmp/universal.dmg",
    };
    assert.equal(
      resolveGlassUpdateDownloadTarget(manifest, "darwin", "arm64"),
      "/tmp/arm64.dmg",
    );
    assert.equal(
      resolveGlassUpdateDownloadTarget(manifest, "darwin", "x64"),
      "/tmp/universal.dmg",
    );
    assert.equal(
      resolveGlassUpdateDownloadTarget({ version: "0.2.0", downloadUrl: "https://x/y.dmg" }, "darwin", "arm64"),
      "https://x/y.dmg",
    );
  });
});
