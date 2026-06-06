/**
 * Session Copilot — "I'm done" debrief trigger + deterministic debrief builder.
 *
 * The debrief is assembled locally from the session timeline and copilot
 * insights. A direct (non-Council) AI pass can optionally enrich it, but the
 * deterministic build always produces a usable report on its own.
 *
 * Pure — no electron / fs.
 */

import type { GlassSession, GlassSessionEvent } from "./sessionTypes.ts";
import {
  type GlassCopilotDebrief,
  type GlassCopilotDebriefSection,
  type GlassCopilotInsight,
  type GlassCopilotInsightType,
  type GlassCopilotReportStyle,
} from "./copilotTypes.ts";
import type { GlassCopilotSessionType, SessionTypeDetectionResult } from "./copilotSessionType.ts";
import { SESSION_TYPE_LABELS } from "./copilotSessionType.ts";
import {
  buildBusinessMeetingDebrief,
  detectMissingMeetingFields,
  extractMeetingIntelligence,
  MEETING_MISSING_LABELS,
  type MeetingIntelligence,
} from "./meetingIntelligence.ts";
import {
  buildListenReportMarkdown,
  buildListenReportSections,
  listenMomentsFromSessionEvents,
} from "./listenReport.ts";
import { buildListenReportPersonaGuidance } from "./listenModePersona.ts";
import type { ListenMoment } from "./listenMomentTypes.ts";
import type { MediaContext } from "./mediaContextTypes.ts";

export interface DebriefOptions {
  sessionType?: GlassCopilotSessionType;
  sessionTypeDetection?: SessionTypeDetectionResult;
  reportStyle?: GlassCopilotReportStyle;
  listenMoments?: ListenMoment[];
  mediaContext?: MediaContext | null;
}

const DEBRIEF_TRIGGER_PHRASES = [
  "i'm done",
  "im done",
  "i am done",
  "finish session",
  "give me the report",
  "what happened",
  "summarize this session",
  "summarise this session",
  "debrief me",
  "debrief",
];

/** True when the user's text asks to wrap up / get a report. */
export function detectDebriefTrigger(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[^a-z0-9'\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  return DEBRIEF_TRIGGER_PHRASES.some((phrase) => normalized.includes(phrase));
}

function eventText(event: GlassSessionEvent): string {
  return (event.text ?? event.title).replace(/\s+/g, " ").trim();
}

/** Concatenate transcript/note/screen text for meeting extraction. */
function meetingTextFromSession(session: GlassSession): string {
  const parts: string[] = [];
  for (const e of session.events) {
    if (e.kind === "transcript_note" || e.kind === "manual_note" || e.kind === "screen_capture") {
      parts.push(e.text ?? e.title ?? "");
    }
  }
  return parts.filter(Boolean).join("\n");
}

export function meetingIntelligenceForSession(session: GlassSession): MeetingIntelligence {
  return extractMeetingIntelligence(meetingTextFromSession(session), { topic: session.title });
}

/** Items + explicit "missing" call-outs, never invented. */
function withMissing(items: string[], missingLabel: string): string[] {
  return items.length ? items : [missingLabel];
}

function dedupeStrings(values: string[], max: number): string[] {
  const out: string[] = [];
  for (const value of values) {
    const clean = value.trim();
    if (!clean) continue;
    if (out.some((o) => o.toLowerCase() === clean.toLowerCase())) continue;
    out.push(clean);
    if (out.length >= max) break;
  }
  return out;
}

function byType(
  insights: GlassCopilotInsight[],
  type: GlassCopilotInsightType,
): string[] {
  return insights.filter((i) => i.type === type && i.userDecision !== "dismissed").map((i) => i.text);
}

function quotesFrom(session: GlassSession, max: number): string[] {
  const transcriptEvents = session.events.filter((e) => e.kind === "transcript_note");
  // Prefer longer, content-bearing lines.
  return dedupeStrings(
    [...transcriptEvents]
      .map(eventText)
      .filter((t) => t.split(/\s+/).length >= 4)
      .sort((a, b) => b.length - a.length),
    max,
  );
}

function whatHappened(session: GlassSession): string[] {
  const counts = new Map<string, number>();
  for (const e of session.events) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  const parts: string[] = [];
  const transcript = counts.get("transcript_note") ?? 0;
  const captures = counts.get("screen_capture") ?? 0;
  const commands = counts.get("iivo_command") ?? 0;
  if (transcript) parts.push(`${transcript} transcript moment${transcript === 1 ? "" : "s"} captured`);
  if (captures) parts.push(`${captures} screen capture${captures === 1 ? "" : "s"}`);
  if (commands) parts.push(`${commands} IIVO command${commands === 1 ? "" : "s"}`);
  const result = parts.length
    ? [`Session “${session.title}” — ${parts.join(", ")}.`]
    : [`Session “${session.title}”.`];
  return result;
}

function recommendedNextSteps(insights: GlassCopilotInsight[]): string[] {
  const actions = byType(insights, "action");
  const risks = byType(insights, "risk");
  const steps: string[] = [];
  for (const a of actions) steps.push(`Do: ${a}`);
  for (const r of risks) steps.push(`Resolve: ${r}`);
  return dedupeStrings(steps, 6);
}

/** The full, general-purpose section set (used for general_workflow). */
function generalSections(
  session: GlassSession,
  insights: GlassCopilotInsight[],
  cap: number,
): GlassCopilotDebriefSection[] {
  return [
    { heading: "What happened", items: whatHappened(session) },
    { heading: "Key ideas", items: dedupeStrings(byType(insights, "key_idea"), cap) },
    { heading: "Important quotes / transcript moments", items: quotesFrom(session, cap) },
    { heading: "Actions", items: dedupeStrings(byType(insights, "action"), cap) },
    { heading: "Risks / blockers", items: dedupeStrings(byType(insights, "risk"), cap) },
    { heading: "Opportunities", items: dedupeStrings(byType(insights, "opportunity"), cap) },
    {
      heading: "What IIVO noticed",
      items: dedupeStrings(byType(insights, "summary_note").concat(byType(insights, "hypothesis")), cap),
    },
    { heading: "Recommended next steps", items: recommendedNextSteps(insights) },
    {
      heading: "Suggested prompts / follow-ups",
      items: dedupeStrings(byType(insights, "cursor_prompt_candidate"), cap),
    },
    { heading: "What to save to memory", items: dedupeStrings(byType(insights, "memory_candidate"), cap) },
    { heading: "Open questions", items: dedupeStrings(byType(insights, "question"), cap) },
  ];
}

/** Pick a section set tailored to the session type. */
function sectionsForType(
  sessionType: GlassCopilotSessionType,
  session: GlassSession,
  insights: GlassCopilotInsight[],
  cap: number,
): GlassCopilotDebriefSection[] {
  const keyIdeas = dedupeStrings(byType(insights, "key_idea"), cap);
  const actions = dedupeStrings(byType(insights, "action"), cap);
  const risks = dedupeStrings(byType(insights, "risk"), cap);
  const opportunities = dedupeStrings(byType(insights, "opportunity"), cap);
  const questions = dedupeStrings(byType(insights, "question"), cap);
  const memory = dedupeStrings(byType(insights, "memory_candidate"), cap);
  const prompts = dedupeStrings(byType(insights, "cursor_prompt_candidate"), cap);
  const quotes = quotesFrom(session, cap);

  switch (sessionType) {
    case "video_learning":
      return [
        { heading: "What happened", items: whatHappened(session) },
        { heading: "Key takeaways", items: keyIdeas },
        { heading: "Action steps", items: actions },
        { heading: "Useful quotes", items: quotes },
        { heading: "Application ideas", items: opportunities },
        { heading: "Open questions", items: questions },
        { heading: "Save to memory", items: memory },
      ];
    case "meeting_call": {
      const intel = meetingIntelligenceForSession(session);
      const decisions = dedupeStrings(intel.decisions.concat(byType(insights, "hypothesis")), cap);
      const actionItems = dedupeStrings(intel.actionItems.concat(actions), cap);
      const blockers = dedupeStrings(intel.blockers.concat(risks), cap);
      const meetingQuestions = dedupeStrings(intel.openQuestions.concat(questions), cap);
      const followUps = dedupeStrings(intel.followUps.concat(recommendedNextSteps(insights)), cap);
      return [
        { heading: "Meeting notes", items: keyIdeas.length ? keyIdeas : whatHappened(session) },
        { heading: "Decisions", items: withMissing(decisions, MEETING_MISSING_LABELS.decision) },
        { heading: "Action items", items: withMissing(actionItems, MEETING_MISSING_LABELS.action_item) },
        { heading: "Owners", items: withMissing(intel.owners, MEETING_MISSING_LABELS.owner) },
        { heading: "Deadlines", items: withMissing(intel.deadlines, MEETING_MISSING_LABELS.deadline) },
        { heading: "Blockers / risks", items: withMissing(blockers, MEETING_MISSING_LABELS.blocker) },
        { heading: "Open questions", items: meetingQuestions },
        { heading: "Follow-ups", items: followUps },
      ];
    }
    case "research":
      return [
        { heading: "Findings", items: keyIdeas },
        { heading: "Notable claims / sources", items: quotes },
        { heading: "Open questions", items: questions },
        { heading: "Risks / caveats", items: risks },
        { heading: "Next research", items: recommendedNextSteps(insights) },
        { heading: "Save to memory", items: memory },
      ];
    case "coding_building":
      return [
        { heading: "What changed / happened", items: whatHappened(session) },
        { heading: "Key decisions", items: keyIdeas },
        { heading: "Blockers", items: risks },
        { heading: "Action items", items: actions },
        { heading: "Next prompts for your AI tool", items: prompts },
        { heading: "Open questions", items: questions },
      ];
    case "business_strategy":
      return [
        { heading: "What happened", items: whatHappened(session) },
        { heading: "Options", items: opportunities.concat(keyIdeas).slice(0, cap) },
        { heading: "Risks", items: risks },
        { heading: "Recommendation / next actions", items: recommendedNextSteps(insights) },
        { heading: "Open questions", items: questions },
        { heading: "Save to memory", items: memory },
      ];
    case "sales_review":
      return [
        { heading: "What happened", items: whatHappened(session) },
        { heading: "Key signals", items: keyIdeas },
        { heading: "Outreach angles / next actions", items: actions.concat(opportunities).slice(0, cap) },
        { heading: "Risks / objections", items: risks },
        { heading: "Open questions", items: questions },
      ];
    case "studying":
      return [
        { heading: "What happened", items: whatHappened(session) },
        { heading: "Key concepts", items: keyIdeas },
        { heading: "Study notes / action steps", items: actions },
        { heading: "Quiz / open questions", items: questions },
        { heading: "Save to memory", items: memory },
      ];
    default:
      return generalSections(session, insights, cap);
  }
}

type MixedPair = `${GlassCopilotSessionType}+${GlassCopilotSessionType}`;

function mixedCrossSection(
  primary: GlassCopilotSessionType,
  secondary: GlassCopilotSessionType,
  insights: GlassCopilotInsight[],
  cap: number,
): GlassCopilotDebriefSection {
  const pairKey = `${primary}+${secondary}` as MixedPair;
  const actions = dedupeStrings(byType(insights, "action"), cap);
  const keyIdeas = dedupeStrings(byType(insights, "key_idea"), cap);
  const opportunities = dedupeStrings(byType(insights, "opportunity"), cap);

  const PAIR_SECTIONS: Partial<Record<MixedPair, GlassCopilotDebriefSection>> = {
    "video_learning+coding_building": {
      heading: "Apply what you learned",
      items: actions.length ? actions : opportunities,
    },
    "coding_building+video_learning": {
      heading: "Apply what you learned",
      items: actions.length ? actions : opportunities,
    },
    "research+business_strategy": {
      heading: "Findings → decisions",
      items: keyIdeas.length ? keyIdeas : recommendedNextSteps(insights),
    },
    "business_strategy+research": {
      heading: "Findings → decisions",
      items: keyIdeas.length ? keyIdeas : recommendedNextSteps(insights),
    },
    "meeting_call+sales_review": {
      heading: "Follow-ups & pipeline",
      items: actions.concat(opportunities).slice(0, cap),
    },
    "sales_review+meeting_call": {
      heading: "Follow-ups & pipeline",
      items: actions.concat(opportunities).slice(0, cap),
    },
  };

  return (
    PAIR_SECTIONS[pairKey] ?? {
      heading: "Cross-cutting themes",
      items: dedupeStrings(
        [
          `Working across ${SESSION_TYPE_LABELS[primary]} and ${SESSION_TYPE_LABELS[secondary]}.`,
          ...keyIdeas,
          ...actions,
        ],
        cap,
      ),
    }
  );
}

function sectionsForMixed(
  detection: SessionTypeDetectionResult,
  session: GlassSession,
  insights: GlassCopilotInsight[],
  cap: number,
): GlassCopilotDebriefSection[] {
  const primary = detection.primaryType;
  const secondary = detection.secondaryType ?? "general_workflow";
  const primarySections = sectionsForType(primary, session, insights, cap);
  const cross = mixedCrossSection(primary, secondary, insights, cap);
  const lead: GlassCopilotDebriefSection = {
    heading: "Session blend",
    items: [
      `Mixed session: ${SESSION_TYPE_LABELS[primary]} + ${SESSION_TYPE_LABELS[secondary]}.`,
    ],
  };
  return [lead, ...primarySections, cross];
}

/** Build the structured debrief deterministically, tailored to session type. */
export function buildSessionDebrief(
  session: GlassSession,
  insights: GlassCopilotInsight[],
  deps: { idFactory: () => string; clock: () => string },
  options: DebriefOptions = {},
): GlassCopilotDebrief {
  const sessionType = options.sessionType ?? "general_workflow";
  const detection = options.sessionTypeDetection;
  const reportStyle = options.reportStyle ?? "concise";
  const cap = reportStyle === "detailed" ? 10 : 4;

  const listenMoments =
    options.listenMoments ??
    (sessionType === "video_learning" ? listenMomentsFromSessionEvents(session.events) : []);

  let sections =
    detection?.mixed && detection.secondaryType
      ? sectionsForMixed(detection, session, insights, cap)
      : sessionType === "video_learning" && listenMoments.length > 0
        ? buildListenReportSections({
            session,
            moments: listenMoments,
            mediaContext: options.mediaContext,
          })
        : sectionsForType(sessionType, session, insights, cap);
  // Concise reports drop empty sections (except the lead "what happened").
  if (reportStyle === "concise") {
    sections = sections.filter((section, index) => index === 0 || section.items.length > 0);
  }

  const isMeeting = sessionType === "meeting_call" && !(detection?.mixed && detection.secondaryType);
  const isListenReport = sessionType === "video_learning" && listenMoments.length > 0;
  const markdown = isMeeting
    ? buildBusinessMeetingDebrief(meetingIntelligenceForSession(session), {
        title: session.title,
        summary: whatHappened(session)[0],
      })
    : isListenReport
      ? buildListenReportMarkdown(sections)
      : debriefToMarkdown(session.title, sections);
  return {
    id: deps.idFactory(),
    sessionId: session.id,
    createdAt: deps.clock(),
    sections,
    markdown,
    aiEnhanced: false,
  };
}

export function debriefToMarkdown(
  title: string,
  sections: GlassCopilotDebriefSection[],
): string {
  const lines: string[] = [`# Session Debrief — ${title}`, ""];
  for (const section of sections) {
    lines.push(`## ${section.heading}`);
    if (section.items.length === 0) {
      lines.push("_None._");
    } else {
      for (const item of section.items) lines.push(`- ${item}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

/** Prompt for an optional direct-AI enrichment pass (no Council). */
export function buildDebriefAiPrompt(
  session: GlassSession,
  insights: GlassCopilotInsight[],
  options: DebriefOptions = {},
): string {
  const deterministic = buildSessionDebrief(
    session,
    insights,
    { idFactory: () => "draft", clock: () => session.updatedAt },
    options,
  );
  const styleHint = options.reportStyle === "detailed" ? "detailed" : "concise";
  const lines = [
    `You are IIVO debriefing a work/research session. Write a ${styleHint},`,
    "well-organized session debrief from the structured notes below. Keep the",
    "same section headings. Be specific and do not invent facts.",
    "Do not reuse the same debrief structure across similar sessions. Mention",
    "specific names, numbers, owners, dates, sprint numbers, customer names,",
    "metrics, env vars, errors, agenda items, lesson topics, episode numbers,",
    "prospect names, objections, decisions, and concrete next steps — or",
    "differences from this session.",
    "If context is thin, say exactly what is missing instead of producing a generic template.",
  ];
  if (options.sessionType === "video_learning") {
    lines.push(
      "",
      buildListenReportPersonaGuidance({ mediaContext: options.mediaContext ?? undefined }),
      "Ground every section in transcript-backed moments. Use source-agnostic language.",
    );
  }
  if (options.sessionType === "meeting_call") {
    const missing = detectMissingMeetingFields(meetingIntelligenceForSession(session));
    lines.push(
      "",
      "This is a meeting/call. Extract decisions, action items, owners, deadlines,",
      "blockers, risks, open questions, attendee/customer names, and metrics. For any",
      "missing field write the explicit call-out (e.g. \"No owner given\"). Never invent",
      "owners, deadlines, names, or decisions. Include a ready-to-send follow-up draft",
      "and a short next-meeting agenda.",
    );
    if (missing.length > 0) {
      lines.push(
        `Missing fields detected in notes: ${missing.map((m) => MEETING_MISSING_LABELS[m]).join("; ")}.`,
      );
    }
  }
  lines.push("", deterministic.markdown);
  return lines.join("\n");
}
