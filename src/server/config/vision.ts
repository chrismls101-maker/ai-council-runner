import { MODELS } from "./models.js";

export const VISION_IMAGE_ADDON_CREDITS = 2;

const DEFAULT_VISION_PROVIDER = "openai";

export interface ImageVisionConfig {
  enabled: boolean;
  provider: string;
  model: string | null;
  configured: boolean;
  reason?: string;
}

function parseBool(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function isImageVisionEnabled(): boolean {
  return parseBool(process.env.IMAGE_VISION_ENABLED);
}

export function getImageVisionProvider(): string {
  return process.env.IMAGE_VISION_PROVIDER?.trim() || DEFAULT_VISION_PROVIDER;
}

export function getImageVisionModel(): string {
  const configured = process.env.IMAGE_VISION_MODEL?.trim();
  if (configured) return configured;
  return MODELS.openai.gpt4o;
}

export function getImageVisionConfig(): ImageVisionConfig {
  const enabled = isImageVisionEnabled();
  const provider = getImageVisionProvider();
  const model = enabled ? getImageVisionModel() : null;

  if (!enabled) {
    return {
      enabled: false,
      provider,
      model: null,
      configured: false,
      reason: "Image vision is disabled. Set IMAGE_VISION_ENABLED=true to enable.",
    };
  }

  if (provider !== "openai") {
    return {
      enabled: true,
      provider,
      model,
      configured: false,
      reason: `Image vision provider "${provider}" is not supported in this build.`,
    };
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return {
      enabled: true,
      provider,
      model,
      configured: false,
      reason: "OPENAI_API_KEY is required for image vision analysis.",
    };
  }

  return {
    enabled: true,
    provider,
    model,
    configured: true,
  };
}

export function logImageVisionStatus(): void {
  const config = getImageVisionConfig();
  console.log(
    `IMAGE_VISION_ENABLED=${config.enabled ? "true" : "false"} provider=${config.provider} model=${config.model ?? "n/a"} configured=${config.configured}`,
  );
}
