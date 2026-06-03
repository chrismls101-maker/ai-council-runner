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

await test("provider config: configured false when OpenAI key missing", async () => {
  const prevEnabled = process.env.IMAGE_GENERATION_ENABLED;
  const prevProvider = process.env.IMAGE_GENERATION_PROVIDER;
  const prevKey = process.env.OPENAI_API_KEY;
  try {
    process.env.IMAGE_GENERATION_ENABLED = "true";
    process.env.IMAGE_GENERATION_PROVIDER = "openai";
    delete process.env.OPENAI_API_KEY;

    const { getImageProviderStatus } = await import("../../dist/server/images/imageProvider.js");
    const status = getImageProviderStatus();
    assert.equal(status.configured, false);
    assert.ok(status.reason?.includes("OPENAI_API_KEY"));
  } finally {
    process.env.IMAGE_GENERATION_ENABLED = prevEnabled;
    process.env.IMAGE_GENERATION_PROVIDER = prevProvider;
    if (prevKey) process.env.OPENAI_API_KEY = prevKey;
    else delete process.env.OPENAI_API_KEY;
  }
});

await test("provider config: configured true when OpenAI key present", async () => {
  const prevEnabled = process.env.IMAGE_GENERATION_ENABLED;
  const prevProvider = process.env.IMAGE_GENERATION_PROVIDER;
  const prevKey = process.env.OPENAI_API_KEY;
  try {
    process.env.IMAGE_GENERATION_ENABLED = "true";
    process.env.IMAGE_GENERATION_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";

    const { getImageProviderStatus } = await import("../../dist/server/images/imageProvider.js");
    const status = getImageProviderStatus();
    assert.equal(status.configured, true);
  } finally {
    process.env.IMAGE_GENERATION_ENABLED = prevEnabled;
    process.env.IMAGE_GENERATION_PROVIDER = prevProvider;
    if (prevKey) process.env.OPENAI_API_KEY = prevKey;
    else delete process.env.OPENAI_API_KEY;
  }
});

await test("failed OpenAI provider throws and does not return images", async () => {
  const prevKey = process.env.OPENAI_API_KEY;
  const prevEnabled = process.env.IMAGE_GENERATION_ENABLED;
  try {
    process.env.IMAGE_GENERATION_ENABLED = "true";
    delete process.env.OPENAI_API_KEY;
    const { generateImages } = await import("../../dist/server/images/imageProvider.js");
    await assert.rejects(
      () =>
        generateImages(
          { prompt: "Test visual", aspectRatio: "1:1", mode: "text_to_image", count: 1 },
          { provider: "openai" },
        ),
      /OPENAI_API_KEY/,
    );
  } finally {
    process.env.IMAGE_GENERATION_ENABLED = prevEnabled;
    if (prevKey) process.env.OPENAI_API_KEY = prevKey;
    else delete process.env.OPENAI_API_KEY;
  }
});

await test("stub provider returns not implemented message", async () => {
  const prevEnabled = process.env.IMAGE_GENERATION_ENABLED;
  try {
    process.env.IMAGE_GENERATION_ENABLED = "true";
    const { generateImages } = await import("../../dist/server/images/imageProvider.js");
    await assert.rejects(
      () =>
        generateImages(
          { prompt: "Test visual", mode: "text_to_image", count: 1 },
          { provider: "google" },
        ),
      /not implemented/i,
    );
  } finally {
    process.env.IMAGE_GENERATION_ENABLED = prevEnabled;
  }
});

await test("mock provider still generates stored image", async () => {
  const { generateImages } = await import("../../dist/server/images/imageProvider.js");
  const images = await generateImages(
    { prompt: "Professional SaaS hero visual", aspectRatio: "16:9", mode: "text_to_image", count: 1 },
    { provider: "mock", visualType: "hero_visual" },
  );
  assert.equal(images.length, 1);
  assert.ok(images[0]?.path?.includes("/api/images/"));
  const { deleteStoredImage } = await import("../../dist/server/images/imageStore.js");
  await deleteStoredImage(images[0]!.id);
});
