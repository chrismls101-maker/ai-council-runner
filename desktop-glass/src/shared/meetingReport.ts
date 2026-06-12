/**
 * IIVO Glass — Meeting Intelligence report builder.
 *
 * Converts a MeetingIntelligenceState into a structured markdown report
 * ready for display in the debrief panel or sending to IIVO.
 *
 * The report uses the schema for the detected/overridden sub-type to
 * determine section order and labels — so a Sales Call report leads with
 * Deal Signals, a Team Meeting leads with Decisions, etc.
 *
 * Pure — no electron / fs / AI. Can be called in shared / renderer / tests.
 */

import {
  MEETING_MOMENT_ICONS,
  MEETING_REPORT_SECTION_ORDER,
  MEETING_SUB_TYPE_LABELS,
  type MeetingIntelligenceState,
  type MeetingMoment,
  type MeetingMomentType,
  type MeetingSubType,
} from "./meetingIntelligenceTypes.ts";
import { getMeetingSchema } from "./meetingExtractionSchemas.ts";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface MeetingReportSection {
  heading: string;
  icon: string;
  type: MeetingMomentType;
  items: string[];
}

export interface MeetingReport {
  /** Structured sections (for programmatic use / debrief panel). */
  sections: MeetingReportSection[];
  /** Full markdown string (for IIVO send / AI prompt input). */
  markdown: string;
  /** Sub-type that was active when the report was built. */
  subType: MeetingSubType;
  /** Total moment count across all sections. */
  momentCount: number;
  /** True when the sub-type was manually overridden by the user. */
  manualOverride: boolean;
}

export interface MeetingReportOptions {
  /** Session title — used in the report header. */
  sessionTitle?: string;
  /** ISO date string — used in the report header. */
  sessionDate?: string;
}

// ─── Main builder ─────────────────────────────────────────────────────────────

/**
 * Build a structured meeting report from a MeetingIntelligenceState.
 *
 * Returns a `MeetingReport` with both structured sections and rendered markdown.
 * If classification is null (meeting ended before threshold), returns an empty
 * report using the "general" schema.
 */
export function buildMeetingReport(
  intel: MeetingIntelligenceState,
  options: MeetingReportOptions = {},
): MeetingReport {
  const subType: MeetingSubType = intel.classification?.subType ?? "general";
  const manualOverride = intel.classification?.manualOverride ?? false;
  const schema = getMeetingSchema(subType);
  const sectionOrder = MEETING_REPORT_SECTION_ORDER[subType];

  // Group moments by type
  const momentsByType = new Map<MeetingMomentType, MeetingMoment[]>();
  for (const type of sectionOrder) {
    const typed = intel.moments.filter((m) => m.type === type);
    if (typed.length > 0) {
      momentsByType.set(type, typed);
    }
  }

  // Build structured sections (only non-empty)
  const sections: MeetingReportSection[] = [];
  for (const type of sectionOrder) {
    const typedMoments = momentsByType.get(type);
    if (!typedMoments?.length) continue;

    const heading = schema.reportSectionLabels[type] ?? type.replace(/_/g, " ");
    const icon = MEETING_MOMENT_ICONS[type];
    const items = typedMoments.map((m) => formatMomentItem(m));

    sections.push({ heading, icon, type, items });
  }

  const momentCount = intel.moments.length;
  const markdown = renderMarkdown(sections, subType, manualOverride, momentCount, options);

  return { sections, markdown, subType, momentCount, manualOverride };
}

/**
 * Produce an array of `{ heading, items }` pairs compatible with
 * `GlassCopilotDebriefSection[]` — used when injecting into the copilot
 * debrief pipeline.
 */
export function buildMeetingReportSections(
  intel: MeetingIntelligenceState,
): Array<{ heading: string; items: string[] }> {
  const { sections } = buildMeetingReport(intel);
  return sections.map(({ heading, icon, items }) => ({
    heading: `${icon} ${heading}`,
    items,
  }));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMomentItem(moment: MeetingMoment): string {
  let text = moment.content.trim();
  if (moment.owner) text += ` → ${moment.owner}`;
  if (moment.deadline) text += ` (by ${moment.deadline})`;
  return text;
}

function renderMarkdown(
  sections: MeetingReportSection[],
  subType: MeetingSubType,
  manualOverride: boolean,
  momentCount: number,
  options: MeetingReportOptions,
): string {
  const typeLabel = MEETING_SUB_TYPE_LABELS[subType];
  const detectionNote = manualOverride ? " *(type set manually)*" : " *(auto-detected)*";

  const lines: string[] = [];

  // Header
  lines.push(`# Meeting Debrief — ${typeLabel}`);
  if (options.sessionTitle) {
    lines.push(`**Session:** ${options.sessionTitle}`);
  }
  if (options.sessionDate) {
    lines.push(`**Date:** ${options.sessionDate}`);
  }
  lines.push(`**Type:** ${typeLabel}${detectionNote}`);
  lines.push(`**Moments captured:** ${momentCount}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  if (sections.length === 0) {
    lines.push("*No moments were captured during this meeting.*");
    lines.push("");
    lines.push(
      "IIVO tracks decisions, action items, risks, blockers, and open questions " +
      "automatically during meetings. Moments appear as the conversation progresses.",
    );
    return lines.join("\n");
  }

  // Sections
  for (const section of sections) {
    lines.push(`## ${section.icon} ${section.heading}`);
    lines.push("");
    for (const item of section.items) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
