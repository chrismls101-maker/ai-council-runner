/**
 * Builders for the IIVO Context Bridge payloads that Glass sends.
 *
 * These intentionally mirror the shapes used by IIVO Lens (see
 * tests/visual/masterQaFixtures.ts) so the existing server accepts them
 * unchanged: POST /api/context then POST /api/context/:id/screenshot.
 */

import type { ContextCreatePayload, GlassMomentKind } from "./types.ts";

export const GLASS_CAPTURED_VIA = "desktop_glass";

function nowIso(at?: string): string {
  return at ?? new Date().toISOString();
}

export interface ScreenshotPayloadInput {
  title: string;
  sourceTitle?: string;
  contentText?: string;
  sourceUrl?: string;
  capturedAt?: string;
}

export function buildScreenshotContextPayload(
  input: ScreenshotPayloadInput,
): ContextCreatePayload {
  const title = input.title.trim() || "IIVO Glass screen capture";
  return {
    type: "screenshot",
    title,
    sourceUrl: input.sourceUrl,
    contentText:
      input.contentText?.trim() ||
      `Desktop screen capture from IIVO Glass${
        input.sourceTitle ? `: ${input.sourceTitle}` : ""
      }. Use vision analysis to read what is on screen.`,
    tags: ["glass", "desktop", "screenshot"],
    capturedVia: GLASS_CAPTURED_VIA,
    capturedAt: nowIso(input.capturedAt),
    sourceConfidence: "screenshot",
    lensCaptureType: "screenshot",
    pageTitle: input.sourceTitle ?? title,
  };
}

export interface TextPayloadInput {
  title: string;
  text: string;
  kind: Exclude<GlassMomentKind, "screenshot">;
  capturedAt?: string;
}

export function buildTextContextPayload(input: TextPayloadInput): ContextCreatePayload {
  const text = input.text.trim();
  const label = input.kind === "transcript" ? "transcript" : "note";
  return {
    type: "pasted_text",
    title: input.title.trim() || `IIVO Glass ${label}`,
    contentText: text,
    tags: ["glass", "desktop", label],
    capturedVia: GLASS_CAPTURED_VIA,
    capturedAt: nowIso(input.capturedAt),
    sourceConfidence: "user_pasted",
  };
}
