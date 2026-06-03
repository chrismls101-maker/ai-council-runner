import type { ArtifactType } from "../types/artifacts";
import type { ImageVisualType } from "../types/imageStudio";

const IMAGE_ARTIFACT_TYPES = new Set<ArtifactType>([
  "image_asset",
  "image_pack",
  "hero_visual",
  "product_render",
  "product_render_pack",
  "ad_creative",
  "ad_creative_pack",
  "social_visual",
  "proposal_cover",
  "email_banner",
  "brand_visual_system",
]);

export type VisualAction = {
  id: string;
  visualType: ImageVisualType;
  label: string;
};

const LANDING: ArtifactType[] = ["landing_page_copy", "canvas_project", "campaign_plan"];
const EMAIL: ArtifactType[] = ["cold_email", "follow_up_sequence", "email_template"];
const PROPOSAL: ArtifactType[] = ["proposal", "business_plan", "report"];
const AUDIT: ArtifactType[] = ["website_audit"];

export function getContextualVisualActions(artifactType: ArtifactType): VisualAction[] {
  if (LANDING.includes(artifactType)) {
    return [
      { id: "hero", visualType: "hero_visual", label: "Generate hero visual" },
      { id: "social", visualType: "social_visual", label: "Generate social preview" },
      { id: "pack", visualType: "hero_visual", label: "Generate image pack" },
    ];
  }
  if (EMAIL.includes(artifactType)) {
    return [
      { id: "ad", visualType: "ad_creative", label: "Generate ad creative" },
      { id: "banner", visualType: "email_banner", label: "Generate email banner" },
    ];
  }
  if (PROPOSAL.includes(artifactType)) {
    return [
      { id: "cover", visualType: "proposal_cover", label: "Generate proposal cover" },
      { id: "brand", visualType: "brand_visual", label: "Generate brand visual" },
    ];
  }
  if (AUDIT.includes(artifactType)) {
    return [
      { id: "hero", visualType: "hero_visual", label: "Generate improved hero concept" },
      { id: "before_after", visualType: "before_after", label: "Generate before/after visual" },
    ];
  }
  if (artifactType === "social_post") {
    return [
      { id: "social", visualType: "social_visual", label: "Generate social post image" },
      { id: "ad", visualType: "ad_creative", label: "Generate ad creative" },
    ];
  }
  return [
    { id: "hero", visualType: "hero_visual", label: "Generate hero image" },
    { id: "ad", visualType: "ad_creative", label: "Generate ad creative" },
    { id: "product", visualType: "product_render", label: "Generate product visual" },
    { id: "pack", visualType: "product_render", label: "Generate image pack" },
  ];
}

export function supportsInlineVisualAction(artifactType: ArtifactType): boolean {
  return artifactType !== "plain_answer" && !IMAGE_ARTIFACT_TYPES.has(artifactType);
}
