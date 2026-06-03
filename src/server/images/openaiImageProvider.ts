import type { GenerateImageRequest, GeneratedImage } from "./imageProvider.js";
import { saveGeneratedImage } from "./imageStore.js";

function aspectToOpenAiSize(aspectRatio?: string): string {
  switch (aspectRatio) {
    case "16:9":
      return "1792x1024";
    case "9:16":
      return "1024x1792";
    case "3:4":
      return "1024x1792";
    case "4:5":
      return "1024x1792";
    case "3:1":
      return "1792x1024";
    default:
      return "1024x1024";
  }
}

export function isOpenAiImageConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export async function generateOpenAiImages(
  request: GenerateImageRequest,
  count: number,
  options?: {
    sourceArtifactId?: string;
    visualType?: string;
    model?: string;
  },
): Promise<GeneratedImage[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured for image generation.");
  }

  const model = options?.model || process.env.IMAGE_GENERATION_MODEL?.trim() || "dall-e-3";
  const size = request.size || aspectToOpenAiSize(request.aspectRatio);
  const images: GeneratedImage[] = [];

  for (let i = 0; i < count; i++) {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: request.prompt,
        n: 1,
        size,
        response_format: "url",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Image provider call failed (${response.status}): ${errText.slice(0, 240)}`);
    }

    const data = (await response.json()) as { data?: Array<{ url?: string }> };
    const url = data.data?.[0]?.url;
    if (!url) throw new Error("Image provider returned no image URL.");

    const imgRes = await fetch(url);
    if (!imgRes.ok) throw new Error("Failed to download generated image from provider.");
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    const stored = await saveGeneratedImage({
      buffer,
      mimeType: "image/png",
      aspectRatio: request.aspectRatio,
      provider: "openai",
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
      provider: "openai",
      model,
      prompt: request.prompt,
    });
  }

  return images;
}
