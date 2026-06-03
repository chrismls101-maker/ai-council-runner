import type { ImageBrief } from "./imageBriefBuilder.js";
import type { StoredImageRecord } from "./imageStore.js";
import type { VisualNeed } from "./visualNeedDetector.js";

export type ImageQualityInput = {
  record?: StoredImageRecord | null;
  brief?: ImageBrief;
  expectedAspectRatio?: string;
  brandName?: string;
  textHeavyRequested?: boolean;
};

export type ImageVisualQaScore = {
  ran: boolean;
  provider?: string;
  findings: string[];
  warnings: string[];
  briefMatchScore?: number;
};

export type ImageQualityScore = {
  overall: number;
  purposeFit: number;
  brandFit: number;
  exportReadiness: number;
  warnings: string[];
  visualQa?: ImageVisualQaScore;
};

function ratioMatches(expected?: string, actual?: string): boolean {
  if (!expected || !actual) return true;
  return expected === actual;
}

export function scoreImageQuality(input: ImageQualityInput): ImageQualityScore {
  const warnings: string[] = [];
  let purposeFit = 40;
  let brandFit = 70;
  let exportReadiness = 40;

  if (input.record) {
    exportReadiness += 25;
    if ((input.record.sizeBytes ?? 0) > 0 && (input.record.sizeBytes ?? 0) < 8 * 1024 * 1024) {
      exportReadiness += 15;
    } else if ((input.record.sizeBytes ?? 0) >= 8 * 1024 * 1024) {
      warnings.push("Image file is large; consider compressing before export.");
    }
  } else {
    warnings.push("Image file missing.");
  }

  if (input.brief) {
    if (input.brief.purpose.trim()) purposeFit += 20;
    if (input.brief.audience.trim()) purposeFit += 15;
    if (input.brief.styleDirection.trim()) purposeFit += 15;
    if (input.brief.prompt.trim().length > 40) purposeFit += 10;
  } else {
    warnings.push("Image brief missing purpose/audience/style details.");
  }

  if (input.brief?.avoidList?.length) brandFit += 10;
  if (input.brandName?.trim()) brandFit += 10;

  if (!ratioMatches(input.expectedAspectRatio, input.record?.aspectRatio)) {
    warnings.push("Aspect ratio may not match the selected visual format.");
    exportReadiness -= 10;
  }

  if (input.textHeavyRequested) {
    warnings.push("Text-heavy image request — most image models handle text poorly.");
    exportReadiness -= 5;
  }

  purposeFit = Math.max(0, Math.min(100, purposeFit));
  brandFit = Math.max(0, Math.min(100, brandFit));
  exportReadiness = Math.max(0, Math.min(100, exportReadiness));
  const overall = Math.round((purposeFit + brandFit + exportReadiness) / 3);

  return { overall, purposeFit, brandFit, exportReadiness, warnings };
}

export function mergeQualityWithVision(
  quality: ImageQualityScore,
  vision: {
    ran: boolean;
    provider?: string;
    findings: string[];
    warnings: string[];
    briefMatchScore?: number;
  },
): ImageQualityScore {
  const visualQa: ImageVisualQaScore = {
    ran: vision.ran,
    provider: vision.provider,
    findings: vision.findings,
    warnings: vision.warnings,
    briefMatchScore: vision.briefMatchScore,
  };
  const warnings = [...quality.warnings, ...vision.warnings];
  let overall = quality.overall;
  if (vision.ran && typeof vision.briefMatchScore === "number") {
    overall = Math.round((overall + vision.briefMatchScore) / 2);
  }
  return { ...quality, overall, warnings, visualQa };
}

export function visualNeedToArtifactType(
  visualType: VisualNeed["type"],
  count = 1,
): string {
  if (count > 1) {
    if (visualType === "product_render") return "product_render_pack";
    if (visualType === "ad_creative") return "ad_creative_pack";
    return "image_pack";
  }
  const map: Record<VisualNeed["type"], string> = {
    hero_visual: "hero_visual",
    product_render: "product_render",
    ad_creative: "ad_creative",
    social_visual: "social_visual",
    proposal_cover: "proposal_cover",
    email_banner: "email_banner",
    brand_visual: "brand_visual_system",
    mockup: "image_asset",
    before_after: "image_asset",
  };
  return map[visualType];
}
