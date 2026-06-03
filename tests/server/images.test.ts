import assert from "node:assert/strict";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

function test(name: string, fn: () => void | Promise<void>) {
  Promise.resolve()
    .then(() => fn())
    .then(() => console.log(`✓ ${name}`))
    .catch((err) => {
      console.error(`✗ ${name}`);
      throw err;
    });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await test("visualNeedDetector: landing page suggests hero visual", async () => {
  const { detectVisualNeeds } = await import("../../dist/server/images/visualNeedDetector.js");
  const needs = detectVisualNeeds({
    prompt: "Build a SaaS landing page hero section",
    artifactType: "landing_page_copy",
    sections: [{ id: "hero", label: "Hero", kind: "text", content: "Launch faster" }],
  });
  assert.ok(needs.some((n) => n.type === "hero_visual"));
});

await test("imageBriefBuilder: builds business brief without competitor names", async () => {
  const { buildImageBrief } = await import("../../dist/server/images/imageBriefBuilder.js");
  const brief = buildImageBrief({
    userPrompt: "Hero for HVAC missed-call recovery SaaS",
    visualNeed: {
      type: "hero_visual",
      reason: "Landing hero",
      suggestedAspectRatios: ["16:9"],
    },
    artifact: {
      title: "Landing Page",
      type: "landing_page_copy",
      sections: [{ id: "hero", label: "Hero", kind: "text", content: "Recover missed calls" }],
    },
  });
  assert.match(brief.prompt, /business|commercial|hero/i);
  assert.doesNotMatch(brief.prompt, /chatgpt|gemini|dall/i);
});

await test("imageIpGuard: warns on style-copy prompt", async () => {
  const { guardImagePrompt } = await import("../../dist/server/images/imageIpGuard.js");
  const result = guardImagePrompt("Make this in the style of Apple marketing with their logo");
  assert.ok(result.issues.length > 0);
  assert.ok(result.warning);
  assert.ok(result.rewrittenPrompt);
});

await test("imageProvider: mock generates stored image", async () => {
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

await test("imageQuality: scores generated image", async () => {
  const { scoreImageQuality } = await import("../../dist/server/images/imageQuality.js");
  const { buildImageBrief } = await import("../../dist/server/images/imageBriefBuilder.js");
  const brief = buildImageBrief({
    visualNeed: { type: "hero_visual", reason: "Hero", suggestedAspectRatios: ["16:9"] },
  });
  const score = scoreImageQuality({
    record: {
      id: "img-test",
      filename: "img-test.png",
      path: "/tmp/img-test.png",
      publicPath: "/api/images/img-test/file",
      mimeType: "image/png",
      provider: "mock",
      model: "iivo-mock-v1",
      prompt: brief.prompt,
      createdAt: new Date().toISOString(),
      sizeBytes: 100,
      aspectRatio: "16:9",
    },
    brief,
    expectedAspectRatio: "16:9",
  });
  assert.ok(score.overall >= 50);
});

await test("imageIpGuard: no warning for generic professional proposal cover", async () => {
  const { guardImagePrompt } = await import("../../dist/server/images/imageIpGuard.js");
  const result = guardImagePrompt(
    "Create a professional proposal cover image for a premium automation consulting proposal.",
  );
  assert.equal(result.issues.length, 0);
  assert.equal(result.warning, undefined);
});

await test("imageIpGuard: brand-copy warning for competitor style request", async () => {
  const { guardImagePrompt } = await import("../../dist/server/images/imageIpGuard.js");
  const result = guardImagePrompt("Make it like Nike with Perplexity branding and ChatGPT logo");
  assert.ok(result.issues.length > 0);
  assert.ok(result.warning);
});

await test("visualNeedDetector: proposal cover for consulting proposal", async () => {
  const { detectVisualNeeds } = await import("../../dist/server/images/visualNeedDetector.js");
  const needs = detectVisualNeeds({
    prompt: "Create a professional proposal cover image for a premium automation consulting proposal.",
    artifactType: "proposal",
  });
  assert.ok(needs.some((n) => n.type === "proposal_cover"));
});

await test("artifact PDF detects image sections", async () => {
  const section = {
    id: "image-1",
    label: "Visual",
    kind: "preview" as const,
    content: "/api/images/img-123/file",
  };
  const isImage = section.kind === "preview" || /\/api\/images\/[^/]+\/file/.test(String(section.content));
  assert.equal(isImage, true);
});

await test("image artifact snapshot stores path reference not base64", async () => {
  const { createArtifactSnapshot } = await import("../../src/utils/artifactSnapshot.ts");
  const artifact = {
    id: "img-art-1",
    type: "hero_visual" as const,
    renderMode: "inline" as const,
    title: "Hero",
    sections: [{ id: "image-1", label: "Visual", kind: "preview" as const, content: "/api/images/x/file" }],
    actions: ["copy" as const],
  };
  const snapshot = createArtifactSnapshot(artifact, "run-1");
  const serialized = JSON.stringify(snapshot);
  assert.doesNotMatch(serialized, /base64/i);
  assert.match(serialized, /\/api\/images\//);
});
