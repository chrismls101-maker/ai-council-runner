/**
 * Listen mode — auto-surfaced IIVO thought cards.
 *
 * Thought-first cards with specific titles and context — never vague "this" prompts.
 */

import type { GlassCopilotIntervention } from "./copilotTypes.ts";
import type { ListenMoment, ListenMomentType } from "./listenMomentTypes.ts";

const TYPE_TITLES: Record<ListenMomentType, string> = {
  key_idea: "Founder insight",
  framework: "Framework moment",
  tactic: "Tactic worth noting",
  warning: "Useful warning",
  example: "Example captured",
  claim: "Claim to examine",
  number_stat: "Notable number",
  entity_mention: "Mention noted",
  business_opportunity: "Business angle",
  sales_tactic: "Sales tactic",
  implementation_idea: "Implementation idea",
  confusing_concept: "Needs clarification",
  quote: "Notable quote",
  action_step: "Action step",
  prompt_idea: "Prompt opportunity",
};

const VAGUE_THIS_RE =
  /\b(create|turn|make|save|apply)\s+(a\s+)?(prompt|action|script|plan|steps?)\s+from\s+this\b/i;

export interface ListenThoughtFeedContent {
  title: string;
  body: string;
  fullBody: string;
  contextLine: string;
  whyItMatters: string;
  sourceAnchor: string;
}

function excerpt(anchor: string, max = 90): string {
  const clean = anchor.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function anchorLine(moment: ListenMoment): string {
  const anchor = moment.transcriptAnchors[0] ?? moment.summary;
  return excerpt(anchor, 100);
}

/** Build card copy with specific referent — no naked "this". */
export function buildListenThoughtFeedContent(moment: ListenMoment): ListenThoughtFeedContent {
  const title = TYPE_TITLES[moment.type] ?? "IIVO thought";
  const anchor = anchorLine(moment);
  const thought = (moment.suggestedThought ?? moment.summary).replace(/\s+/g, " ").trim();
  const whyItMatters =
    moment.reasonSelected ??
    "This stood out in what you were listening to and may be worth revisiting later.";

  const contextLine = `From the video: "${anchor}"`;
  const sourceAnchor = contextLine;
  const body = `${thought} I saved this for your Listen Report.`;
  const fullBody = [
    title,
    "",
    contextLine,
    "",
    thought,
    "",
    `Why it matters: ${whyItMatters}`,
    "",
    "Saved automatically — expand for full text. Actions are optional.",
  ].join("\n");

  return {
    title,
    body: body.length > 160 ? `${body.slice(0, 157)}…` : body,
    fullBody,
    contextLine,
    whyItMatters,
    sourceAnchor,
  };
}

/** Fail QA / lint if card copy is vague. */
export function listenCardTextIsVague(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (VAGUE_THIS_RE.test(t)) return true;
  if (/\bturn this into\b/i.test(t) && !/From the video:/i.test(t)) return true;
  if (/\bcreate .+ from this\b/i.test(t)) return true;
  if (/^that sounds like a risk/i.test(t)) return true;
  if (/should we take action/i.test(t)) return true;
  return false;
}

export function buildListenThoughtIntervention(
  moment: ListenMoment,
  deps: { idFactory: () => string; clock: () => string },
): GlassCopilotIntervention {
  const feed = buildListenThoughtFeedContent(moment);
  return {
    id: deps.idFactory(),
    kind: "generic",
    title: feed.title,
    body: feed.body,
    buttons: [
      { action: "save", label: "Saved", primary: true },
      { action: "turn-into-action", label: "Expand", primary: false },
      { action: "dismiss", label: "Dismiss" },
    ],
    createdAt: deps.clock(),
  };
}

/** Collapsed + full bodies for overlay feed cards. */
export function listenThoughtFeedBodies(moment: ListenMoment): {
  title: string;
  body: string;
  fullBody: string;
} {
  const feed = buildListenThoughtFeedContent(moment);
  return { title: feed.title, body: feed.body, fullBody: feed.fullBody };
}
