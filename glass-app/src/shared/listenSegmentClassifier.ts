/**
 * Listen mode — classify transcript + screen context into content vs ad/intro/sponsor.
 *
 * Pure — no electron / fs. Used to suppress premature cards and filter reports.
 */

export type ListenSegmentKind =
  | "content"
  | "ad"
  | "sponsor"
  | "intro"
  | "outro"
  | "transition"
  | "uncertain";

export interface ListenSegmentInput {
  transcript?: string;
  visibleText?: string;
  mediaTitle?: string;
  mediaChannel?: string;
}

export interface ListenSegmentClassification {
  kind: ListenSegmentKind;
  confidence: number;
  signals: string[];
  /** When true, do not surface proactive action/thought cards from this segment. */
  suppressProactive: boolean;
  /** When true, exclude from main Listen Report sections by default. */
  excludeFromReport: boolean;
}

const AD_SCREEN = [
  /\bskip ad\b/i,
  /\bskip ads\b/i,
  /\bad\s*[·•|]\s*\d/i,
  /\bad\s+\d+\s+of\s+\d+/i,
  /\bsponsored\b/i,
  /\badvertisement\b/i,
  /\bvideo will play after ad\b/i,
];

const AD_TRANSCRIPT = [
  /\bsponsored by\b/i,
  /\blimited time offer\b/i,
  /\bclick the link below\b/i,
  /\bvisit\s+\w+\.com\b/i,
  /\bget\b.*\b(off|percent|discount)\b.*\b(using|with|code)\b/i,  // "get 60% off using code"
  /\bcheck out\b.*\blink\b.*\b(below|bio|description)\b/i,       // "check out the link below"
  /\bfree trial\b.*\blink\b/i,
  /\bexclusive (discount|deal|offer)\b/i,
];

const SPONSOR_TRANSCRIPT = [
  /\bthis (episode|video) is brought to you by\b/i,
  /\bbrought to you by\b/i,           // "this video brought to you by NordVPN"
  /\btoday'?s sponsor\b/i,
  /\bour sponsor\b/i,
  /\bproud partner\b/i,
  /\bpartnered with\b/i,
  /\baffiliate link\b/i,              // "my affiliate link in bio/below"
  /\buse code\s+\w{2,}/i,             // "use code FOUNDER" — requires a code word after
  /\bdiscount code\s+\w{2,}/i,        // "discount code SILICON"
  /\bpromo code\s+\w{2,}/i,           // "promo code GLASS"
];

const INTRO_TRANSCRIPT = [
  /\bwelcome back\b/i,
  /\btoday we'?re (talking|going|discussing) about\b/i,
  /\bbefore we (start|begin|dive|get started)\b/i,
  /\bhey everyone\b/i,
  /\bwhat'?s up (everyone|guys)\b/i,
  /\bin this video\b/i,
  /\bmake sure to (like|subscribe)\b/i,
];

function scoreSignals(text: string, patterns: RegExp[]): string[] {
  const hits: string[] = [];
  for (const re of patterns) {
    if (re.test(text)) hits.push(re.source.slice(0, 48));
  }
  return hits;
}

function topicMismatch(transcript: string, mediaTitle?: string): boolean {
  if (!mediaTitle?.trim() || transcript.length < 40) return false;
  const titleTokens = mediaTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 4);
  if (titleTokens.length < 2) return false;
  const lower = transcript.toLowerCase();
  const matched = titleTokens.filter((t) => lower.includes(t)).length;
  return matched === 0 && /\b(buy|sale|discount|offer|sponsor|brand)\b/i.test(transcript);
}

/** Classify the current listen segment from transcript + optional screen text. */
export function classifyListenSegment(input: ListenSegmentInput): ListenSegmentClassification {
  const transcript = (input.transcript ?? "").trim();
  const visible = (input.visibleText ?? "").trim();
  const combined = `${visible} ${transcript}`.trim();
  const signals: string[] = [];

  const adScreen = scoreSignals(visible, AD_SCREEN);
  const adText = scoreSignals(combined, AD_TRANSCRIPT);
  const sponsorText = scoreSignals(combined, SPONSOR_TRANSCRIPT);
  const introText = scoreSignals(combined, INTRO_TRANSCRIPT);

  if (adScreen.length) {
    signals.push(...adScreen.map((s) => `screen:${s}`));
    return {
      kind: "ad",
      confidence: Math.min(0.95, 0.72 + adScreen.length * 0.08),
      signals,
      suppressProactive: true,
      excludeFromReport: true,
    };
  }

  if (adText.length >= 2 || (adText.length === 1 && topicMismatch(transcript, input.mediaTitle))) {
    signals.push(...adText.map((s) => `transcript:${s}`));
    if (topicMismatch(transcript, input.mediaTitle)) signals.push("topic_mismatch");
    return {
      kind: "ad",
      confidence: 0.78,
      signals,
      suppressProactive: true,
      excludeFromReport: true,
    };
  }

  if (sponsorText.length) {
    signals.push(...sponsorText.map((s) => `sponsor:${s}`));
    return {
      kind: "sponsor",
      confidence: Math.min(0.92, 0.7 + sponsorText.length * 0.1),
      signals,
      suppressProactive: true,
      excludeFromReport: true,
    };
  }

  if (introText.length >= 2 || (introText.length === 1 && transcript.length < 220)) {
    signals.push(...introText.map((s) => `intro:${s}`));
    return {
      kind: "intro",
      confidence: 0.68,
      signals,
      suppressProactive: true,
      excludeFromReport: true,
    };
  }

  if (/\b(outro|thanks for watching|see you next|goodbye|that'?s all for today)\b/i.test(combined)) {
    signals.push("outro_phrase");
    return {
      kind: "outro",
      confidence: 0.7,
      signals,
      suppressProactive: true,
      excludeFromReport: false,
    };
  }

  if (/\b(meanwhile|switching gears|moving on|next up|let'?s jump)\b/i.test(transcript)) {
    signals.push("transition_phrase");
    return {
      kind: "transition",
      confidence: 0.55,
      signals,
      suppressProactive: false,
      excludeFromReport: false,
    };
  }

  if (transcript.length < 24 && !visible) {
    return {
      kind: "uncertain",
      confidence: 0.4,
      signals: ["thin_transcript"],
      suppressProactive: true,
      excludeFromReport: false,
    };
  }

  return {
    kind: "content",
    confidence: transcript.length > 80 ? 0.75 : 0.55,
    signals: signals.length ? signals : ["default_content"],
    suppressProactive: false,
    excludeFromReport: false,
  };
}

export function segmentKindAllowsProactiveCards(kind: ListenSegmentKind): boolean {
  return kind === "content" || kind === "transition" || kind === "outro";
}
