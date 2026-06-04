/**
 * Which session events should surface as floating overlay cards.
 */

import type { GlassSessionEvent, GlassSessionEventKind } from "./sessionTypes.ts";

export const OVERLAY_CARD_EVENT_KINDS = new Set<GlassSessionEventKind>([
  "screen_capture",
  "transcript_note",
  "manual_note",
  "saved_moment",
  "insight_detected",
  "hypothesis_detected",
  "action_detected",
  "risk_detected",
]);

export function isOverlayCardEventKind(kind: GlassSessionEventKind): boolean {
  return OVERLAY_CARD_EVENT_KINDS.has(kind);
}

export function overlayCardFromEvent(event: GlassSessionEvent): { id: string; title: string; body: string } {
  return {
    id: event.id,
    title: event.title,
    body: event.text?.trim() || event.kind.replace(/_/g, " "),
  };
}
