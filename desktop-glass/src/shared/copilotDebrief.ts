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
} from "./copilotTypes.ts";

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

/** Build the structured debrief deterministically. */
export function buildSessionDebrief(
  session: GlassSession,
  insights: GlassCopilotInsight[],
  deps: { idFactory: () => string; clock: () => string },
): GlassCopilotDebrief {
  const sections: GlassCopilotDebriefSection[] = [
    { heading: "What happened", items: whatHappened(session) },
    { heading: "Key ideas", items: dedupeStrings(byType(insights, "key_idea"), 8) },
    { heading: "Important quotes / transcript moments", items: quotesFrom(session, 5) },
    { heading: "Actions", items: dedupeStrings(byType(insights, "action"), 8) },
    { heading: "Risks / blockers", items: dedupeStrings(byType(insights, "risk"), 8) },
    { heading: "Opportunities", items: dedupeStrings(byType(insights, "opportunity"), 8) },
    {
      heading: "What IIVO noticed",
      items: dedupeStrings(byType(insights, "summary_note").concat(byType(insights, "hypothesis")), 6),
    },
    { heading: "Recommended next steps", items: recommendedNextSteps(insights) },
    {
      heading: "Cursor prompts / follow-up prompts",
      items: dedupeStrings(byType(insights, "cursor_prompt_candidate"), 6),
    },
    { heading: "What to save to memory", items: dedupeStrings(byType(insights, "memory_candidate"), 6) },
    { heading: "Open questions", items: dedupeStrings(byType(insights, "question"), 8) },
  ];

  const markdown = debriefToMarkdown(session.title, sections);
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
): string {
  const deterministic = buildSessionDebrief(session, insights, {
    idFactory: () => "draft",
    clock: () => session.updatedAt,
  });
  return [
    "You are IIVO debriefing a work/research session. Using the structured notes",
    "below, write a concise, well-organized session debrief. Keep the same",
    "section headings. Be specific and do not invent facts.",
    "",
    deterministic.markdown,
  ].join("\n");
}
