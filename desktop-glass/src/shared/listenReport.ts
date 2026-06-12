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
import type { ListenSegmentKind } from "./listenSegmentClassifier.ts";
import type { ListenCheckpointSummary } from "./listenCheckpoint.ts";
import {
  checkpointSummaryToMarkdown,
  listenCheckpointsFromSessionEvents,
} from "./listenCheckpoint.ts";
import { buildListenReportPersonaGuidance } from "./listenModePersona.ts";
import { buildListenLiveNotes } from "./listenLiveNotes.ts";

export interface ListenReportInput {
  session: GlassSession;
  moments: ListenMoment[];
  mediaContext?: MediaContext | null;
  checkpoints?: ListenCheckpointSummary[];
}

function mediaFromSession(session: GlassSession): MediaContext | undefined {
  for (const e of [...session.events].reverse()) {
    const meta = e.metadata as { mediaContext?: MediaContext } | undefined;
    if (meta?.mediaContext) return meta.mediaContext;
  }
  return undefined;
}

const IGNORED_SEGMENT_KINDS: ListenSegmentKind[] = ["ad", "sponsor", "intro"];

export function isMainContentListenMoment(moment: ListenMoment): boolean {
  const kind = moment.segmentKind;
  if (!kind) return true;
  return !IGNORED_SEGMENT_KINDS.includes(kind);
}

function momentLines(moments: ListenMoment[], statuses: ListenMoment["status"][], max = 8): string[] {
  return moments
    .filter((m) => statuses.includes(m.status) && isMainContentListenMoment(m))
    .slice(0, max)
    .map((m) => {
      const anchor = m.transcriptAnchors[0] ? ` — "${m.transcriptAnchors[0].slice(0, 100)}"` : "";
      return `${m.suggestedThought ?? m.summary}${anchor}`;
    });
}

function ignoredSegmentLines(moments: ListenMoment[], max = 6): string[] {
  return moments
    .filter((m) => !isMainContentListenMoment(m))
    .slice(0, max)
    .map((m) => {
      const kind = m.segmentKind ?? "unknown";
      const anchor = m.transcriptAnchors[0]?.slice(0, 80) ?? m.summary.slice(0, 80);
      return `[${kind}] ${anchor}`;
    });
}

function whatThisMeansLines(moments: ListenMoment[], max = 3): string[] {
  const ranked = moments
    .filter(isMainContentListenMoment)
    .filter((m) => ["ready", "surfaced", "saved_silently"].includes(m.status))
    .slice(0, max * 2);

  const lines: string[] = [];
  for (const m of ranked) {
    const why = m.reasonSelected?.trim();
    const thought = m.suggestedThought?.trim();
    if (why && why.length >= 24) {
      lines.push(why);
    } else if (thought) {
      lines.push(thought);
    }
    if (lines.length >= max) break;
  }
  return lines.slice(0, max);
}

export function buildListenReportSections(input: ListenReportInput): GlassCopilotDebriefSection[] {
  const media = input.mediaContext ?? mediaFromSession(input.session) ?? null;
  const moments = input.moments;
  const contentMoments = moments.filter(isMainContentListenMoment);
  const checkpoints =
    input.checkpoints ?? listenCheckpointsFromSessionEvents(input.session.events);
  const liveNotes = buildListenLiveNotes({ moments: contentMoments, checkpoints });

  const SOURCE_TYPE_LABELS: Record<string, string> = {
    youtube: "YouTube",
    podcast: "Podcast",
    webinar: "Webinar",
    course: "Online Course",
    browser_audio: "Web Video",
  };

  const sourceLines: string[] = [];
  if (media?.title) sourceLines.push(`Title: ${media.title}`);
  if (media?.channelOrSource) sourceLines.push(`Channel/source: ${media.channelOrSource}`);
  if (media?.sourceType && media.sourceType !== "unknown") {
    sourceLines.push(`Platform: ${SOURCE_TYPE_LABELS[media.sourceType] ?? media.sourceType}`);
  }
  if (media?.url) sourceLines.push(`URL: ${media.url}`);
  if (media?.durationLabel) sourceLines.push(`Duration: ${media.durationLabel}`);
  if (!sourceLines.length) sourceLines.push("Screen context unavailable — report based on audio transcript.");

  const whatThisMeans = whatThisMeansLines(contentMoments);
  const openQuestions = contentMoments
    .filter((m) => m.suggestedQuestion)
    .map((m) => m.suggestedQuestion!)
    .slice(0, 6);
  const actions = contentMoments
    .filter((m) => m.suggestedAction || m.type === "action_step")
    .map((m) => m.suggestedAction ?? m.summary)
    .slice(0, 6);
  const ignored = ignoredSegmentLines(moments);

  const bestInsights = momentLines(
    contentMoments.filter((m) => m.importance === "high" || m.status === "surfaced"),
    ["ready", "surfaced", "saved_silently"],
    8,
  );
  const concepts =
    liveNotes.sections.concepts.length > 0
      ? liveNotes.sections.concepts
      : contentMoments
          .filter((m) => m.type === "confusing_concept")
          .map((m) => m.suggestedThought ?? m.summary)
          .slice(0, 6);
  const keyIdeas =
    liveNotes.sections.keyIdeas.length > 0
      ? liveNotes.sections.keyIdeas
      : momentLines(contentMoments, ["ready", "surfaced", "saved_silently"], 8);
  const quotes =
    liveNotes.sections.quotes.length > 0
      ? liveNotes.sections.quotes
      : contentMoments
          .filter((m) => m.type === "quote")
          .map((m) => m.suggestedThought ?? m.summary)
          .slice(0, 6);
  const questions =
    liveNotes.sections.questions.length > 0
      ? liveNotes.sections.questions
      : openQuestions;
  const actionIdeas =
    liveNotes.sections.actionIdeas.length > 0
      ? liveNotes.sections.actionIdeas
      : actions.length
        ? actions
        : ["No explicit action ideas captured — review key ideas if needed."];
  const missed = momentLines(contentMoments, ["stale"], 6);
  const finalTakeaway =
    whatThisMeans.length > 0
      ? whatThisMeans[0]!
      : keyIdeas[0] ?? "Review Live Notes and transcript for the main takeaway from this session.";

  const aboutText =
    (checkpoints.length > 0
      ? checkpoints.map((cp) => cp.topicSummary).filter(Boolean).slice(-3).join(" · ") ||
        liveNotes.currentTopic
      : liveNotes.currentTopic ??
        media?.visibleTextSummary?.slice(0, 200) ??
        "Summary from Live Notes and session checkpoints — not full transcript replay.") ?? "Summary from Live Notes.";

  const sections: GlassCopilotDebriefSection[] = [
    { heading: "Source", items: sourceLines },
    { heading: "What this was about", items: [aboutText] },
    {
      heading: "Core ideas",
      items: keyIdeas.length ? keyIdeas : ["No strong key ideas captured — audio may have been thin."],
    },
    {
      heading: "Concepts explained",
      items: concepts.length ? concepts : ["No concepts captured yet — keep listening or review transcript."],
    },
    {
      heading: "Best insights",
      items: bestInsights.length
        ? bestInsights
        : keyIdeas.length
          ? keyIdeas.slice(0, 4)
          : ["No high-signal insights captured."],
    },
    {
      heading: "Important quotes/paraphrases",
      items: quotes.length ? quotes : ["No notable quotes captured."],
    },
    {
      heading: "Questions worth revisiting",
      items: questions.length ? questions : ["Review the recording or transcript for follow-ups."],
    },
    {
      heading: "Action ideas",
      items: actionIdeas,
    },
    {
      heading: "What you may have missed",
      items: missed.length ? missed : ["No stale moments worth revisiting."],
    },
    { heading: "Final takeaway", items: [finalTakeaway] },
  ];

  const thinReport = contentMoments.length === 0 && checkpoints.length === 0;
  if (thinReport) {
    sections[1]!.items = [
      "Not enough main-content moments were captured — audio may have been thin, muted, or mostly ads/intros.",
    ];
  }

  if (ignored.length) {
    sections.push({
      heading: "Ignored / possible ad · sponsor · intro",
      items: ignored,
    });
  }

  if (checkpoints.length) {
    sections.splice(2, 0, {
      heading: "Session checkpoints",
      items: checkpoints.map((cp) => checkpointSummaryToMarkdown(cp).replace(/\n/g, " · ")),
    });
  } else if (input.checkpoints?.length) {
    sections.push({
      heading: "Session checkpoints",
      items: input.checkpoints.map((cp) => checkpointSummaryToMarkdown(cp).replace(/\n/g, " · ")),
    });
  }

  return sections;
}

export function buildListenReportMarkdown(sections: GlassCopilotDebriefSection[]): string {
  const personaNote = buildListenReportPersonaGuidance();
  const lines = [
    "# Listen Report",
    "",
    `_${personaNote}_`,
    "",
  ];
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
