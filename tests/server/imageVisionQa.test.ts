import assert from "node:assert/strict";

function test(name: string, fn: () => void | Promise<void>) {
  Promise.resolve()
    .then(() => fn())
    .then(() => console.log(`✓ ${name}`))
    .catch((err) => {
      console.error(`✗ ${name}`);
      throw err;
    });
}

await test("vision disabled returns deterministic only", async () => {
  const prev = process.env.IMAGE_VISION_ENABLED;
  process.env.IMAGE_VISION_ENABLED = "false";
  const { runOptionalImageVisionQa } = await import("../../dist/server/images/imageVisionQa.js");
  const { buildImageBrief } = await import("../../dist/server/images/imageBriefBuilder.js");
  const brief = buildImageBrief({
    visualNeed: { type: "hero_visual", reason: "Hero", suggestedAspectRatios: ["16:9"] },
  });
  const result = await runOptionalImageVisionQa({
    brief,
    imageId: "missing-id",
    visualType: "hero_visual",
  });
  assert.equal(result.ran, false);
  process.env.IMAGE_VISION_ENABLED = prev;
});

await test("vision enabled but unavailable warns without crash", async () => {
  const prevEnabled = process.env.IMAGE_VISION_ENABLED;
  const prevKey = process.env.OPENAI_API_KEY;
  process.env.IMAGE_VISION_ENABLED = "true";
  delete process.env.OPENAI_API_KEY;
  delete process.env.IMAGE_VISION_QA_MOCK;
  const { runOptionalImageVisionQa } = await import("../../dist/server/images/imageVisionQa.js");
  const { buildImageBrief } = await import("../../dist/server/images/imageBriefBuilder.js");
  const brief = buildImageBrief({
    visualNeed: { type: "hero_visual", reason: "Hero", suggestedAspectRatios: ["16:9"] },
  });
  const result = await runOptionalImageVisionQa({
    brief,
    imageId: "missing-id",
    visualType: "hero_visual",
  });
  assert.equal(result.ran, false);
  assert.ok(result.warnings.length > 0);
  process.env.IMAGE_VISION_ENABLED = prevEnabled;
  if (prevKey) process.env.OPENAI_API_KEY = prevKey;
});

await test("mock vision QA returns findings in test mode", async () => {
  const { runOptionalImageVisionQa } = await import("../../dist/server/images/imageVisionQa.js");
  const { buildImageBrief } = await import("../../dist/server/images/imageBriefBuilder.js");
  const brief = buildImageBrief({
    visualNeed: { type: "proposal_cover", reason: "Cover", suggestedAspectRatios: ["3:4"] },
  });
  const result = await runOptionalImageVisionQa({
    brief,
    imageId: "img-test",
    visualType: "proposal_cover",
    headers: { "x-iivo-mock-vision-qa": "1" },
  });
  assert.equal(result.ran, true);
  assert.ok(result.findings.length > 0);
  assert.equal(result.provider, "mock");
});

await test("mergeQualityWithVision adds visual QA section data", async () => {
  const { scoreImageQuality, mergeQualityWithVision } = await import("../../dist/server/images/imageQuality.js");
  const { buildImageBrief } = await import("../../dist/server/images/imageBriefBuilder.js");
  const brief = buildImageBrief({
    visualNeed: { type: "hero_visual", reason: "Hero", suggestedAspectRatios: ["16:9"] },
  });
  const base = scoreImageQuality({ brief, expectedAspectRatio: "16:9" });
  const merged = mergeQualityWithVision(base, {
    ran: true,
    provider: "mock",
    findings: ["Subject visible"],
    warnings: [],
    briefMatchScore: 80,
  });
  assert.ok(merged.visualQa?.ran);
  assert.equal(merged.visualQa?.provider, "mock");
});
