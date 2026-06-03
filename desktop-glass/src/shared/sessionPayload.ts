/**
 * Builds the IIVO Context Bridge payload for an entire Glass session.
 *
 * Server-compatible: produces a `pasted_text` context item (the existing API
 * accepts it unchanged). Session metadata is embedded in the content text since
 * the Context Bridge schema does not store arbitrary metadata. The timeline is
 * truncated to keep payloads reasonable.
 */

import { GLASS_CAPTURED_VIA } from "./contextPayload.ts";
import { buildSessionSummary } from "./sessionSummary.ts";
import type { ContextCreatePayload } from "./types.ts";
import type { GlassSession, GlassSessionEvent, GlassSessionInsight } from "./sessionTypes.ts";

export const SESSION_SOURCE = "desktop_glass_session";

export interface SessionPayloadOptions {
  maxEvents?: number;
  maxInsights?: number;
}

export interface SessionPayloadResult {
  payload: ContextCreatePayload;
  truncated: boolean;
  eventCount: number;
  insightCount: number;
  includedEventCount: number;
  includedInsightCount: number;
}

function formatEvent(e: GlassSessionEvent): string {
  const time = new Date(e.timestamp).toLocaleTimeString();
  const src = e.sourceTitle ? ` [${e.sourceTitle}]` : "";
  const detail = e.text ? ` — ${e.text}` : "";
  return `- ${time} (${e.kind})${src}: ${e.title}${detail}`;
}

function formatInsight(i: GlassSessionInsight): string {
  const mark = i.accepted ? "★ " : "";
  return `- ${mark}[${i.type}] ${i.text}`;
}

export function buildSessionContextPayload(
  session: GlassSession,
  options: SessionPayloadOptions = {},
): SessionPayloadResult {
  const maxEvents = options.maxEvents ?? 25;
  const maxInsights = options.maxInsights ?? 10;

  const eventCount = session.events.length;
  const insightCount = session.insights.length;

  // Most recent events, oldest-first for readability.
  const includedEvents = session.events.slice(-maxEvents);
  // Accepted insights first, then by recency.
  const sortedInsights = [...session.insights].sort(
    (a, b) =>
      Number(b.accepted ?? false) - Number(a.accepted ?? false) ||
      b.timestamp.localeCompare(a.timestamp),
  );
  const includedInsights = sortedInsights.slice(0, maxInsights);

  const truncated = includedEvents.length < eventCount || includedInsights.length < insightCount;

  const summary = session.summary?.trim() || buildSessionSummary(session);
  const range = `${new Date(session.startedAt).toLocaleString()}${
    session.endedAt ? ` → ${new Date(session.endedAt).toLocaleString()}` : " → (in progress)"
  }`;

  const screenshotRefs = session.events.filter((e) => e.screenshotPath || e.screenshotDataUrl).length;

  const parts: string[] = [
    `IIVO Glass Session: ${session.title}`,
    `Status: ${session.status} | Time range: ${range}`,
    `Events: ${eventCount} | Insights: ${insightCount} | Screenshots: ${screenshotRefs}`,
    `(source: ${SESSION_SOURCE}, sessionId: ${session.id})`,
    "",
    summary,
    "",
    `Timeline (${includedEvents.length} of ${eventCount} events${truncated ? ", truncated" : ""}):`,
    ...includedEvents.map(formatEvent),
  ];

  if (includedInsights.length > 0) {
    parts.push(
      "",
      `Insights (${includedInsights.length} of ${insightCount}):`,
      ...includedInsights.map(formatInsight),
    );
  }

  if (truncated) {
    parts.push("", "Note: timeline/insights truncated for payload size. Open Glass for the full session.");
  }

  const payload: ContextCreatePayload = {
    type: "pasted_text",
    title: `IIVO Glass Session — ${session.title}`,
    contentText: parts.join("\n"),
    tags: ["glass", "desktop", "session"],
    capturedVia: GLASS_CAPTURED_VIA,
    capturedAt: new Date().toISOString(),
    sourceConfidence: "user_pasted",
  };

  return {
    payload,
    truncated,
    eventCount,
    insightCount,
    includedEventCount: includedEvents.length,
    includedInsightCount: includedInsights.length,
  };
}
