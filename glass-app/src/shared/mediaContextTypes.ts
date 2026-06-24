/**
 * Active Listening — media/page context from visible screen text and browser
 * metadata. Never uses facial recognition — only titles, URLs, channel names,
 * and on-screen text.
 */

export type MediaSourceType =
  | "youtube"
  | "podcast"
  | "webinar"
  | "course"
  | "call"
  | "browser_audio"
  | "unknown";

export type MediaContextConfidence = "high" | "medium" | "low";

export interface MediaContext {
  sourceType: MediaSourceType;
  title?: string;
  channelOrSource?: string;
  url?: string;
  durationLabel?: string;
  /** OCR/vision-read visible text summary (no faces). */
  visibleTextSummary?: string;
  capturedAt: string;
  confidence: MediaContextConfidence;
  /** How context was obtained — for QA reporting. */
  extractionNotes?: string[];
}

export const MEDIA_CONTEXT_FACE_RECOGNITION_DISCLAIMER =
  "Do not identify any person by their face or appearance. Use only visible text, URL, and page metadata.";

export const MEDIA_CONTEXT_VISION_PROMPT =
  "Read ONLY visible on-screen text for media context. Return plain bullets:\n" +
  "- Platform (YouTube, podcast player, webinar, course site, etc.)\n" +
  "- Video or episode title\n" +
  "- Channel or source name\n" +
  "- URL if visible in the address bar\n" +
  "- Duration if visible\n" +
  "- One-line summary of visible description/snippet if present\n" +
  MEDIA_CONTEXT_FACE_RECOGNITION_DISCLAIMER +
  "\nIf a field is not visible, write \"not visible\" for that field.";
