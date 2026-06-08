import { formatBusinessContextBlock } from "../decisionQuality/formatContext.js";
import type { BusinessContext } from "../decisionQuality/types.js";
import { formatGlassUserProfileBlock } from "../userProfile/formatUserProfile.js";
import type { GlassUserProfile } from "../userProfile/types.js";

export const PRESETS: Record<string, string> = {
  none: "",
  "ai-front-desk-sales-test": `Product:
AI Front Desk is an AI receptionist named Sarah. She answers when the business is busy or closed, captures caller name, phone, reason, urgency, and emails the owner a summary.

Goal:
Get my first 5 paying pilot customers.

Pricing:
Starter: $199/month
Pro: $399/month
Prefer Pro when the business has steady call volume.

Do not overpromise:

* no SMS yet
* no number porting during pilot
* no guaranteed appointment booking
* no guaranteed revenue
* no "replaces staff"
* sell missed-call recovery and lead capture only

For every business, final output should include:

1. Prospect score from 1–10
2. Why they are a fit
3. Best pain angle
4. Owner-specific opener
5. Cold call script
6. Text/DM script
7. Email script
8. Follow-up message
9. Objections they may have
10. Best close: $199 or $399

Prioritize businesses most likely to pay quickly.
Be direct. No fluff.

`,
};

export const PRESET_OPTIONS = [
  { value: "none", label: "No preset" },
  { value: "ai-front-desk-sales-test", label: "AI Front Desk Sales Test" },
];

export function buildFullPrompt(
  preset: string,
  userPrompt: string,
  options?: {
    decisionObjective?: string;
    businessContext?: BusinessContext;
    userProfile?: GlassUserProfile;
    memoryBlock?: string;
    conversationBlock?: string;
    externalContextBlock?: string;
    omitPreset?: boolean;
  },
): string {
  const sections: string[] = [];
  const presetContext = PRESETS[preset] ?? "";
  if (!options?.omitPreset && presetContext.trim()) {
    sections.push(presetContext.trim());
  }

  if (options?.conversationBlock?.trim()) {
    sections.push(options.conversationBlock.trim());
  }

  if (options?.decisionObjective?.trim()) {
    sections.push(`Decision Objective:\n${options.decisionObjective.trim()}`);
  }

  if (options?.businessContext) {
    sections.push(formatBusinessContextBlock(options.businessContext));
  }

  if (options?.userProfile) {
    sections.push(formatGlassUserProfileBlock(options.userProfile));
  }

  if (options?.memoryBlock?.trim()) {
    sections.push(`Relevant Memory:\n${options.memoryBlock.trim()}`);
  }

  if (options?.externalContextBlock?.trim()) {
    sections.push(options.externalContextBlock.trim());
  }

  sections.push(`User Request:\n${userPrompt.trim()}`);
  return sections.join("\n\n---\n\n");
}
