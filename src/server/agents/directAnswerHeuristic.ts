import { isEntitySearchIntent } from "./researchIntent.js";
import { normalizePromptForRouting } from "./promptNormalize.js";

/** Support, rewrite, and customer-reply tasks — not sales acquisition. */
export const SUPPORT_REWRITE_INTENT =
  /\b(write a (calm )?support response|support response|refund (policy )?response|reply to a customer|customer support response|customer says|charged me but|can'?t access (my )?account|cannot access (my )?account|billing issue|shipping delay|make this sound professional|rewrite this|write a message|write an email response|de-corporatize|dec-corporatize)\b/i;

/** Legal / policy awareness — not sales acquisition. */
export const LEGAL_POLICY_INTENT =
  /\b(privacy promises?|legal risks?|policy awareness|compliance caveats?|what (should|must) (it|we|they) avoid (saying|making|claiming)|avoid making|not legal advice|consult (a )?lawyer|data (use|retention|deletion)|uploaded files|collects customer)\b/i;

/** Simple follow-up message deliverables — direct answer, not sales council. */
export const FOLLOW_UP_MESSAGE_INTENT =
  /\b((write|draft|rewrite|make) (a |an |this |the )?(short )?follow[- ]?up( (email|reply|message|note|text))?|rewrite (this |the )?follow[- ]?up|make (this |the )?follow[- ]?up (more |sound )?(professional|human|clearer))\b/i;

/** Sales follow-up strategy / campaign planning — may stay on Sales Attack. */
export const FOLLOW_UP_STRATEGY_INTENT =
  /\b(follow[- ]?up (campaign|strategy|sequence|plan)|prospecting sequence|gtm follow[- ]?up|multi-touch sequence)\b/i;

/** Copy polish / marketing rewrite — not outbound sales. */
export const COPY_REWRITE_INTENT =
  /\b(rewrite (the )?(hero|headline|copy|message|sentence|paragraph|text|tagline)|rewrite this|make this (sound|clearer|less corporate|more human|human)|make this clearer|turn this into plain english|improve this copy|polish this copy|write a better version of (this |the )?sentence|remove jargon|simplify this message|so a normal (business owner|person|customer) understands|less corporate|plain english|homepage says|hero so a|jargon-heavy|understands it)\b/i;

/** Fast-lane utility prompts — one model, no council. */
export const FAST_LANE_DIRECT_INTENT =
  /\b(summarize (this|the|in)|make this sound human|make this less corporate|draft a short response|write a simple email|explain in plain english|give me examples|turn this into a headline|improve this sentence|translate (this|to)|shorten this)\b/i;

/** Explicit outbound / acquisition — Sales Attack, not copy rewrite. */
export const SALES_OUTREACH_INTENT =
  /\b(cold email|cold call|outbound sequence|sales script|prospecting message|lead generation|pitch to a buyer|close (the )?prospect|acquisition campaign|write outreach|find customers|get customers|customer acquisition|target customers|offering a \d+-day paid pilot|paid pilot for)\b/i;

const SALES_INTENT = SALES_OUTREACH_INTENT;

const COUNCIL_INTENT =
  /\b(should i (add|build|launch|kill)|competitive|competitors?|audit|architecture|market research|prospect|entity_search|find one|find ten|verified (plumber|business))\b/i;

const DIRECT_PATTERNS = [
  /^explain what iivo\b/i,
  /^what is iivo\b/i,
  /^what is this platform\b/i,
  /\bin one paragraph\b/i,
  /^summarize (this )?in simple/i,
  /^rewrite this (sentence|paragraph|text)?/i,
  /rewrite this sentence to sound/i,
  /\brewrite the hero\b/i,
  /^what should the .+ button/i,
  /difference between .*(chatgpt|claude|iivo)/i,
  /^how does iivo work\b/i,
  /^describe iivo\b/i,
  /^tell me about iivo\b/i,
  /^what is the difference between iivo and chatgpt\b/i,
  /^who is (it|this|that) for\??\s*$/i,
  /^who is .+ for\??\s*$/i,
  /^what is (it|this|that) for\??\s*$/i,
  /^what (does|do) (it|this|that) do\??\s*$/i,
  /^how is (it|this|that) different\??\s*$/i,
  /^what makes (it|this|that) different\??\s*$/i,
  /^why (would|should) (someone|people|I|we) use (it|this|that)\??\s*$/i,
  /^who would use (it|this|that)\??\s*$/i,
  /^(explain more|tell me more|what do you mean)\??\s*$/i,
];

export function isCopyRewriteIntent(prompt: string): boolean {
  const text = normalizePromptForRouting(prompt.trim());
  if (!text) return false;
  if (SALES_OUTREACH_INTENT.test(text)) return false;
  if (FOLLOW_UP_STRATEGY_INTENT.test(text)) return false;
  return (
    COPY_REWRITE_INTENT.test(text) ||
    SUPPORT_REWRITE_INTENT.test(text) ||
    FOLLOW_UP_MESSAGE_INTENT.test(text)
  );
}

export function isFastLaneDirectIntent(prompt: string): boolean {
  const text = normalizePromptForRouting(prompt.trim());
  if (!text) return false;
  if (SALES_OUTREACH_INTENT.test(text)) return false;
  if (COUNCIL_INTENT.test(text)) return false;
  return (
    FAST_LANE_DIRECT_INTENT.test(text) ||
    COPY_REWRITE_INTENT.test(text) ||
    SUPPORT_REWRITE_INTENT.test(text) ||
    LEGAL_POLICY_INTENT.test(text)
  );
}

/** Heuristic signals that must not be overridden to a council by the LLM router. */
export function forcesDirectAnswerRoute(prompt: string): boolean {
  const text = normalizePromptForRouting(prompt.trim());
  if (!text) return false;
  if (SALES_OUTREACH_INTENT.test(text)) return false;
  if (FOLLOW_UP_STRATEGY_INTENT.test(text)) return false;
  if (
    COPY_REWRITE_INTENT.test(text) ||
    SUPPORT_REWRITE_INTENT.test(text) ||
    LEGAL_POLICY_INTENT.test(text) ||
    FOLLOW_UP_MESSAGE_INTENT.test(text)
  ) {
    return true;
  }
  if (FAST_LANE_DIRECT_INTENT.test(text)) return true;
  if (DIRECT_PATTERNS.some((re) => re.test(text))) return true;
  return false;
}

/** Fast path: simple explanatory prompts that should not run the full council. */
export function detectDirectAnswer(prompt: string): boolean {
  const text = normalizePromptForRouting(prompt.trim());
  if (!text || text.length > 600) return false;
  if (forcesDirectAnswerRoute(text)) return true;
  if (SALES_INTENT.test(text)) return false;
  if (COUNCIL_INTENT.test(text)) return false;
  if (isEntitySearchIntent(text)) return false;

  const wordCount = text.split(/\s+/).length;
  if (wordCount > 80) return false;

  if (DIRECT_PATTERNS.some((re) => re.test(text))) return true;

  if (
    /\brewrite\b/i.test(text) &&
    /\b(hero|headline|copy|message|sentence|plain|clearer|corporate|jargon|understand)\b/i.test(text) &&
    !SALES_OUTREACH_INTENT.test(text)
  ) {
    return true;
  }

  if (
    /^(explain|what is|what's|define|describe|summarize|rewrite)\b/i.test(text) &&
    wordCount <= 35 &&
    !/\b(find|build|launch|prospect|competitor|audit|decide)\b/i.test(text)
  ) {
    return true;
  }

  return false;
}
