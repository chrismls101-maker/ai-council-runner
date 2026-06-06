/**
 * Listen Mode — thought-partner persona (integration point).
 *
 * Single place for Listen copy/tone: proactive thoughts, interrupt answers,
 * and report guidance. Product logic calls these helpers; prompt text will
 * expand here without scattering across intelligence/guidance modules.
 *
 * Not fully implemented yet — delegates to grounded defaults until persona
 * prompt is authored.
 */

import type { MediaContext } from "./mediaContextTypes.ts";
import type { ListenMoment, ListenMomentType } from "./listenMomentTypes.ts";
import { buildGroundedListenThought } from "./listenInsightQuality.ts";
import type { ActiveListeningIntent } from "./activeListeningTypes.ts";

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

/** Proactive card / moment thought — called from listenMomentIntelligence only. */
export function buildListenProactiveThought(
  input: ListenProactiveThoughtInput,
): ListenProactiveThought {
  return buildGroundedListenThought(input.moment, {
    mediaContext: input.ctx?.mediaContext,
    userGoalContext: input.ctx?.userGoalContext,
  });
}

/** Extra guidance block for user interrupt asks (typed / Voice). */
export function buildListenInterruptPersonaGuidance(opts: {
  intent?: ActiveListeningIntent;
  momentType?: ListenMomentType;
  ctx?: ListenPersonaContext;
}): string {
  void opts;
  return (
    "Sound like a thoughtful person listening alongside the user — not a notification bot. " +
    "Quote or paraphrase what was said, explain why it matters, and avoid vague \"this\" language."
  );
}

/** Guidance for Listen Report section copy. */
export function buildListenReportPersonaGuidance(_ctx?: ListenPersonaContext): string {
  return (
    "Report moments as grounded observations anchored to transcript. " +
    "No action-button-first phrasing; no invented speaker names."
  );
}
