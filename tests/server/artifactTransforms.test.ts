import assert from "node:assert/strict";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

test("artifactTransforms: module exports transformArtifact", async () => {
  const mod = await import("../../dist/server/artifacts/artifactTransforms.js");
  assert.equal(typeof mod.transformArtifact, "function");
});
