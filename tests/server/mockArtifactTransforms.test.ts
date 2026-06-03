import assert from "node:assert/strict";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

await test("mockArtifactTransforms: builds follow-up fixture", async () => {
  const { buildMockTransformArtifact } = await import(
    "../../dist/server/artifacts/mockArtifactTransforms.js"
  );
  const parent = {
    id: "parent-1",
    type: "cold_email" as const,
    renderMode: "inline" as const,
    title: "Cold Email",
    sections: [{ id: "b", label: "Body", kind: "email_body" as const, content: "Hi" }],
    actions: ["copy" as const],
  };
  const child = buildMockTransformArtifact(parent, "follow_up_sequence");
  assert.equal(child.type, "follow_up_sequence");
  assert.ok(child.sections.length >= 2);
  assert.equal(child.metadata?.mock, true);
});

await test("mockArtifactTransforms: header enables mock in non-production", async () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  const { isMockTransformMode } = await import("../../dist/server/artifacts/mockArtifactTransforms.js");
  assert.equal(isMockTransformMode({ headers: { "x-iivo-mock-transforms": "1" } }), true);
  process.env.NODE_ENV = "production";
  assert.equal(isMockTransformMode({ headers: { "x-iivo-mock-transforms": "1" } }), false);
  process.env.NODE_ENV = prev;
});
