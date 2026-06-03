import type { IivoArtifact } from "../artifacts/artifactTypes.js";
import { buildImageArtifact } from "./imageArtifactBuilder.js";
import { buildImageBrief, type ImageBrief } from "./imageBriefBuilder.js";
import { guardImagePrompt } from "./imageIpGuard.js";
import { mergeQualityWithVision, scoreImageQuality } from "./imageQuality.js";
import {
  generateImages,
  getImageProviderStatus,
  readImageProviderConfig,
  resolveActiveProvider,
} from "./imageProvider.js";
import { runOptionalImageVisionQa, visionQaCreditAddon } from "./imageVisionQa.js";
import { detectVisualNeeds, type VisualNeed } from "./visualNeedDetector.js";

export type ImageGenerationTrace = {
  provider: string;
  model: string;
  providerConfigured: boolean;
  providerCallSucceeded: boolean;
  providerError?: string;
  visionQaRan?: boolean;
  visionQaProvider?: string;
  visionQaFindings?: string[];
  visionQaWarnings?: string[];
  imageCreditsUsed?: number;
  visionCreditsUsed?: number;
  packType?: string;
  packCount?: number;
};

export type GenerateStudioImageInput = {
  userPrompt?: string;
  visualType?: VisualNeed["type"];
  artifact?: IivoArtifact;
  brandTone?: string;
  targetAudience?: string;
  userOwnsBrand?: boolean;
  count?: number;
  briefOverride?: Partial<ImageBrief>;
  runVisionQa?: boolean;
  headers?: Record<string, string | string[] | undefined>;
};

export type GenerateStudioImageResult = {
  artifact: IivoArtifact;
  brief: ImageBrief;
  visualNeed: VisualNeed;
  ipGuard: ReturnType<typeof guardImagePrompt>;
  provider: string;
  creditsUsed: number;
  trace: ImageGenerationTrace;
};

export async function generateStudioImage(
  input: GenerateStudioImageInput,
): Promise<GenerateStudioImageResult> {
  const needs = detectVisualNeeds({
    prompt: input.userPrompt,
    artifactType: input.artifact?.type,
    artifactTitle: input.artifact?.title,
    sections: input.artifact?.sections,
  });
  const visualNeed =
    needs.find((n) => n.type === input.visualType) ??
    needs[0] ??
    ({
      type: "hero_visual",
      reason: "Default business visual",
      suggestedAspectRatios: ["16:9"],
    } as VisualNeed);

  let brief = buildImageBrief({
    userPrompt: input.userPrompt,
    artifact: input.artifact,
    visualNeed,
    brandTone: input.brandTone,
    targetAudience: input.targetAudience,
    userOwnsBrand: input.userOwnsBrand,
  });

  if (input.briefOverride?.prompt) brief = { ...brief, ...input.briefOverride, prompt: input.briefOverride.prompt };
  else if (input.briefOverride) brief = { ...brief, ...input.briefOverride };

  const ipGuard = guardImagePrompt(brief.prompt, { userOwnsBrand: input.userOwnsBrand });
  if (ipGuard.rewrittenPrompt) brief = { ...brief, prompt: ipGuard.rewrittenPrompt };

  const provider = resolveActiveProvider(input.headers);
  const status = getImageProviderStatus(input.headers);
  const config = readImageProviderConfig();
  const count = Math.max(1, Math.min(input.count ?? 1, 4));

  let images;
  let providerCallSucceeded = false;
  let providerError: string | undefined;
  try {
    images = await generateImages(
      {
        prompt: brief.prompt,
        aspectRatio: brief.aspectRatio,
        count,
        mode: "text_to_image",
      },
      {
        provider,
        sourceArtifactId: input.artifact?.id,
        visualType: visualNeed.type,
      },
    );
    providerCallSucceeded = images.length > 0;
  } catch (err) {
    providerError = err instanceof Error ? err.message : "Image provider call failed.";
    throw new Error(providerError);
  }

  const { getStoredImage } = await import("./imageStore.js");
  const stored = images[0] ? await getStoredImage(images[0].id) : null;
  let quality = scoreImageQuality({
    record: stored,
    brief,
    expectedAspectRatio: brief.aspectRatio,
    textHeavyRequested: /headline|caption|text overlay/i.test(brief.prompt),
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

  const imageCredits = config.creditsPerImage * count;
  const visionCredits = visionQa?.ran ? visionQaCreditAddon() : 0;

  const artifact = buildImageArtifact({
    images,
    visualNeed,
    brief,
    quality,
    sourceArtifact: input.artifact,
    safetyStatus: ipGuard.issues.length ? "warning" : "ok",
    safetyWarnings: ipGuard.issues,
  });

  return {
    artifact,
    brief,
    visualNeed,
    ipGuard,
    provider,
    creditsUsed: imageCredits + visionCredits,
    trace: {
      provider,
      model: status.model,
      providerConfigured: status.configured,
      providerCallSucceeded,
      providerError,
      visionQaRan: Boolean(visionQa?.ran),
      visionQaProvider: visionQa?.provider,
      visionQaFindings: visionQa?.findings,
      visionQaWarnings: visionQa?.warnings,
      imageCreditsUsed: imageCredits,
      visionCreditsUsed: visionCredits,
    },
  };
}

export async function createImageVariant(input: {
  sourceImageId: string;
  prompt?: string;
  runVisionQa?: boolean;
  headers?: Record<string, string | string[] | undefined>;
}): Promise<GenerateStudioImageResult> {
  const { getStoredImage } = await import("./imageStore.js");
  const stored = await getStoredImage(input.sourceImageId);
  if (!stored) throw new Error("Source image not found");

  return generateStudioImage({
    userPrompt: input.prompt ?? `${stored.prompt}. Variation with alternate composition.`,
    visualType: (stored.visualType as VisualNeed["type"]) ?? "hero_visual",
    count: 1,
    runVisionQa: input.runVisionQa,
    headers: input.headers,
  });
}
