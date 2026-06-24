/**
 * Active Listening — classify user interruptions during a live session.
 *
 * Contextual questions like "how does that work?" must use recent transcript,
 * not be treated as generic asks.
 */

import type { ActiveListeningIntent } from "./activeListeningTypes.ts";

const ASK_THOUGHTS_PATTERNS = [
  /\bwhat are your thoughts on what (?:he|she|they|the speaker) just said\b/i,
  /\bwhat do you think about that\b/i,
  /\bwhat(?:'s| is) your take on that\b/i,
  /\bwhat are your thoughts on that\b/i,
  /\bwhat did (?:he|she|they|the speaker) just (?:say|mean)\b/i,
];

const AGREE_DISAGREE_PATTERNS = [
  /\bdo you agree\b/i,
  /\bdo you disagree\b/i,
  /\bagree or disagree\b/i,
  /\bwould you agree with that\b/i,
];

const APPLY_PATTERNS = [
  /\bhow does that apply\b/i,
  /\bhow would that apply\b/i,
  /\bhow can i apply that\b/i,
  /\bhow does this apply to me\b/i,
  /\bwhat should i take from that\b/i,
  /\bwhat should i take away\b/i,
];

const IMPORTANCE_PATTERNS = [
  /\bwas that actually important\b/i,
  /\bwas that important\b/i,
  /\bis that actually important\b/i,
  /\bdid that matter\b/i,
];

const EXPLAIN_PATTERNS = [
  /\bhow does that work\b/i,
  /\bexplain that\b/i,
  /\bexplain what (?:he|she|they|the speaker) meant\b/i,
  /\bwhat does (?:he|she|they|that|this) mean\b/i,
  /\bwhy is that important\b/i,
  /\bwhat (?:is|was) (?:he|she|they) (?:talking|saying) about\b/i,
  /\bbreak (?:that|this) down\b/i,
];

const SUMMARIZE_PATTERNS = [
  /\bwhat did i miss\b/i,
  /\bwhat should i remember\b/i,
  /\bsummari[sz]e (?:that|this|recent|the last|what)/i,
  /\bwhat matters (?:here|so far|now)\b/i,
  /\brecap\b/i,
  /\bkey points?\b/i,
];

const CREATE_SCRIPT_PATTERNS = [
  /\bcreate (?:me )?(?:a )?(?:quick )?script from that\b/i,
  /\bwrite (?:me )?(?:a )?(?:quick )?script from that\b/i,
  /\bcan you create (?:a )?(?:quick )?script from that\b/i,
];

const CREATE_ASSET_PATTERNS = [
  /\bcreate (?:me )?(?:a )?(?:quick )?(?:outline|checklist|summary|asset|plan|cheatsheet)\b/i,
  /\bturn that into (?:a )?(?:outline|checklist|plan|summary|asset)\b/i,
  /\bmake me (?:a )?(?:quick )?(?:outline|checklist)\b/i,
  /\bwrite (?:me )?(?:a )?(?:quick )?summary\b/i,
];

const SALES_COACHING_PATTERNS = [
  /\bwhat should i say next\b/i,
  /\bhow should i follow up\b/i,
  /\bhow do i push further\b/i,
  /\btalk track\b/i,
  /\bhow do i respond\b/i,
  /\bwhat is the customer saying\b/i,
  /\bwhat(?:'s| is) (?:the )?customer (?:saying|thinking|objecting)\b/i,
];

const OBJECTION_PATTERNS = [
  /\bwhat objection is this\b/i,
  /\bhow do i respond to that customer\b/i,
  /\bhandle (?:this|that) objection\b/i,
  /\bobjection handling\b/i,
];

const SAVE_MOMENT_PATTERNS = [
  /\bsave that\b/i,
  /\bmark that as important\b/i,
  /\bremember that\b/i,
  /\bdon'?t forget that\b/i,
];

const PROMPT_GEN_PATTERNS = [
  /\bcreate (?:a )?(?:quick )?(?:cursor )?prompt from that\b/i,
  /\bcreate (?:a )?(?:quick )?prompt from that\b/i,
  /\bmake me a prompt from that\b/i,
  /\bcreate (?:a )?(?:cursor )?prompt\b/i,
  /\bturn that into (?:a )?prompt\b/i,
];

const ACTION_STEPS_PATTERNS = [
  /\bturn that into action steps\b/i,
  /\bturn this into action steps\b/i,
  /\bturn what (?:he|she|they) just said into action\b/i,
  /\baction steps from that\b/i,
  /\bcreate (?:me )?(?:a )?(?:quick )?action (?:list|steps|plan)\b/i,
];

const DEBRIEF_PATTERNS = [
  /\bi'?m done\b/i,
  /\bgive me the report\b/i,
  /\bgenerate (?:the )?(?:report|debrief)\b/i,
];

/** Intents that require recent transcript/audio context to answer well. */
export const TRANSCRIPT_DEPENDENT_INTENTS = new Set<ActiveListeningIntent>([
  "ask_thoughts",
  "explain_current_moment",
  "agree_disagree",
  "apply_current_moment",
  "summarize_recent",
  "what_did_i_miss",
  "create_asset",
  "create_script",
  "sales_coaching",
  "objection_handling",
  "prompt_generation",
  "action_steps",
  "turn_into_action",
]);

export function classifyActiveListeningIntent(prompt: string): ActiveListeningIntent {
  const text = prompt.trim();
  if (!text) return "general_contextual";
  if (DEBRIEF_PATTERNS.some((re) => re.test(text))) return "debrief_request";
  if (SAVE_MOMENT_PATTERNS.some((re) => re.test(text))) return "save_moment";
  if (ASK_THOUGHTS_PATTERNS.some((re) => re.test(text))) return "ask_thoughts";
  if (AGREE_DISAGREE_PATTERNS.some((re) => re.test(text))) return "agree_disagree";
  if (APPLY_PATTERNS.some((re) => re.test(text))) return "apply_current_moment";
  if (IMPORTANCE_PATTERNS.some((re) => re.test(text))) return "ask_thoughts";
  if (OBJECTION_PATTERNS.some((re) => re.test(text))) return "objection_handling";
  if (SALES_COACHING_PATTERNS.some((re) => re.test(text))) return "sales_coaching";
  if (PROMPT_GEN_PATTERNS.some((re) => re.test(text))) return "prompt_generation";
  if (CREATE_SCRIPT_PATTERNS.some((re) => re.test(text))) return "create_script";
  if (CREATE_ASSET_PATTERNS.some((re) => re.test(text))) return "create_asset";
  if (ACTION_STEPS_PATTERNS.some((re) => re.test(text))) return "turn_into_action";
  if (EXPLAIN_PATTERNS.some((re) => re.test(text))) return "explain_current_moment";
  if (/\bwhat did i miss\b/i.test(text)) return "what_did_i_miss";
  if (SUMMARIZE_PATTERNS.some((re) => re.test(text))) return "summarize_recent";
  return "general_contextual";
}

export function intentNeedsRecentTranscript(intent: ActiveListeningIntent): boolean {
  return TRANSCRIPT_DEPENDENT_INTENTS.has(intent);
}
