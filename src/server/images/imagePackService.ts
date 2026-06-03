import type { IivoArtifact } from "../artifacts/artifactTypes.js";
import type { ImagePackType, ImagePackVariation } from "../../types/imageStudio.js";
import { buildImageArtifact } from "./imageArtifactBuilder.js";
import { buildImageBrief, type ImageBrief } from "./imageBriefBuilder.js";
import { guardImagePrompt } from "./imageIpGuard.js";
import { mergeQualityWithVision, scoreImageQuality } from "./imageQuality.js";
import { generateImages, readImageProviderConfig, resolveActiveProvider } from "./imageProvider.js";
import { runOptionalImageVisionQa, visionQaCreditAddon } from "./imageVisionQa.js";
import { detectVisualNeeds, type VisualNeed } from "./visualNeedDetector.js";
import type { GenerateStudioImageResult } from "./imageGenerationService.js";

export type GenerateImagePackInput = {
  packType: ImagePackType;
  count: number;
  aspectRatio?: string;
  styleConsistency?: boolean;
  sharedBrief?: Partial<ImageBrief>;
  variations?: ImagePackVariation[];
  userPrompt?: string;
  artifact?: IivoArtifact;
  userOwnsBrand?: boolean;
  runVisionQa?: boolean;
  headers?: Record<string, string | string[] | undefined>;
};

const PACK_TO_VISUAL: Record<ImagePackType, VisualNeed["type"]> = {
  product_render_pack: "product_render",
  ad_creative_pack: "ad_creative",
  social_visual_pack: "social_visual",
  hero_visual_variants: "hero_visual",
  brand_visual_system: "brand_visual",
};

function variationPrompt(base: ImageBrief, variation?: ImagePackVariation, index = 0): string {
  const parts = [base.prompt];
  if (variation?.angle) parts.push(`Angle: ${variation.angle}.`);
  if (variation?.background) parts.push(`Background: ${variation.background}.`);
  if (variation?.lighting) parts.push(`Lighting: ${variation.lighting}.`);
  if (variation?.composition) parts.push(`Composition: ${variation.composition}.`);
  if (variation?.useCase) parts.push(`Use case: ${variation.useCase}.`);
  if (variation?.note) parts.push(variation.note);
  parts.push(`Pack image ${index + 1}.`);
  return parts.join(" ");
}

export async function generateImagePack(input: GenerateImagePackInput): Promise<GenerateStudioImageResult> {
  const count = Math.max(2, Math.min(input.count ?? 2, 4));
  const visualType = PACK_TO_VISUAL[input.packType];
  const needs = detectVisualNeeds({
    prompt: input.userPrompt,
    artifactType: input.artifact?.type,
    artifactTitle: input.artifact?.title,
    sections: input.artifact?.sections,
  });
  const visualNeed =
    needs.find((n) => n.type === visualType) ??
    ({
      type: visualType,
      reason: `Image pack: ${input.packType.replace(/_/g, " ")}`,
      suggestedAspectRatios: [input.aspectRatio ?? "1:1"],
    } as VisualNeed);

  let brief = buildImageBrief({
    userPrompt: input.userPrompt,
    artifact: input.artifact,
    visualNeed,
    userOwnsBrand: input.userOwnsBrand,
  });
  if (input.sharedBrief) brief = { ...brief, ...input.sharedBrief };
  if (input.aspectRatio) brief = { ...brief, aspectRatio: input.aspectRatio };
  if (input.styleConsistency) {
    brief = {
      ...brief,
      styleDirection: `${brief.styleDirection}; consistent pack styling across all images`,
    };
  }

  const ipGuard = guardImagePrompt(brief.prompt, { userOwnsBrand: input.userOwnsBrand });
  if (ipGuard.rewrittenPrompt) brief = { ...brief, prompt: ipGuard.rewrittenPrompt };

  const provider = resolveActiveProvider(input.headers);
  const config = readImageProviderConfig();
  const images = [];

  for (let i = 0; i < count; i++) {
    const prompt = variationPrompt(brief, input.variations?.[i], i);
    const guarded = guardImagePrompt(prompt, { userOwnsBrand: input.userOwnsBrand });
    const finalPrompt = guarded.rewrittenPrompt ?? prompt;
    const batch = await generateImages(
      {
        prompt: finalPrompt,
        aspectRatio: brief.aspectRatio,
        count: 1,
        mode: "text_to_image",
      },
      {
        provider,
        sourceArtifactId: input.artifact?.id,
        visualType: visualNeed.type,
      },
    );
    images.push(...batch);
  }

  const { getStoredImage } = await import("./imageStore.js");
  const stored = images[0] ? await getStoredImage(images[0].id) : null;
  let quality = scoreImageQuality({
    record: stored,
    brief,
    expectedAspectRatio: brief.aspectRatio,
  });

  let visionQa;
  if (input.runVisionQa && images[0]) {
    visionQa = await runOptionalImageVisionQa({
      brief,
      imageId: images[0].id,
      visualType: visualNeed.type,
      headers: input.headers,
    });
    quality = mergeQualityWithVision(quality, visionQa);
  }

  const artifact = buildImageArtifact({
    images,
    visualNeed,
    brief,
    quality,
    sourceArtifact: input.artifact,
    safetyStatus: ipGuard.issues.length ? "warning" : "ok",
    safetyWarnings: ipGuard.issues,
    packType: input.packType,
  });

  return {
    artifact,
    brief,
    visualNeed,
    ipGuard,
    provider,
    creditsUsed: config.creditsPerImage * count + (visionQa?.ran ? visionQaCreditAddon() : 0),
    trace: {
      provider,
      model: config.model,
      providerConfigured: provider !== "mock",
      providerCallSucceeded: images.length === count,
      visionQaRan: Boolean(visionQa?.ran),
      visionQaProvider: visionQa?.provider,
      visionQaFindings: visionQa?.findings,
      visionQaWarnings: visionQa?.warnings,
      packType: input.packType,
      packCount: count,
    },
  };
}
