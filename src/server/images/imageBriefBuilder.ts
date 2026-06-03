import type { ArtifactSection, ArtifactType, IivoArtifact } from "../artifacts/artifactTypes.js";
import { guardImagePrompt } from "./imageIpGuard.js";
import type { VisualNeed } from "./visualNeedDetector.js";

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

export type ImageBriefInput = {
  userPrompt?: string;
  artifact?: Pick<IivoArtifact, "title" | "type" | "summary" | "sections">;
  visualNeed: VisualNeed;
  brandTone?: string;
  targetAudience?: string;
  userOwnsBrand?: boolean;
};

function firstText(sections: ArtifactSection[] | undefined): string {
  if (!sections?.length) return "";
  for (const section of sections) {
    if (typeof section.content === "string" && section.content.trim()) {
      return section.content.trim().slice(0, 500);
    }
  }
  return "";
}

function purposeForNeed(type: VisualNeed["type"]): string {
  const map: Record<VisualNeed["type"], string> = {
    hero_visual: "Primary hero visual for a business landing or offer page",
    product_render: "Clean product render for catalog or sales collateral",
    ad_creative: "Paid or organic ad creative supporting the offer",
    social_visual: "Social post visual optimized for feed engagement",
    proposal_cover: "Professional proposal or deck cover visual",
    email_banner: "Email header banner supporting the message",
    brand_visual: "Brand mood direction without copying existing marks",
    mockup: "UI or layout mockup illustrating the concept",
    before_after: "Before/after concept visual for redesign recommendations",
  };
  return map[type];
}

export function buildImageBrief(input: ImageBriefInput): ImageBrief {
  const artifact = input.artifact;
  const excerpt = firstText(artifact?.sections);
  const subject =
    artifact?.title?.trim() ||
    input.userPrompt?.trim().slice(0, 120) ||
    "Business visual for the current workspace";
  const audience = input.targetAudience?.trim() || "Decision-makers and target customers for this offer";
  const brandTone = input.brandTone?.trim() || "Professional, trustworthy, modern, commercially credible";
  const aspectRatio = input.visualNeed.suggestedAspectRatios[0] ?? "16:9";

  const rawPrompt = [
    purposeForNeed(input.visualNeed.type),
    `Subject: ${subject}.`,
    excerpt ? `Context: ${excerpt.slice(0, 240)}.` : "",
    `Audience: ${audience}.`,
    `Style: ${brandTone}.`,
    `Composition: clear focal subject, balanced negative space, commercial polish.`,
    `Lighting: soft natural light with subtle contrast.`,
    `Palette: cohesive business palette aligned to the offer.`,
    input.visualNeed.type === "product_render"
      ? "Show the product clearly on a neutral studio background."
      : "",
    input.visualNeed.type === "before_after"
      ? "Split or paired concept showing improvement without copying existing sites."
      : "",
    "No trademarked logos, no copyrighted characters, no exact brand replicas.",
    /headline|title text|caption/i.test(input.userPrompt ?? "")
      ? "Include minimal readable headline text only if essential."
      : "Avoid heavy text overlays; image models handle text poorly.",
  ]
    .filter(Boolean)
    .join(" ");

  const guarded = guardImagePrompt(rawPrompt, { userOwnsBrand: input.userOwnsBrand });
  const prompt = guarded.rewrittenPrompt ?? rawPrompt;

  return {
    subject,
    purpose: purposeForNeed(input.visualNeed.type),
    audience,
    styleDirection: `${brandTone}; original commercial art direction`,
    composition: "Single clear focal subject with balanced negative space",
    lighting: "Soft natural light, subtle contrast, export-ready clarity",
    colorPalette: "Cohesive business palette aligned to the offer and audience",
    aspectRatio,
    avoidList: [
      "Trademarked logos",
      "Copyrighted characters",
      "Exact replicas of known brands",
      "Competitor product branding",
      "Dense text overlays",
    ],
    textInstruction: /headline|title text|caption/i.test(input.userPrompt ?? "")
      ? "Minimal headline text only if essential"
      : "Prefer no text in the image",
    commercialUsageNote: "For business collateral tied to the user's workspace artifact",
    prompt,
  };
}

export function artifactTypeSupportsVisuals(type: ArtifactType | undefined): boolean {
  if (!type || type === "plain_answer") return false;
  return true;
}
