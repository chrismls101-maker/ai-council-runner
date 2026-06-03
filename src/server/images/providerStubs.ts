import type { ImageProviderId } from "../../types/imageStudio.js";
import type { GeneratedImage } from "./imageProvider.js";

export function stubProviderReason(provider: ImageProviderId): string {
  switch (provider) {
    case "google":
      return "Google image provider is not implemented in this build.";
    case "replicate":
      return "Replicate image provider is not implemented in this build.";
    case "stability":
      return "Stability image provider is not implemented in this build.";
    case "local":
      return "Local image provider is not configured.";
    default:
      return "Image provider is not configured.";
  }
}

export async function generateStubProviderImages(
  provider: ImageProviderId,
): Promise<GeneratedImage[]> {
  throw new Error(stubProviderReason(provider));
}

export function isStubProvider(provider: ImageProviderId): boolean {
  return provider === "google" || provider === "replicate" || provider === "stability" || provider === "local";
}
