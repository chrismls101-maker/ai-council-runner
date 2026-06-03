export type ImageVisualType =
  | "hero_visual"
  | "product_render"
  | "ad_creative"
  | "social_visual"
  | "proposal_cover"
  | "email_banner"
  | "brand_visual"
  | "mockup"
  | "before_after";

export type ImageArtifactType =
  | "image_asset"
  | "image_pack"
  | "hero_visual"
  | "product_render"
  | "product_render_pack"
  | "ad_creative"
  | "ad_creative_pack"
  | "social_visual"
  | "proposal_cover"
  | "email_banner"
  | "brand_visual_system";

export type ImageProviderId =
  | "openai"
  | "google"
  | "replicate"
  | "stability"
  | "local"
  | "mock";

export type ImageBrief = {
  subject: string;
  purpose: string;
  audience: string;
  styleDirection: string;
  composition: string;
  lighting: string;
  colorPalette: string;
  aspectRatio: string;
  avoidList: string[];
  textInstruction: string;
  commercialUsageNote: string;
  prompt: string;
};

export type ImageQualityScore = {
  overall: number;
  purposeFit: number;
  brandFit: number;
  exportReadiness: number;
  warnings: string[];
  visualQa?: ImageVisualQaScore;
};

export type ImageVisualQaScore = {
  ran: boolean;
  provider?: string;
  findings: string[];
  warnings: string[];
  briefMatchScore?: number;
};

export type ImageStudioMetadata = {
  promptUsed: string;
  provider: ImageProviderId;
  model: string;
  sourceArtifactId?: string;
  sourceArtifactTitle?: string;
  sourceArtifactType?: string;
  visualType: ImageVisualType;
  imageRef: { mode: "path" | "url"; value: string };
  width?: number;
  height?: number;
  aspectRatio: string;
  generatedAt: string;
  safetyStatus: "ok" | "warning" | "blocked";
  safetyWarnings?: string[];
  brief?: ImageBrief;
  quality?: ImageQualityScore;
  imageIds?: string[];
};

export type VisualStudioAction =
  | "download_png"
  | "copy_prompt"
  | "regenerate"
  | "create_variants"
  | "attach_to_artifact";

export type ImageStudioConfig = {
  enabled: boolean;
  configured: boolean;
  provider: ImageProviderId;
  activeProvider: ImageProviderId;
  model: string;
  providerLabel: string;
  creditsPerImage: number;
  visionQaCredits?: number;
  mockAvailable: boolean;
  supportsTextToImage: boolean;
  supportsImageToImage: boolean;
  supportsEdit: boolean;
  reason?: string;
};

export type ImagePackType =
  | "product_render_pack"
  | "ad_creative_pack"
  | "social_visual_pack"
  | "hero_visual_variants"
  | "brand_visual_system";

export type ImagePackVariation = {
  angle?: string;
  background?: string;
  lighting?: string;
  composition?: string;
  useCase?: string;
  note?: string;
};

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
