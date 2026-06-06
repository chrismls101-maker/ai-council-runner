/**
 * Listen Mode — thought-partner persona (integration point).
 *
 * Single source for Listen copy/tone: proactive thoughts, interrupt answers,
 * and report guidance. Product logic calls these helpers; do not scatter
 * persona strings across intelligence/guidance modules.
 *
 * SYNC: src/server/glass/activeListeningPrompt.ts (duplicated strings + contract test)
 */

import type { MediaContext } from "./mediaContextTypes.ts";
import type { ListenMoment, ListenMomentType } from "./listenMomentTypes.ts";
import {
  isActionFirstListenCard,
  isShallowListenThought,
  listenSpeakerLabel,
  mentionsAiToolWithoutContext,
} from "./listenInsightQuality.ts";
import type { ActiveListeningIntent } from "./activeListeningTypes.ts";
import type { CurrentMomentContextPayload } from "./currentMomentContext.ts";

export const LISTEN_MODE_PERSONA_NAME = "IIVO Listen Mode Thought Partner";

export interface ListenPersonaContext {
  mediaContext?: MediaContext | null;
  userGoalContext?: string;
}

export interface ListenProactiveThoughtInput {
  moment: Pick<ListenMoment, "type" | "transcriptAnchors" | "summary" | "suggestedThought">;
  ctx?: ListenPersonaContext;
}

export interface ListenProactiveThought {
  suggestedThought: string;
  reasonSelected: string;
}

/** Identity, role, tone, and default behavior for Listen Mode. */
export function getListenModePersonaCore(): string {
  return [
    `You are the ${LISTEN_MODE_PERSONA_NAME}.`,
    "You listen alongside the user to media or workflow audio — videos, podcasts, webinars, courses, or system audio.",
    "Your job is to notice meaningful ideas, explain why they matter, and answer questions grounded in what was actually said.",
    "Sound like a thoughtful person sitting next to them — not a notification bot, coach, or action planner.",
    "Default behavior: stay quiet unless you have something specific and grounded to add.",
    "When you speak: quote or paraphrase the transcript, name the idea clearly, and explain why it matters.",
    "Use \"the speaker\" unless channel or title appears in media context. Never identify people from faces.",
    "Do not invent quotes, names, claims, or audio the transcript does not support.",
  ].join(" ");
}

/** Hard rules extractable for tests and server sync. */
export function getListenModePersonaHardRules(): string[] {
  return [
    "Stay quiet unless the moment is grounded and worth surfacing.",
    "Do not identify people from facial recognition or screenshots.",
    "Do not claim microphone input in Listen mode — system audio only.",
    "Do not say \"your AI tool\" unless the user goal context mentions an AI tool.",
    "Do not surface ads, sponsor reads, or intros as main insights.",
    "Do not lead with action buttons or \"should we take action\" phrasing.",
    "Do not invent transcript lines or speaker names.",
    "Use source-agnostic language — never \"YouTube Mode\" or assume video-only.",
  ];
}

function excerptAnchor(anchor: string, max = 100): string {
  return anchor.length <= max ? anchor : `${anchor.slice(0, max - 1).trim()}…`;
}

/** Proactive card / moment thought — called from listenMomentIntelligence only. */
export function buildListenProactiveThought(
  input: ListenProactiveThoughtInput,
): ListenProactiveThought {
  const ctx = input.ctx ?? {};
  const speaker = listenSpeakerLabel(ctx);
  const anchor = input.moment.transcriptAnchors[0] ?? input.moment.summary;
  const excerpt = excerptAnchor(anchor);
  const lowerExcerpt = excerpt.charAt(0).toLowerCase() + excerpt.slice(1);

  let result: ListenProactiveThought;

  switch (input.moment.type) {
    case "warning":
      result = {
        suggestedThought: `${speaker} is warning that ${lowerExcerpt} — worth noting before the content moves on.`,
        reasonSelected:
          "The speaker flagged a caution that may affect how you interpret the rest of the segment.",
      };
      break;
    case "framework":
      result = {
        suggestedThought: `What ${speaker} is laying out here is a framework: "${excerpt}". The important part is how the pieces connect.`,
        reasonSelected:
          "Structured frameworks are easier to reuse later if you capture them while the explanation is fresh.",
      };
      break;
    case "claim":
      result = {
        suggestedThought: `${speaker} makes a claim worth examining: "${excerpt}". I'd keep listening for the evidence behind it.`,
        reasonSelected:
          "Strong claims are most useful when you note both the assertion and what supports it.",
      };
      break;
    case "business_opportunity":
    case "sales_tactic":
      result = {
        suggestedThought: `${speaker} highlights a business angle: "${excerpt}". This could matter for positioning or go-to-market later.`,
        reasonSelected:
          "Market and distribution language often signals ideas worth revisiting in a report.",
      };
      break;
    case "confusing_concept":
      result = {
        suggestedThought: `${speaker} introduces a concept that may need unpacking: "${excerpt}". The definition matters for everything that follows.`,
        reasonSelected:
          "Key distinctions are easier to follow when you name them while the explanation is still fresh.",
      };
      break;
    case "implementation_idea":
    case "prompt_idea":
      result = {
        suggestedThought: `${speaker} points to a practical application: "${excerpt}". Worth noting even if you are not acting on it now.`,
        reasonSelected:
          "Implementation and prompt ideas are high-signal when tied to a specific moment in the audio.",
      };
      break;
    case "key_idea":
    default:
      result = {
        suggestedThought: `What ${speaker} is really saying here: ${lowerExcerpt}. The important part is why this idea matters in the larger argument.`,
        reasonSelected:
          "This stood out as a high-signal idea — captured as interpretation, not transcript copy.",
      };
      break;
  }

  if (mentionsAiToolWithoutContext(result.suggestedThought, ctx.userGoalContext)) {
    result = {
      ...result,
      suggestedThought: result.suggestedThought.replace(/\bfor your AI tool\b/gi, "for later"),
    };
  }

  return result;
}

const INTERRUPT_INTENT_GUIDANCE: Partial<Record<ActiveListeningIntent, string>> = {
  ask_thoughts:
    "Give your thoughtful take on what the speaker just said. Quote or paraphrase specific lines. Explain why it matters. Do not ask the user to take action unless they asked.",
  explain_current_moment:
    "Explain what the speaker meant using specific terms from the recent transcript. Say what they appear to be arguing and why it matters.",
  agree_disagree:
    "Give a balanced take. Separate what the speaker said (from transcript) from your interpretation. Do not overclaim certainty.",
  apply_current_moment:
    "Explain how the recent point might apply in general terms, grounded in what was actually said.",
  summarize_recent:
    "Extract 3–5 key points from the last few minutes. Mention specific terms and topics heard.",
  what_did_i_miss:
    "Summarize the most important ideas from the recent transcript window. Be specific — no generic advice.",
  create_asset:
    "Generate the requested asset using ONLY content from the recent transcript.",
  create_script:
    "Write a short script grounded in what the speaker just said. Use their key phrases where possible.",
  prompt_generation:
    "Create a practical prompt grounded in the recent transcript moment.",
  action_steps:
    "Turn the recent content into concrete action steps tied to what was actually said.",
  turn_into_action:
    "Turn the recent content into concrete action steps tied to what was actually said.",
  save_moment:
    "Confirm what to save and summarize the moment in one sentence from the transcript.",
};

function momentStatusGuidance(
  cm: CurrentMomentContextPayload | undefined,
): string | undefined {
  if (!cm) return undefined;
  switch (cm.momentContextStatus) {
    case "thin":
      return (
        'Context is thin — tell the user: "I\'m still building context from the audio. I need a little more transcript, or ask about a specific line."'
      );
    case "stale":
      return (
        "Start by noting you are answering from the last captured part and the content may have moved on."
      );
    case "paused":
      return "Answering from the last captured moment — the audio may have paused.";
    case "ready":
      return "Use the recent transcript window (last ~30–120 seconds) as your primary source.";
    default:
      return undefined;
  }
}

/** Extra guidance block for user interrupt asks (typed / Voice). */
export function buildListenInterruptPersonaGuidance(opts: {
  intent?: ActiveListeningIntent;
  momentType?: ListenMomentType;
  ctx?: ListenPersonaContext;
  currentMoment?: CurrentMomentContextPayload;
}): string {
  const lines: string[] = [
    getListenModePersonaCore(),
    "",
    "Hard rules:",
    ...getListenModePersonaHardRules().map((r) => `- ${r}`),
  ];

  const statusHint = momentStatusGuidance(opts.currentMoment);
  if (statusHint) {
    lines.push("", "Current moment:", statusHint);
  }

  const intent = opts.intent ?? "general_contextual";
  const intentLine = INTERRUPT_INTENT_GUIDANCE[intent];
  if (intentLine) {
    lines.push("", `Intent (${intent}):`, intentLine);
  }

  lines.push(
    "",
    "Answer template:",
    "- If ready: quote or paraphrase what was said → your take → why it matters.",
    "- If thin: say you need more transcript; invite a specific line or wait for more audio.",
    "- If stale: note you are answering from the last captured part; the content may have moved on.",
  );

  return lines.join("\n");
}

/** Guidance for Listen Report section copy. */
export function buildListenReportPersonaGuidance(_ctx?: ListenPersonaContext): string {
  return [
    `${LISTEN_MODE_PERSONA_NAME} report tone:`,
    "Ground every item in transcript anchors or surfaced thoughts.",
    "Use source-agnostic language (media/audio, not video-only).",
    "No action-button-first phrasing; no invented speaker names.",
    "When context was thin, say what was missing instead of padding with generic advice.",
  ].join(" ");
}

/** Weak vs strong copy grading for harness / QA reuse. */
export function gradeListenThoughtCopy(
  text: string,
  userGoalContext?: string,
): "weak" | "strong" {
  const t = text.trim();
  if (!t || isShallowListenThought(t)) return "weak";
  if (isActionFirstListenCard(t)) return "weak";
  if (mentionsAiToolWithoutContext(t, userGoalContext)) return "weak";
  if (t.length < 48) return "weak";
  return "strong";
}
