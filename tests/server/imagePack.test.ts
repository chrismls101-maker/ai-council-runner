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

await test("image pack generates 2 mock images", async () => {
  const { generateImagePack } = await import("../../dist/server/images/imagePackService.js");
  const result = await generateImagePack({
    packType: "product_render_pack",
    count: 2,
    aspectRatio: "1:1",
    styleConsistency: true,
    userPrompt: "Premium jewelry product renders for ecommerce",
    headers: { "x-iivo-mock-images": "1" },
  });
  assert.equal(result.artifact.metadata?.imageStudio?.imageIds?.length, 2);
  assert.equal(result.trace.packCount, 2);
  assert.equal(result.creditsUsed, 6);
  for (const id of result.artifact.metadata?.imageStudio?.imageIds ?? []) {
    const { deleteStoredImage } = await import("../../dist/server/images/imageStore.js");
    await deleteStoredImage(id);
  }
});

await test("image pack generates up to 4 images", async () => {
  const { generateImagePack } = await import("../../dist/server/images/imagePackService.js");
  const result = await generateImagePack({
    packType: "ad_creative_pack",
    count: 4,
    userPrompt: "Ad creative pack for HVAC offer",
    headers: { "x-iivo-mock-images": "1" },
  });
  assert.equal(result.artifact.sections.length, 4);
  for (const id of result.artifact.metadata?.imageStudio?.imageIds ?? []) {
    const { deleteStoredImage } = await import("../../dist/server/images/imageStore.js");
    await deleteStoredImage(id);
  }
});

await test("pack artifact snapshot has path references not base64", async () => {
  const { generateImagePack } = await import("../../dist/server/images/imagePackService.js");
  const { createArtifactSnapshot } = await import("../../src/utils/artifactSnapshot.ts");
  const result = await generateImagePack({
    packType: "social_visual_pack",
    count: 2,
    userPrompt: "Social visuals for launch",
    headers: { "x-iivo-mock-images": "1" },
  });
  const snapshot = createArtifactSnapshot(result.artifact, "run-pack");
  const serialized = JSON.stringify(snapshot);
  assert.doesNotMatch(serialized, /base64/i);
  assert.match(serialized, /\/api\/images\//);
  for (const id of result.artifact.metadata?.imageStudio?.imageIds ?? []) {
    const { deleteStoredImage } = await import("../../dist/server/images/imageStore.js");
    await deleteStoredImage(id);
  }
});

await test("estimateImageCredits supports pack of 4", async () => {
  const { estimateImageCredits } = await import("../../src/utils/imageApi.ts");
  assert.equal(estimateImageCredits(4, 3), 12);
  assert.equal(estimateImageCredits(4, 3, 1, true), 13);
  assert.equal(estimateImageCredits(1, 3), 3);
});
