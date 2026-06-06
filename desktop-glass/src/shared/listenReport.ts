/**
 * Listen mode — end-of-session report builder.
 *
 * Deterministic markdown from saved/surfaced moments and media context.
 * Pure — no electron / fs.
 */

import type { GlassCopilotDebriefSection } from "./copilotTypes.ts";
import type { GlassSession, GlassSessionEvent } from "./sessionTypes.ts";
import type { ListenMoment } from "./listenMomentTypes.ts";
import type { MediaContext } from "./mediaContextTypes.ts";

export interface ListenReportInput {
  session: GlassSession;
  moments: ListenMoment[];
  mediaContext?: MediaContext | null;
}

function mediaFromSession(session: GlassSession): MediaContext | undefined {
  for (const e of [...session.events].reverse()) {
    const meta = e.metadata as { mediaContext?: MediaContext } | undefined;
    if (meta?.mediaContext) return meta.mediaContext;
  }
  return undefined;
}

function momentLines(moments: ListenMoment[], statuses: ListenMoment["status"][], max = 8): string[] {
  return moments
    .filter((m) => statuses.includes(m.status))
    .slice(0, max)
    .map((m) => {
      const anchor = m.transcriptAnchors[0] ? ` — "${m.transcriptAnchors[0].slice(0, 100)}"` : "";
      return `${m.suggestedThought ?? m.summary}${anchor}`;
    });
}

export function buildListenReportSections(input: ListenReportInput): GlassCopilotDebriefSection[] {
  const media = input.mediaContext ?? mediaFromSession(input.session) ?? null;
  const moments = input.moments;

  const sourceLines: string[] = [];
  if (media?.title) sourceLines.push(`Title: ${media.title}`);
  if (media?.channelOrSource) sourceLines.push(`Channel/source: ${media.channelOrSource}`);
  if (media?.sourceType) sourceLines.push(`Platform: ${media.sourceType}`);
  if (media?.url) sourceLines.push(`URL: ${media.url}`);
  if (media?.durationLabel) sourceLines.push(`Duration: ${media.durationLabel}`);
  if (!sourceLines.length) sourceLines.push("Screen context unavailable — report based on audio transcript.");

  const bestIdeas = momentLines(
    moments,
    ["ready", "surfaced", "saved_silently"],
  );
  const iivoThoughts = momentLines(moments, ["surfaced", "saved_silently"]);
  const actions = moments
    .filter((m) => m.suggestedAction || m.type === "action_step")
    .map((m) => m.suggestedAction ?? m.summary)
    .slice(0, 6);
  const prompts = moments
    .filter((m) => m.type === "prompt_idea" || m.type === "implementation_idea")
    .map((m) => m.suggestedThought ?? m.summary)
    .slice(0, 6);
  const sales = moments
    .filter((m) => m.type === "sales_tactic" || m.type === "business_opportunity")
    .map((m) => m.suggestedThought ?? m.summary)
    .slice(0, 6);
  const entities = moments
    .filter((m) => m.type === "entity_mention")
    .map((m) => m.summary)
    .slice(0, 8);
  const missed = momentLines(moments, ["stale"], 6);
  const openQuestions = moments
    .filter((m) => m.suggestedQuestion)
    .map((m) => m.suggestedQuestion!)
    .slice(0, 6);

  const about = media?.visibleTextSummary?.slice(0, 200) ?? "Summary from captured transcript and IIVO moments.";

  return [
    { heading: "Source", items: sourceLines },
    { heading: "What this was about", items: [about] },
    { heading: "Best ideas", items: bestIdeas.length ? bestIdeas : ["No strong ideas captured — transcript may have been thin."] },
    { heading: "IIVO thoughts", items: iivoThoughts.length ? iivoThoughts : ["No proactive thoughts surfaced — check Quiet mode or thin audio."] },
    { heading: "Action steps", items: actions.length ? actions : ["No explicit action steps detected."] },
    { heading: "Prompts / scripts / assets", items: prompts.length ? prompts : ["None generated during this session."] },
    { heading: "Sales/business applications", items: sales.length ? sales : ["Not applicable or not detected."] },
    { heading: "Tools / people / companies mentioned", items: entities.length ? entities : ["None noted."] },
    { heading: "What you may have missed", items: missed.length ? missed : ["No stale moments worth revisiting."] },
    { heading: "Open questions", items: openQuestions.length ? openQuestions : ["Review the recording or transcript for follow-ups."] },
  ];
}

export function buildListenReportMarkdown(sections: GlassCopilotDebriefSection[]): string {
  const lines = ["# Listen Report", ""];
  for (const section of sections) {
    lines.push(`## ${section.heading}`, "");
    for (const item of section.items) lines.push(`- ${item}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

/** Extract listen moments persisted on session events. */
export function listenMomentsFromSessionEvents(events: GlassSessionEvent[]): ListenMoment[] {
  const out: ListenMoment[] = [];
  for (const e of events) {
    if (!e.tags?.includes("listen_moment")) continue;
    const meta = e.metadata as { listenMoment?: ListenMoment } | undefined;
    if (meta?.listenMoment) out.push(meta.listenMoment);
  }
  return out;
}
