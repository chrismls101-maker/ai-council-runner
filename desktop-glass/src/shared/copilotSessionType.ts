/**
 * Session Copilot — deterministic session-type detection.
 *
 * Lightweight, rule-based classification of what kind of work the user is
 * doing, from active app/window title + transcript + recent prompts. The
 * detected type steers which insights matter, which interventions appear, and
 * which debrief template is used. No LLM, no electron / fs.
 */

export type GlassCopilotSessionType =
  | "video_learning"
  | "meeting_call"
  | "research"
  | "coding_building"
  | "business_strategy"
  | "sales_review"
  | "studying"
  | "general_workflow";

/** "auto" lets detection choose; anything else pins the type. */
export type GlassCopilotSessionTypeSetting = "auto" | GlassCopilotSessionType;

export const SESSION_TYPE_LABELS: Record<GlassCopilotSessionType, string> = {
  video_learning: "Video / Learning",
  meeting_call: "Meeting / Call",
  research: "Research",
  coding_building: "Building",
  business_strategy: "Strategy",
  sales_review: "Sales",
  studying: "Studying",
  general_workflow: "General",
};

export const SESSION_TYPE_SETTING_LABELS: Record<GlassCopilotSessionTypeSetting, string> = {
  auto: "Auto",
  video_learning: "Video",
  meeting_call: "Meeting",
  research: "Research",
  coding_building: "Building",
  business_strategy: "Strategy",
  sales_review: "Sales",
  studying: "Studying",
  general_workflow: "General",
};

export interface SessionTypeSignals {
  appName?: string;
  windowTitle?: string;
  transcript?: string;
  recentCommands?: string[];
}

const APP_HINTS: { type: GlassCopilotSessionType; apps: string[] }[] = [
  {
    type: "coding_building",
    apps: ["cursor", "code", "vs code", "visual studio", "xcode", "intellij", "webstorm", "pycharm", "terminal", "iterm", "warp", "github", "sublime", "neovim", "vim"],
  },
  {
    type: "meeting_call",
    apps: ["zoom", "google meet", "meet", "microsoft teams", "teams", "webex", "facetime", "slack"],
  },
];

const KEYWORD_HINTS: { type: GlassCopilotSessionType; words: string[] }[] = [
  {
    type: "coding_building",
    words: ["function", "compile", "deploy", "refactor", "bug", "stack trace", "repository", "commit", "endpoint", "build the", "implement", "typescript", "python", "merge", "pull request"],
  },
  {
    type: "meeting_call",
    words: ["agenda", "action item", "follow up", "follow-up", "attendees", "let's discuss", "next meeting", "owner", "circle back", "sync up", "stand up", "standup"],
  },
  {
    type: "video_learning",
    words: ["in this video", "tutorial", "subscribe", "let me show you", "watch this", "episode", "playlist", "narrator", "voiceover"],
  },
  {
    type: "research",
    words: ["according to", "the study", "the paper", "source", "evidence", "citation", "hypothesis", "compare", "versus", "data shows", "research", "findings"],
  },
  {
    type: "business_strategy",
    words: ["strategy", "market", "revenue", "growth", "roadmap", "positioning", "go-to-market", "pricing", "competitor", "margin", "runway", "valuation", "tam"],
  },
  {
    type: "sales_review",
    words: ["prospect", "deal", "pipeline", "outreach", "lead", "quota", "crm", "demo", "close the deal", "objection", "discovery call", "follow up with"],
  },
  {
    type: "studying",
    words: ["exam", "quiz", "homework", "chapter", "flashcard", "definition", "study", "syllabus", "textbook", "lecture", "memorize"],
  },
];

const YOUTUBE_TITLE_HINTS = ["youtube", "- youtube", "vimeo", "twitch", "netflix"];

function lower(value: string | undefined): string {
  return (value ?? "").toLowerCase();
}

function countHits(haystack: string, needles: string[]): number {
  let n = 0;
  for (const needle of needles) {
    if (haystack.includes(needle)) n += 1;
  }
  return n;
}

/** Deterministically detect the session type from signals. */
export function detectSessionType(signals: SessionTypeSignals): GlassCopilotSessionType {
  const app = lower(signals.appName);
  const title = lower(signals.windowTitle);
  const corpus = [
    lower(signals.transcript),
    ...(signals.recentCommands ?? []).map(lower),
  ].join(" \n ");

  const scores = new Map<GlassCopilotSessionType, number>();
  const bump = (type: GlassCopilotSessionType, amount: number): void => {
    scores.set(type, (scores.get(type) ?? 0) + amount);
  };

  // Strong app hints.
  for (const hint of APP_HINTS) {
    if (hint.apps.some((a) => app.includes(a))) bump(hint.type, 3);
  }

  // Video apps (browser playing video).
  if (YOUTUBE_TITLE_HINTS.some((h) => title.includes(h))) bump("video_learning", 3);

  // Keyword hints from transcript + prompts.
  for (const hint of KEYWORD_HINTS) {
    const hits = countHits(corpus, hint.words);
    if (hits > 0) bump(hint.type, hits);
  }

  let best: GlassCopilotSessionType = "general_workflow";
  let bestScore = 0;
  for (const [type, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      best = type;
    }
  }
  return bestScore > 0 ? best : "general_workflow";
}

/** Resolve a configured setting (auto → detection) into a concrete type. */
export function resolveSessionType(
  setting: GlassCopilotSessionTypeSetting,
  signals: SessionTypeSignals,
): GlassCopilotSessionType {
  if (setting && setting !== "auto") return setting;
  return detectSessionType(signals);
}
