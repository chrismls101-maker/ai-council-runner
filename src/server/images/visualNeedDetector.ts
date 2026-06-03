import type { ArtifactSection, ArtifactType } from "../artifacts/artifactTypes.js";

export type VisualNeed = {
  type:
    | "hero_visual"
    | "product_render"
    | "ad_creative"
    | "social_visual"
    | "proposal_cover"
    | "email_banner"
    | "brand_visual"
    | "mockup"
    | "before_after";
  reason: string;
  suggestedAspectRatios: string[];
  requiredInputs?: string[];
};

export type VisualNeedInput = {
  prompt?: string;
  artifactType?: ArtifactType;
  artifactTitle?: string;
  sections?: ArtifactSection[];
  hasScreenshot?: boolean;
};

const LANDING_TYPES = new Set<ArtifactType>(["landing_page_copy", "canvas_project", "campaign_plan"]);
const EMAIL_TYPES = new Set<ArtifactType>(["cold_email", "follow_up_sequence", "email_template"]);
const PROPOSAL_TYPES = new Set<ArtifactType>(["proposal", "business_plan", "report"]);
const AUDIT_TYPES = new Set<ArtifactType>(["website_audit"]);

function sectionText(sections: ArtifactSection[] | undefined): string {
  if (!sections?.length) return "";
  return sections
    .map((s) => (typeof s.content === "string" ? s.content : JSON.stringify(s.content)))
    .join("\n")
    .slice(0, 4000);
}

export function detectVisualNeeds(input: VisualNeedInput): VisualNeed[] {
  const needs: VisualNeed[] = [];
  const prompt = (input.prompt ?? "").toLowerCase();
  const body = sectionText(input.sections);
  const combined = `${prompt}\n${body}`.toLowerCase();
  const type = input.artifactType;

  if (type && LANDING_TYPES.has(type) || /landing page|hero section|homepage/i.test(combined)) {
    needs.push({
      type: "hero_visual",
      reason: "Landing or homepage content benefits from a hero visual.",
      suggestedAspectRatios: ["16:9", "3:2", "1:1"],
    });
    needs.push({
      type: "social_visual",
      reason: "Social preview supports launch and share campaigns.",
      suggestedAspectRatios: ["1:1", "4:5", "16:9"],
    });
  }

  if (/product render|product photo|jewelry|sku|catalog/i.test(combined)) {
    needs.push({
      type: "product_render",
      reason: "Product-focused request needs a clean product render.",
      suggestedAspectRatios: ["1:1", "4:5", "3:4"],
      requiredInputs: ["product description"],
    });
  }

  if (type && EMAIL_TYPES.has(type) || /cold email|outreach email|email offer/i.test(combined)) {
    needs.push({
      type: "ad_creative",
      reason: "Email offer can be repurposed into ad creative.",
      suggestedAspectRatios: ["1:1", "4:5", "16:9"],
    });
    if (/banner|header image|email design/i.test(combined)) {
      needs.push({
        type: "email_banner",
        reason: "Email layout may use a header banner.",
        suggestedAspectRatios: ["3:1", "16:9"],
      });
    }
  }

  if (type && PROPOSAL_TYPES.has(type) || /proposal|client deck|cover page/i.test(combined)) {
    needs.push({
      type: "proposal_cover",
      reason: "Proposal deliverables often need a cover visual.",
      suggestedAspectRatios: ["3:4", "16:9"],
    });
  }

  if (type === "social_post" || /social post|linkedin|instagram|facebook ad/i.test(combined)) {
    needs.push({
      type: "social_visual",
      reason: "Social content needs a platform-ready visual.",
      suggestedAspectRatios: ["1:1", "4:5", "9:16"],
    });
    needs.push({
      type: "ad_creative",
      reason: "Social posts can extend into paid ad creative.",
      suggestedAspectRatios: ["1:1", "4:5"],
    });
  }

  if (type && AUDIT_TYPES.has(type) || /website audit|homepage audit|before and after/i.test(combined)) {
    needs.push({
      type: "before_after",
      reason: "Audit recommendations are clearer with before/after concept visuals.",
      suggestedAspectRatios: ["16:9", "3:2"],
    });
    needs.push({
      type: "hero_visual",
      reason: "Improved hero concept supports redesign recommendations.",
      suggestedAspectRatios: ["16:9", "3:2"],
    });
  }

  if (/brand system|style guide|visual identity|logo mood/i.test(combined)) {
    needs.push({
      type: "brand_visual",
      reason: "Brand direction benefits from a cohesive visual system moodboard.",
      suggestedAspectRatios: ["16:9", "1:1"],
    });
  }

  if (/mockup|wireframe|ui concept|app screen/i.test(combined) || input.hasScreenshot) {
    needs.push({
      type: "mockup",
      reason: "Mockup visual helps communicate layout or UI direction.",
      suggestedAspectRatios: ["16:9", "9:16"],
    });
  }

  if (needs.length === 0 && type && type !== "plain_answer") {
    needs.push({
      type: "hero_visual",
      reason: "Business artifact can be supported with a contextual hero visual.",
      suggestedAspectRatios: ["16:9", "1:1"],
    });
  }

  const seen = new Set<string>();
  return needs.filter((n) => {
    if (seen.has(n.type)) return false;
    seen.add(n.type);
    return true;
  });
}

export function visualNeedToLabel(type: VisualNeed["type"]): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
