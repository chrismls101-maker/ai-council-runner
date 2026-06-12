/**
 * IIVO Glass — Meeting Intelligence AI extraction prompts.
 *
 * Builds structured prompts for the AI extraction pass that replaces the
 * pure-regex `extractMomentsFromChunk` call in the main-process tick.
 *
 * The AI is asked for a JSON array of `ExtractedMomentRaw` objects.
 * `parseExtractionResponse` converts the raw text into validated moments.
 *
 * Pure — no electron / fs / AI calls. Shared across main + tests.
 */

import type { MeetingSubType } from "./meetingIntelligenceTypes.ts";
import type { ExtractedMomentRaw, MeetingExtractionSchema } from "./meetingExtractionSchemas.ts";

// ─── Few-shot examples per archetype ─────────────────────────────────────────

const SALES_EXTERNAL_EXAMPLES = `[
  {"type":"deal_signal","content":"Budget is approved for Q3 and they're ready to move forward","deadline":"Q3"},
  {"type":"customer_signal","content":"Their current CRM is too slow and the sales team hates using it"},
  {"type":"action_item","content":"Send the pricing deck and proposal by end of week","owner":"Alex","deadline":"end of week"},
  {"type":"risk","content":"Procurement could push the timeline out if legal gets involved"},
  {"type":"open_question","content":"Still unclear whether they need SSO or can use standard email login"}
]`;

const TEAM_INTERNAL_EXAMPLES = `[
  {"type":"decision","content":"We're going with JWT instead of sessions for the new auth flow"},
  {"type":"action_item","content":"Tom needs to submit the auth PR for review before Friday standup","owner":"Tom","deadline":"Friday"},
  {"type":"blocker","content":"Can't ship the nav redesign until design signs off — still waiting on them"},
  {"type":"risk","content":"If we miss the Thursday cutoff the release slips to next sprint"},
  {"type":"open_question","content":"Still need to decide whether to use Redis or in-memory for session cache"}
]`;

const PRODUCT_REVIEW_EXAMPLES = `[
  {"type":"decision","content":"V2 dashboard is cut from the Q3 roadmap and pushed to Q4"},
  {"type":"product_feedback","content":"Users are dropping off at step 3 of onboarding because the copy is confusing"},
  {"type":"action_item","content":"Sara to file the P1 bug ticket for the export crash before EOD","owner":"Sara","deadline":"EOD"},
  {"type":"risk","content":"The new API change is breaking — backwards compatibility not guaranteed"},
  {"type":"open_question","content":"Feature flag rollout percentage still TBD — needs PM sign-off"}
]`;

const CLIENT_ACCOUNT_EXAMPLES = `[
  {"type":"commitment","content":"We'll have the integration fix deployed by next Friday","deadline":"next Friday"},
  {"type":"risk","content":"They mentioned evaluating alternatives if this isn't resolved soon"},
  {"type":"action_item","content":"James to send the updated SLA document this afternoon","owner":"James","deadline":"this afternoon"},
  {"type":"open_question","content":"Still unclear whether the issue affects all users or just enterprise tier"}
]`;

const GENERAL_EXAMPLES = `[
  {"type":"decision","content":"We agreed to move the launch date to August 1st"},
  {"type":"action_item","content":"Maria will prepare the summary and send it to the group by Monday","owner":"Maria","deadline":"Monday"},
  {"type":"blocker","content":"Waiting on legal sign-off before we can proceed with the announcement"},
  {"type":"risk","content":"Timeline is tight — any more delays and we miss the press window"}
]`;

const ARCHETYPE_EXAMPLES: Record<MeetingSubType, string> = {
  sales_external: SALES_EXTERNAL_EXAMPLES,
  team_internal:  TEAM_INTERNAL_EXAMPLES,
  product_review: PRODUCT_REVIEW_EXAMPLES,
  client_account: CLIENT_ACCOUNT_EXAMPLES,
  general:        GENERAL_EXAMPLES,
};

// ─── Prompt builder ───────────────────────────────────────────────────────────

/**
 * Build the AI extraction prompt for a transcript delta chunk.
 *
 * The model is asked to return ONLY a JSON array — no prose.
 * `parseExtractionResponse` validates the output before it reaches the engine.
 */
export function buildMeetingExtractionPrompt(
  chunk: string,
  schema: MeetingExtractionSchema,
): string {
  const archetypeLabel = schema.subType.replace(/_/g, " ");
  const validTypes = schema.activeTypes.join(", ");
  const examples = ARCHETYPE_EXAMPLES[schema.subType];

  return `You are a meeting intelligence extractor for a ${archetypeLabel} meeting.

Extract business-critical moments from the transcript chunk below. Return ONLY a valid JSON array — no prose, no markdown fences, no explanation.

Each moment object must have:
- "type": one of [${validTypes}]
- "content": a clean, concise summary (max 140 chars — not a raw quote)
- "owner": person's first name if clearly stated as responsible (omit otherwise)
- "deadline": explicit deadline string, e.g. "Friday", "EOD", "next week" (omit if none)

Rules:
- Only extract genuine business moments — not pleasantries, filler, or small talk
- Content must be a complete, standalone sentence — not a fragment
- Do not invent owners or deadlines that weren't clearly stated
- Clean up the content: remove filler, fix grammar, make it concise
- If nothing important was said, return []
- Return valid JSON only — no trailing commas, no comments

Example output:
${examples}

Transcript chunk:
${chunk.trim()}

JSON:`;
}

// ─── Response parser ──────────────────────────────────────────────────────────

const VALID_MOMENT_TYPES = new Set<string>([
  "decision", "action_item", "risk", "blocker", "open_question",
  "follow_up", "customer_signal", "commitment", "product_feedback", "deal_signal",
]);

/**
 * Parse and validate the AI response text into `ExtractedMomentRaw[]`.
 *
 * Extracts the first JSON array found in the response text (handles cases
 * where the AI adds a small prose wrapper despite the instructions).
 * Any item that fails type or content validation is silently dropped.
 * Returns [] on any parse error so callers never need to handle exceptions.
 */
export function parseExtractionResponse(
  text: string,
  schema: MeetingExtractionSchema,
): ExtractedMomentRaw[] {
  try {
    // Grab the first JSON array from the response
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const parsed: unknown = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];

    const results: ExtractedMomentRaw[] = [];

    for (const item of parsed) {
      if (typeof item !== "object" || item === null) continue;
      const obj = item as Record<string, unknown>;

      const type = obj["type"];
      const content = obj["content"];

      // Type must be a known moment type active for this schema
      if (typeof type !== "string") continue;
      if (!VALID_MOMENT_TYPES.has(type)) continue;
      if (!schema.activeTypes.includes(type as ExtractedMomentRaw["type"])) continue;

      // Content must be a non-trivial string
      if (typeof content !== "string" || content.trim().length < 10) continue;

      const owner =
        typeof obj["owner"] === "string" && obj["owner"].trim().length > 0
          ? obj["owner"].trim()
          : undefined;

      const deadline =
        typeof obj["deadline"] === "string" && obj["deadline"].trim().length > 0
          ? obj["deadline"].trim()
          : undefined;

      results.push({
        type: type as ExtractedMomentRaw["type"],
        content: content.trim(),
        owner,
        deadline,
      });
    }

    return results;
  } catch {
    return [];
  }
}
