/**
 * Glass Companion — partial re-plan prompts for retarget corrections (Phase 4a).
 *
 * SYNC: desktop-glass/src/shared/companionRetarget.ts
 */

import {
  appendCompanionSessionPrompt,
  GLASS_COMPANION_VISION_APPEND,
  companionImageDimensions,
  companionSpeechFromGuidance,
  extractCompanionFence,
  formatUiMapForVisionPrompt,
  stripCompanionFence,
} from "./glassCompanionGuidance.js";
import {
  defaultGlassDirectCaller,
  formatGlassDirectAnswer,
  GLASS_DIRECT_SYSTEM_PROMPT,
  type GlassDirectAskCaller,
} from "./glassDirectAsk.js";
import type {
  GlassAskLatestScreenshot,
  GlassAskRequestBody,
  GlassAskResponseBody,
} from "./glassAskTypes.js";

export const GLASS_COMPANION_RETARGET_APPEND = `

## Glass Companion — retarget correction

The user is correcting your previous highlight — they mean a **different** UI region on the **same** screenshot.

Rules:
- Do NOT re-describe the whole screen. Briefly acknowledge the correction in 1–2 short speech segments.
- Pick a **different** mark id than the ones currently highlighted (see active marks below).
- Prefer nearby marks from the detected regions list when the user says "below", "above", "other", etc.
- Update manifestations to glow/spotlight the new target; crossfade-friendly — one primary focus.
- Keep the same captureId in uiMap and guidancePlan.

Append exactly one \`\`\`companion\`\`\` JSON block (same schema as presence mode) at the end.`;

export const GLASS_COMPANION_DIRECT_FOLLOW_UP_APPEND = `

## Glass Companion — follow-up (no new screen capture)

The user is continuing the same teaching moment. Use the prior guidance context below.
Answer briefly in plain markdown. If a new highlight would help, you may append a \`\`\`companion\`\`\` block with an updated plan on the **same** uiMap marks — otherwise omit the block.`;

function formatPriorPlanBlock(
  memory: NonNullable<GlassAskRequestBody["companionMemory"]>,
): string {
  const lines = [
    "",
    "Prior Companion context:",
    `- Last user prompt: "${memory.lastPrompt}"`,
    `- Active mark ids: ${memory.activeMarkIds.join(", ") || "(none)"}`,
    `- Prior speech: ${memory.lastGuidancePlan.speech.map((s) => s.text).join(" | ") || "(none)"}`,
  ];
  if (memory.lastUiMap.marks.length) {
    lines.push(formatUiMapForVisionPrompt(memory.lastUiMap));
  }
  return lines.join("\n");
}

export function buildRetargetUserPrompt(
  prompt: string,
  memory: NonNullable<GlassAskRequestBody["companionMemory"]>,
): string {
  return [prompt.trim(), formatPriorPlanBlock(memory), "", "Retarget to the corrected region."].join(
    "\n",
  );
}

export function buildDirectFollowUpUserPrompt(
  prompt: string,
  memory: NonNullable<GlassAskRequestBody["companionMemory"]>,
): string {
  return [prompt.trim(), formatPriorPlanBlock(memory)].join("\n");
}

export function buildRetargetSystemPrompt(shot?: GlassAskLatestScreenshot): string {
  const { width, height } = companionImageDimensions(shot);
  return (
    GLASS_COMPANION_VISION_APPEND.replace("IMAGE_WIDTH", String(width)).replace(
      "IMAGE_HEIGHT",
      String(height),
    ) + GLASS_COMPANION_RETARGET_APPEND
  );
}

export function buildDirectFollowUpSystemPrompt(): string {
  return GLASS_COMPANION_DIRECT_FOLLOW_UP_APPEND;
}

export function buildScriptContinueUserPrompt(
  prompt: string,
  memory: NonNullable<GlassAskRequestBody["companionMemory"]>,
): string {
  return [
    prompt.trim(),
    formatPriorPlanBlock(memory),
    "",
    'The user acknowledged ("next" / "okay"). Briefly continue or ask what they want next. Keep it short.',
  ].join("\n");
}

/** Text-only Companion follow-up / script-continue — no fresh capture. */
export async function runGlassCompanionDirectFollowUp(
  body: GlassAskRequestBody,
  signal?: AbortSignal,
  caller: GlassDirectAskCaller = defaultGlassDirectCaller,
): Promise<GlassAskResponseBody> {
  const memory = body.companionMemory;
  if (!memory) {
    throw new Error("companionMemory is required for direct follow-up");
  }

  const prompt = body.prompt?.trim() ?? "";
  const userPrompt =
    body.companionRoute === "script_continue"
      ? buildScriptContinueUserPrompt(prompt, memory)
      : buildDirectFollowUpUserPrompt(prompt, memory);

  const systemPrompt =
    appendCompanionSessionPrompt(GLASS_DIRECT_SYSTEM_PROMPT) + buildDirectFollowUpSystemPrompt();
  const purpose = body.modelPurpose ?? "default";
  const result = await caller(systemPrompt, userPrompt, signal, purpose);

  const rawOutput = result.content.trim();
  const captureId = memory.lastCaptureId;
  const companionPayload = extractCompanionFence(rawOutput, captureId);
  const raw = companionPayload ? stripCompanionFence(rawOutput) : rawOutput;
  const formatted = formatGlassDirectAnswer(raw, {
    overlayCap: body.responseStyle !== "full",
  });
  const guidanceSpeech = companionSpeechFromGuidance(companionPayload?.guidancePlan);

  return {
    answer: formatted.answer,
    shortAnswer: guidanceSpeech || formatted.shortAnswer,
    model: result.modelUsed,
    modelRequested: result.requestedModel,
    modelUsed: result.modelUsed,
    fallbackUsed: result.fallbackUsed,
    routeUsed: "glass_direct",
    title: prompt.length > 60 ? `${prompt.slice(0, 59)}…` : prompt,
    warnings: formatted.warnings,
    usage: result.usage,
    companionGuidance: companionPayload ?? undefined,
  };
}
