/**
 * Listen mode — insight quality, speaker/source phrasing, shallow-thought rejection.
 *
 * Pure — no electron / fs.
 */

import type { MediaContext } from "./mediaContextTypes.ts";
import type { ListenMoment } from "./listenMomentTypes.ts";
import { listenCardTextIsVague } from "./listenThoughtCards.ts";

const SHALLOW_PATTERNS = [
  /^that sounds like a risk/i,
  /^this sounds like a risk/i,
  /^that sounds like an action/i,
  /should we take action/i,
  /^want me to diagnose/i,
  /^important warning:?$/i,
  /^notable line worth saving/i,
];

const ACTION_FIRST_PATTERNS = [
  /want me to .+\?/i,
  /should we take action/i,
  /turn it into an action plan/i,
  /create .+ from this/i,
];

const AI_TOOL_ASSUMPTION = /\b(your AI tool|for your AI tool|your ai tool)\b/i;

export interface ListenSpeakerContext {
  mediaContext?: MediaContext | null;
  userGoalContext?: string;
}

/** Speaker label — never invent names; use channel/title from media when available. */
export function listenSpeakerLabel(ctx: ListenSpeakerContext): string {
  const channel = ctx.mediaContext?.channelOrSource?.trim();
  if (channel) return `the speaker (${channel})`;
  const title = ctx.mediaContext?.title?.trim();
  if (title && title.length < 80) {
    return "the speaker in this video";
  }
  return "the speaker";
}

export function listenSourceAttribution(ctx: ListenSpeakerContext): string | undefined {
  const parts: string[] = [];
  if (ctx.mediaContext?.channelOrSource) parts.push(ctx.mediaContext.channelOrSource);
  else if (ctx.mediaContext?.title) parts.push(ctx.mediaContext.title);
  if (!parts.length) return undefined;
  return `This video/source appears to be from ${parts[0]}.`;
}

export function isShallowListenThought(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (listenCardTextIsVague(t)) return true;
  if (SHALLOW_PATTERNS.some((re) => re.test(t))) return true;
  if (t.length < 48 && /\b(risk|action|diagnose)\b/i.test(t)) return true;
  return false;
}

export function isActionFirstListenCard(text: string): boolean {
  return ACTION_FIRST_PATTERNS.some((re) => re.test(text));
}

export function mentionsAiToolWithoutContext(text: string, userGoalContext?: string): boolean {
  if (!AI_TOOL_ASSUMPTION.test(text)) return false;
  if (!userGoalContext?.trim()) return true;
  return !/\bai tool|cursor|copilot|assistant\b/i.test(userGoalContext);
}

export function listenThoughtHasAnchor(moment: ListenMoment): boolean {
  const anchor = moment.transcriptAnchors[0]?.trim();
  if (!anchor || anchor.length < 24) return false;
  const thought = moment.suggestedThought ?? "";
  if (thought.includes('"') && thought.length > anchor.length * 0.3) return true;
  const words = anchor.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
  const hit = words.filter((w) => thought.toLowerCase().includes(w)).length;
  return hit >= Math.min(2, words.length);
}

export function listenThoughtHasWhyItMatters(moment: ListenMoment): boolean {
  const why = moment.reasonSelected?.trim();
  return Boolean(why && why.length >= 24 && !isShallowListenThought(why));
}

/** Moment copy is grounded enough to surface as a live card. */
export function isGroundedListenInsight(
  moment: ListenMoment,
  ctx: ListenSpeakerContext = {},
): boolean {
  const thought = (moment.suggestedThought ?? moment.summary).trim();
  if (isShallowListenThought(thought)) return false;
  if (!listenThoughtHasAnchor(moment)) return false;
  if (!listenThoughtHasWhyItMatters(moment)) return false;
  if (mentionsAiToolWithoutContext(thought, ctx.userGoalContext)) return false;
  if (isActionFirstListenCard(thought)) return false;
  return true;
}

/** Build a thoughtful, grounded observation from moment + media context. */
export function buildGroundedListenThought(
  moment: Pick<ListenMoment, "type" | "transcriptAnchors" | "summary" | "suggestedThought">,
  ctx: ListenSpeakerContext = {},
): { suggestedThought: string; reasonSelected: string } {
  const speaker = listenSpeakerLabel(ctx);
  const anchor = moment.transcriptAnchors[0] ?? moment.summary;
  const excerpt =
    anchor.length <= 100 ? anchor : `${anchor.slice(0, 97).trim()}…`;

  switch (moment.type) {
    case "warning":
      return {
        suggestedThought: `${speaker} is warning that ${excerpt.charAt(0).toLowerCase()}${excerpt.slice(1)} — worth noting before the video moves on.`,
        reasonSelected: "The speaker flagged a caution that may affect how you interpret the rest of the segment.",
      };
    case "framework":
      return {
        suggestedThought: `What ${speaker} is laying out here is a framework: "${excerpt}". The important part is how the pieces connect.`,
        reasonSelected: "Structured frameworks are easier to reuse later if you capture them while the explanation is fresh.",
      };
    case "claim":
      return {
        suggestedThought: `${speaker} makes a claim worth examining: "${excerpt}". I'd keep listening for the evidence behind it.`,
        reasonSelected: "Strong claims are most useful when you note both the assertion and what supports it.",
      };
    case "business_opportunity":
    case "sales_tactic":
      return {
        suggestedThought: `${speaker} highlights a business angle: "${excerpt}". This could matter for positioning or go-to-market later.`,
        reasonSelected: "Market and distribution language often signals ideas worth revisiting in a report.",
      };
    case "key_idea":
    default:
      return {
        suggestedThought: `The important part here is that ${speaker} says ${excerpt.charAt(0).toLowerCase()}${excerpt.slice(1)}`,
        reasonSelected: "This stood out as a high-signal idea in the recent transcript.",
      };
  }
}
