/**
 * Audio Build Plan Extractor
 *
 * When a Glass audio/video listening session ends with a substantial transcript,
 * this module extracts build intent using the default Anthropic model and emits a bus event
 * with a formatted Glass Coder prompt ready to launch.
 *
 * Chain: Listen session ends → extractAudioBuildPlan() → knowledge.audio.build_plan_ready
 */

import { randomUUID } from "crypto";
import {
  agentBus,
  AgentBus,
  type AudioBuildPlanPayload,
} from "./agentEventBus.ts";
import { askIivoGlass } from "./glassAskClient.ts";
import { logWorkflowTriggered } from "./glassRetentionEvents.ts";
import type { GlassConfig } from "../shared/config.ts";
import { formatCoderPrompt, parseExtractedIntent } from "../shared/audioBuildPlanParse.ts";

/** Minimum transcript length (chars) to attempt extraction. */
const MIN_TRANSCRIPT_CHARS = 200;

/** Maximum transcript chars sent to the model (keep cost low). */
const MAX_TRANSCRIPT_CHARS = 6_000;

const EXTRACTION_PROMPT = (transcript: string): string => `You are extracting build intent from a transcript of a video or audio the user just watched.

Extract:
1. What the user wants to build (concrete description)
2. Key technical requirements mentioned
3. Suggested tech stack if mentioned (frameworks, languages, tools)

Return ONLY valid JSON in this exact format — nothing else:
{
  "intent": "one to two sentence description of what to build",
  "requirements": ["requirement 1", "requirement 2"],
  "stack": ["tech 1", "tech 2"]
}

If the transcript does not contain build/project intent, return:
{ "intent": "", "requirements": [], "stack": [] }

Transcript:
${transcript}`;

/**
 * Called when a listen session ends with a transcript.
 * Runs async — does not block the listen session cleanup.
 * Emits knowledge.audio.build_plan_ready on the bus when done.
 */
export async function extractAudioBuildPlan(
  transcript: string,
  config: GlassConfig,
  sessionId: string,
): Promise<void> {
  const trimmed = transcript.trim();
  if (trimmed.length < MIN_TRANSCRIPT_CHARS) {
    console.log("[audioBuildPlan] Transcript too short to extract build intent — skipping");
    return;
  }

  const truncated = trimmed.length > MAX_TRANSCRIPT_CHARS
    ? trimmed.slice(0, MAX_TRANSCRIPT_CHARS) + "\n[transcript truncated]"
    : trimmed;

  console.log("[audioBuildPlan] Extracting build intent from transcript...");

  try {
    const response = await askIivoGlass(config, {
      prompt: EXTRACTION_PROMPT(truncated),
      modelPurpose: "default",
    });

    const raw = response.answer?.trim() ?? "";
    if (!raw) {
      console.log("[audioBuildPlan] Empty response from model — skipping");
      return;
    }

    const extracted = parseExtractedIntent(raw);
    if (!extracted || !extracted.intent.trim()) {
      console.log("[audioBuildPlan] No build intent found in transcript");
      return;
    }

    const coderPrompt = formatCoderPrompt(extracted);
    const payload: AudioBuildPlanPayload = {
      coderPrompt,
      sourceTranscriptExcerpt: trimmed.slice(0, 500),
      extractedIntent: extracted,
    };

    const correlationId = AgentBus.newCorrelationId();

    agentBus.publish(
      "knowledge.audio.build_plan_ready",
      payload,
      {
        runId: `audio-build-plan-${randomUUID()}`,
        sessionId,
        correlationId,
        sourceAgentId: "audio-extractor",
      },
    );

    logWorkflowTriggered("video_audio_build_plan", sessionId);
    console.log("[audioBuildPlan] Build plan ready — bus event emitted");
  } catch (err) {
    console.error("[audioBuildPlan] Extraction failed:", err);
  }
}
