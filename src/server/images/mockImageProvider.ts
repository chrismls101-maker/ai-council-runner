import type { ImageProviderId } from "../../types/imageStudio.js";
import type { GenerateImageRequest, GeneratedImage } from "./imageProvider.js";
import { MOCK_PNG_BUFFER, saveGeneratedImage } from "./imageStore.js";

function parseAspectRatio(aspectRatio?: string): { width: number; height: number } {
  if (!aspectRatio || !aspectRatio.includes(":")) return { width: 1024, height: 1024 };
  const [w, h] = aspectRatio.split(":").map((v) => Number(v));
  if (!w || !h) return { width: 1024, height: 1024 };
  const base = 1024;
  if (w >= h) return { width: base, height: Math.round((base * h) / w) };
  return { width: Math.round((base * w) / h), height: base };
}

export async function generateMockImages(
  request: GenerateImageRequest,
  count: number,
  options?: {
    sourceArtifactId?: string;
    visualType?: string;
    forceProvider?: ImageProviderId;
    forceModel?: string;
  },
): Promise<GeneratedImage[]> {
  const dims = parseAspectRatio(request.aspectRatio);
  const provider = options?.forceProvider ?? "mock";
  const model = options?.forceModel ?? "iivo-mock-v1";
  const images: GeneratedImage[] = [];

  for (let i = 0; i < count; i++) {
    const stored = await saveGeneratedImage({
      buffer: MOCK_PNG_BUFFER,
      mimeType: "image/png",
      width: dims.width,
      height: dims.height,
      aspectRatio: request.aspectRatio,
      provider,
      model,
      prompt: request.prompt,
      sourceArtifactId: options?.sourceArtifactId,
      visualType: options?.visualType,
    });
    images.push({
      id: stored.id,
      path: stored.publicPath,
      mimeType: stored.mimeType,
      width: stored.width,
      height: stored.height,
      provider,
      model,
      prompt: request.prompt,
    });
  }

  return images;
}
