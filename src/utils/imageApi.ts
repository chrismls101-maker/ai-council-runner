import type { IivoArtifact } from "../types/artifacts";
import type {
  ImageBrief,
  ImageGenerationTrace,
  ImagePackType,
  ImagePackVariation,
  ImageQualityScore,
  ImageStudioConfig,
  ImageVisualType,
} from "../types/imageStudio";

export type ImageBriefResponse = {
  needs: Array<{ type: ImageVisualType; reason: string; suggestedAspectRatios: string[] }>;
  visualNeed: { type: ImageVisualType; reason: string; suggestedAspectRatios: string[] };
  brief: ImageBrief;
  ipGuard: { allowed: boolean; warning?: string; rewrittenPrompt?: string; issues: string[] };
};

export type GenerateImageResponse = {
  artifact: IivoArtifact;
  brief: ImageBrief;
  visualNeed: { type: ImageVisualType; reason: string };
  ipGuard: ImageBriefResponse["ipGuard"];
  provider: string;
  creditsUsed: number;
  trace?: ImageGenerationTrace;
};

export async function fetchImageStudioConfig(): Promise<ImageStudioConfig | null> {
  try {
    const res = await fetch("/api/images/config");
    if (!res.ok) return null;
    return (await res.json()) as ImageStudioConfig;
  } catch {
    return null;
  }
}

export async function fetchImageBrief(params: {
  userPrompt?: string;
  visualType?: ImageVisualType;
  artifact?: IivoArtifact;
  brandTone?: string;
  targetAudience?: string;
  userOwnsBrand?: boolean;
}): Promise<ImageBriefResponse | null> {
  try {
    const res = await fetch("/api/images/brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) return null;
    return (await res.json()) as ImageBriefResponse;
  } catch {
    return null;
  }
}

export async function generateStudioImage(params: {
  userPrompt?: string;
  visualType?: ImageVisualType;
  artifact?: IivoArtifact;
  brandTone?: string;
  targetAudience?: string;
  userOwnsBrand?: boolean;
  count?: number;
  briefOverride?: Partial<ImageBrief>;
  runVisionQa?: boolean;
}): Promise<GenerateImageResponse | null> {
  try {
    const res = await fetch("/api/images/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, explicitAction: true }),
    });
    if (!res.ok) return null;
    return (await res.json()) as GenerateImageResponse;
  } catch {
    return null;
  }
}

export async function generateStudioImagePack(params: {
  packType: ImagePackType;
  count: number;
  aspectRatio?: string;
  styleConsistency?: boolean;
  userPrompt?: string;
  artifact?: IivoArtifact;
  userOwnsBrand?: boolean;
  variations?: ImagePackVariation[];
  sharedBrief?: Partial<ImageBrief>;
  runVisionQa?: boolean;
}): Promise<GenerateImageResponse | null> {
  try {
    const res = await fetch("/api/images/pack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, explicitAction: true }),
    });
    if (!res.ok) return null;
    return (await res.json()) as GenerateImageResponse;
  } catch {
    return null;
  }
}

export async function createStudioImageVariant(params: {
  sourceImageId: string;
  prompt?: string;
  runVisionQa?: boolean;
}): Promise<GenerateImageResponse | null> {
  try {
    const res = await fetch("/api/images/variant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, explicitAction: true }),
    });
    if (!res.ok) return null;
    return (await res.json()) as GenerateImageResponse;
  } catch {
    return null;
  }
}

export async function attachImageToArtifact(params: {
  targetArtifact: IivoArtifact;
  imageId: string;
  sectionId?: string;
  label?: string;
}): Promise<IivoArtifact | null> {
  try {
    const res = await fetch("/api/images/attach-to-artifact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { artifact?: IivoArtifact };
    return data.artifact ?? null;
  } catch {
    return null;
  }
}

export function imageQualityFromArtifact(artifact: IivoArtifact | null): ImageQualityScore | null {
  const meta = artifact?.metadata?.imageStudio as { quality?: ImageQualityScore } | undefined;
  return meta?.quality ?? null;
}

export function imageIdsFromArtifact(artifact: IivoArtifact | null): string[] {
  const meta = artifact?.metadata?.imageStudio as { imageIds?: string[] } | undefined;
  return meta?.imageIds ?? [];
}

export function estimateImageCredits(
  count: number,
  creditsPerImage: number,
  visionQaCredits = 0,
  runVisionQa = false,
): number {
  return Math.max(1, count) * creditsPerImage + (runVisionQa ? visionQaCredits : 0);
}
