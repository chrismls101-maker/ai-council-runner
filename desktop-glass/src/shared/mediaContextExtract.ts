/**
 * Extract media context from window title, browser URL, and optional visible text.
 * Pure — no electron, no vision, no facial recognition.
 */

import type { MediaContext, MediaContextConfidence, MediaSourceType } from "./mediaContextTypes.ts";

export interface MediaContextExtractInput {
  appName?: string;
  windowTitle?: string;
  browserUrl?: string;
  visibleTextSummary?: string;
  capturedAt?: string;
}

const YOUTUBE_TITLE_SUFFIX = /\s*[-–—]\s*YouTube(?:\s*[-–—]\s*.+)?$/i;
const DURATION_RE = /\b(\d{1,2}:\d{2}(?::\d{2})?)\b/;

function detectSourceType(appName: string, url: string, title: string): MediaSourceType {
  const hay = `${appName} ${url} ${title}`.toLowerCase();
  if (/youtube\.com|youtu\.be/.test(hay) || YOUTUBE_TITLE_SUFFIX.test(title)) return "youtube";
  if (/spotify|podcast|overcast|pocket casts|apple podcasts/.test(hay)) return "podcast";
  if (/zoom\.us|meet\.google|teams\.microsoft|webex/.test(hay)) return "webinar";
  if (/coursera|udemy|skillshare|khan academy|pluralsight|linkedin learning/.test(hay)) return "course";
  if (/chrome|safari|firefox|arc|brave|edge/.test(appName.toLowerCase()) && /watch|video|play/.test(hay)) {
    return "browser_audio";
  }
  return "unknown";
}

function titleFromYouTubeWindow(windowTitle: string): string | undefined {
  const m = windowTitle.match(YOUTUBE_TITLE_SUFFIX);
  if (!m) return undefined;
  const t = windowTitle.slice(0, m.index).trim();
  return t || undefined;
}

function titleFromUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    if (/youtube\.com|youtu\.be/.test(u.hostname)) {
      // Title not in URL reliably — defer to window title
      return undefined;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function channelFromUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    const path = u.pathname;
    const at = path.match(/\/@([^/?#]+)/);
    if (at) return decodeURIComponent(at[1].replace(/-/g, " "));
    const ch = path.match(/\/channel\/([^/?#]+)/);
    if (ch) return ch[1];
  } catch {
    /* ignore */
  }
  return undefined;
}

function channelFromVisibleText(text: string): string | undefined {
  const lines = text.split(/\n+/);
  for (const line of lines) {
    const m = line.match(/^(?:channel|source|creator|by)\s*[:\-]\s*(.+)$/i);
    if (m) return m[1].trim();
  }
  // "Silicon Valley Girl" style — line after title on YouTube often channel name
  const sv = text.match(/channel(?: name)?[:\s]+([^\n.]+)/i);
  if (sv) return sv[1].trim();
  return undefined;
}

function durationFromText(...sources: (string | undefined)[]): string | undefined {
  for (const s of sources) {
    if (!s) continue;
    const m = s.match(DURATION_RE);
    if (m) return m[1];
  }
  return undefined;
}

function titleFromVisibleText(text: string): string | undefined {
  const m = text.match(/(?:video title|title)\s*[:\-]\s*([^\n]+)/i);
  if (m) return m[1].trim();
  return undefined;
}

function confidenceFor(ctx: Omit<MediaContext, "confidence" | "capturedAt">): MediaContextConfidence {
  if (ctx.sourceType === "youtube" && ctx.url && ctx.title) return "high";
  if (ctx.sourceType !== "unknown" && (ctx.title || ctx.channelOrSource)) return "medium";
  if (ctx.title || ctx.url || ctx.visibleTextSummary) return "low";
  return "low";
}

/** Build media context from window/URL/visible text signals. */
export function extractMediaContext(input: MediaContextExtractInput): MediaContext | undefined {
  const appName = input.appName?.trim() ?? "";
  const windowTitle = input.windowTitle?.trim() ?? "";
  const browserUrl = input.browserUrl?.trim();
  const visibleTextSummary = input.visibleTextSummary?.trim();
  const notes: string[] = [];

  if (!windowTitle && !browserUrl && !visibleTextSummary) {
    return undefined;
  }

  const sourceType = detectSourceType(appName, browserUrl ?? "", windowTitle);
  let title =
    titleFromYouTubeWindow(windowTitle) ??
    titleFromUrl(browserUrl ?? "") ??
    titleFromVisibleText(visibleTextSummary ?? "");
  if (!title && windowTitle && sourceType !== "youtube") {
    title = windowTitle;
  }
  if (titleFromYouTubeWindow(windowTitle)) {
    notes.push("title from browser window title (YouTube suffix stripped)");
  }

  let channelOrSource = channelFromUrl(browserUrl ?? "") ?? channelFromVisibleText(visibleTextSummary ?? "");
  if (channelOrSource) notes.push("channel from URL or visible text");

  const durationLabel = durationFromText(windowTitle, visibleTextSummary);

  if (!browserUrl) notes.push("browser URL not available");
  if (!visibleTextSummary) notes.push("visible page text not captured (title/URL only)");
  if (!title) notes.push("video title not extracted — not visible in window title or screen text");

  const partial = {
    sourceType,
    title,
    channelOrSource,
    url: browserUrl,
    durationLabel,
    visibleTextSummary,
    extractionNotes: notes.length ? notes : undefined,
  };

  return {
    ...partial,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    confidence: confidenceFor(partial),
  };
}

/** True if answer text appears to claim facial recognition (QA guard). */
export function answerClaimsFacialRecognition(answer: string): boolean {
  return /\b(recogniz(e|ing|ed|es)|identif(y|ying|ied|ies))\b.{0,40}\b(face|facial|appearance|who this person is|who he is|who she is)\b/i.test(
    answer,
  );
}

/** True if answer falsely claims real audio without transcript backing (harness guard). */
export function answerClaimsFakeAudio(answer: string, hasTranscript: boolean): boolean {
  if (hasTranscript) return false;
  return /\b(i heard|listening to your (?:video|audio)|from the audio (?:you|playing)|the speaker said)\b/i.test(
    answer,
  );
}
