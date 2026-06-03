import type { ImageProviderId } from "../../types/imageStudio.js";
import { isOpenAiImageConfigured } from "./openaiImageProvider.js";
import { isStubProvider, stubProviderReason } from "./providerStubs.js";

export type GenerateImageRequest = {
  prompt: string;
  aspectRatio?: string;
  size?: string;
  referenceImageIds?: string[];
  count?: number;
  mode: "text_to_image" | "image_to_image" | "edit" | "variation";
};

export type GeneratedImage = {
  id: string;
  url?: string;
  path?: string;
  mimeType: string;
  width?: number;
  height?: number;
  provider: ImageProviderId;
  model: string;
  prompt: string;
};

export type ImageProviderConfig = {
  enabled: boolean;
  provider: ImageProviderId;
  model: string;
  creditsPerImage: number;
};

export type ImageProviderStatus = {
  enabled: boolean;
  configured: boolean;
  provider: ImageProviderId;
  activeProvider: ImageProviderId;
  model: string;
  supportsTextToImage: boolean;
  supportsImageToImage: boolean;
  supportsEdit: boolean;
  reason?: string;
};

export function readImageProviderConfig(): ImageProviderConfig {
  const enabled = process.env.IMAGE_GENERATION_ENABLED === "true" || process.env.IMAGE_GENERATION_ENABLED === "1";
  const provider = (process.env.IMAGE_GENERATION_PROVIDER?.trim() || "mock") as ImageProviderId;
  const model = process.env.IMAGE_GENERATION_MODEL?.trim() || "iivo-mock-v1";
  const creditsPerImage = Number(process.env.IMAGE_GENERATION_CREDITS ?? "3") || 3;
  return { enabled, provider, model, creditsPerImage };
}

export function isProviderConfigured(provider: ImageProviderId): boolean {
  if (provider === "mock") return true;
  if (provider === "openai") return isOpenAiImageConfigured();
  if (isStubProvider(provider)) return false;
  return false;
}

export function getProviderNotConfiguredReason(provider: ImageProviderId): string | undefined {
  if (provider === "mock") return undefined;
  if (provider === "openai" && !isOpenAiImageConfigured()) {
    return "OPENAI_API_KEY is required when IMAGE_GENERATION_PROVIDER=openai.";
  }
  if (isStubProvider(provider)) return stubProviderReason(provider);
  return "Image provider is not configured.";
}

export function getImageProviderStatus(
  headers?: Record<string, string | string[] | undefined>,
): ImageProviderStatus {
  const config = readImageProviderConfig();
  const activeProvider = resolveActiveProvider(headers);
  const configured = isProviderConfigured(config.provider);
  const reason = configured ? undefined : getProviderNotConfiguredReason(config.provider);

  const supportsLive =
    config.provider === "openai" && configured;

  return {
    enabled: config.enabled || activeProvider === "mock",
    configured,
    provider: config.provider,
    activeProvider,
    model: activeProvider === "mock" ? "iivo-mock-v1" : config.model,
    supportsTextToImage: activeProvider === "mock" || supportsLive,
    supportsImageToImage: false,
    supportsEdit: false,
    reason,
  };
}

export function resolveActiveProvider(
  headers?: Record<string, string | string[] | undefined>,
): ImageProviderId {
  const config = readImageProviderConfig();
  const mockHeader = headers?.["x-iivo-mock-images"];
  const mockRequested =
    mockHeader === "1" ||
    mockHeader === "true" ||
    process.env.NODE_ENV === "test" ||
    process.env.IMAGE_QA_MOCK === "1";

  if (mockRequested && process.env.NODE_ENV !== "production") return "mock";
  if (!config.enabled) return "mock";
  if (!isProviderConfigured(config.provider)) return "mock";
  return config.provider;
}

export function providerLabel(provider: ImageProviderId): string {
  const labels: Record<ImageProviderId, string> = {
    openai: "Configured image provider",
    google: "Configured image provider",
    replicate: "Configured image provider",
    stability: "Configured image provider",
    local: "Local image provider",
    mock: "IIVO mock image provider",
  };
  return labels[provider];
}

export async function generateImages(
  request: GenerateImageRequest,
  options?: {
    provider?: ImageProviderId;
    sourceArtifactId?: string;
    visualType?: string;
  },
): Promise<GeneratedImage[]> {
  const provider = options?.provider ?? resolveActiveProvider();
  const config = readImageProviderConfig();
  const count = Math.max(1, Math.min(request.count ?? 1, 4));

  if (provider === "mock" || !config.enabled) {
    const { generateMockImages } = await import("./mockImageProvider.js");
    return generateMockImages(request, count, options);
  }

  if (provider === "openai") {
    if (!isOpenAiImageConfigured()) {
      throw new Error(getProviderNotConfiguredReason("openai"));
    }
    const { generateOpenAiImages } = await import("./openaiImageProvider.js");
    return generateOpenAiImages(request, count, {
      sourceArtifactId: options?.sourceArtifactId,
      visualType: options?.visualType,
      model: config.model,
    });
  }

  if (isStubProvider(provider)) {
    throw new Error(stubProviderReason(provider));
  }

  throw new Error(`Unsupported image provider: ${provider}`);
}
