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

export interface SessionTypeDetectionResult {
  type: GlassCopilotSessionType;
  /** Winning score (0 when general fallback). */
  score: number;
  /** True when top two types are close — prefer general fallback. */
  mixed: boolean;
  scores: Record<GlassCopilotSessionType, number>;
}

const APP_HINTS: { type: GlassCopilotSessionType; apps: string[] }[] = [
  {
    type: "coding_building",
    apps: [
      "cursor",
      "code",
      "vs code",
      "visual studio",
      "xcode",
      "intellij",
      "webstorm",
      "pycharm",
      "terminal",
      "iterm",
      "warp",
      "github",
      "sublime",
      "neovim",
      "vim",
      "npm",
      "docker",
    ],
  },
  {
    type: "meeting_call",
    apps: ["zoom", "google meet", "meet", "microsoft teams", "teams", "webex", "facetime", "slack huddle"],
  },
  {
    type: "video_learning",
    apps: ["youtube", "vimeo", "udemy", "coursera", "podcasts", "spotify", "quicktime player"],
  },
  {
    type: "research",
    apps: ["perplexity", "arxiv", "notion", "obsidian", "zotero", "mendeley"],
  },
  {
    type: "sales_review",
    apps: ["salesforce", "hubspot", "pipedrive", "close", "apollo", "outreach"],
  },
  {
    type: "studying",
    apps: ["anki", "quizlet", "canvas", "blackboard", "moodle"],
  },
];

const TITLE_HINTS: { type: GlassCopilotSessionType; titles: string[] }[] = [
  {
    type: "video_learning",
    titles: ["youtube", "- youtube", "vimeo", "twitch", "netflix", "udemy", "coursera", "tutorial", "lesson", "podcast", "watching"],
  },
  {
    type: "meeting_call",
    titles: ["zoom meeting", "google meet", "teams meeting", "call with", "standup", "stand-up"],
  },
  {
    type: "research",
    titles: ["google search", "perplexity", "wikipedia", "docs.google", "research", "article"],
  },
  {
    type: "coding_building",
    titles: [".ts", ".tsx", ".js", ".py", "repository", "terminal", "npm run", "build failed"],
  },
];

const KEYWORD_HINTS: { type: GlassCopilotSessionType; words: string[] }[] = [
  {
    type: "coding_building",
    words: [
      "function",
      "compile",
      "deploy",
      "refactor",
      "bug",
      "stack trace",
      "repository",
      "commit",
      "endpoint",
      "build the",
      "implement",
      "typescript",
      "python",
      "merge",
      "pull request",
      "npm install",
      "repo",
      "code review",
      "lint error",
    ],
  },
  {
    type: "meeting_call",
    words: [
      "agenda",
      "action item",
      "follow up",
      "follow-up",
      "attendees",
      "let's discuss",
      "next meeting",
      "owner",
      "circle back",
      "sync up",
      "stand up",
      "standup",
      "on the call",
      "meeting notes",
      "call notes",
    ],
  },
  {
    type: "video_learning",
    words: [
      "in this video",
      "tutorial",
      "subscribe",
      "let me show you",
      "watch this",
      "episode",
      "playlist",
      "narrator",
      "voiceover",
      "watching",
      "lecture",
      "lesson",
      "podcast",
    ],
  },
  {
    type: "research",
    words: [
      "according to",
      "the study",
      "the paper",
      "source",
      "evidence",
      "citation",
      "hypothesis",
      "compare",
      "versus",
      "data shows",
      "research",
      "findings",
      "article",
      "literature review",
      "open question",
    ],
  },
  {
    type: "business_strategy",
    words: [
      "strategy",
      "market",
      "revenue",
      "growth",
      "roadmap",
      "positioning",
      "go-to-market",
      "pricing",
      "competitor",
      "margin",
      "runway",
      "valuation",
      "tam",
      "investor",
      "product vision",
      "executive",
      "priorities",
    ],
  },
  {
    type: "sales_review",
    words: [
      "prospect",
      "deal",
      "pipeline",
      "outreach",
      "lead",
      "quota",
      "crm",
      "demo",
      "close the deal",
      "objection",
      "discovery call",
      "follow up with",
      "cold email",
      "call notes",
      "buyer",
    ],
  },
  {
    type: "studying",
    words: [
      "exam",
      "quiz",
      "homework",
      "chapter",
      "flashcard",
      "definition",
      "study",
      "syllabus",
      "textbook",
      "lecture",
      "memorize",
      "class notes",
      "assignment",
    ],
  },
];

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

function emptyScores(): Record<GlassCopilotSessionType, number> {
  return {
    video_learning: 0,
    meeting_call: 0,
    research: 0,
    coding_building: 0,
    business_strategy: 0,
    sales_review: 0,
    studying: 0,
    general_workflow: 0,
  };
}

/** Score each session type from signals. Exported for tests. */
export function scoreSessionTypes(signals: SessionTypeSignals): Record<GlassCopilotSessionType, number> {
  const app = lower(signals.appName);
  const title = lower(signals.windowTitle);
  const corpus = [
    lower(signals.transcript),
    ...(signals.recentCommands ?? []).map(lower),
  ].join(" \n ");

  const scores = emptyScores();
  const bump = (type: GlassCopilotSessionType, amount: number): void => {
    scores[type] += amount;
  };

  for (const hint of APP_HINTS) {
    if (hint.apps.some((a) => app.includes(a))) bump(hint.type, 3);
  }

  for (const hint of TITLE_HINTS) {
    if (hint.titles.some((t) => title.includes(t))) bump(hint.type, 2);
  }

  for (const hint of KEYWORD_HINTS) {
    const hits = countHits(corpus, hint.words);
    if (hits > 0) bump(hint.type, hits);
  }

  return scores;
}

/** Deterministic detection with confidence metadata. */
export function detectSessionTypeDetailed(signals: SessionTypeSignals): SessionTypeDetectionResult {
  const scores = scoreSessionTypes(signals);
  const ranked = (Object.entries(scores) as [GlassCopilotSessionType, number][])
    .filter(([type]) => type !== "general_workflow")
    .sort((a, b) => b[1] - a[1]);

  const [bestType, bestScore] = ranked[0] ?? ["general_workflow", 0];
  const secondScore = ranked[1]?.[1] ?? 0;
  const mixed = bestScore > 0 && secondScore > 0 && bestScore - secondScore <= 1;

  if (bestScore <= 0 || mixed) {
    return {
      type: "general_workflow",
      score: 0,
      mixed: mixed && bestScore > 0,
      scores,
    };
  }

  return {
    type: bestType,
    score: bestScore,
    mixed: false,
    scores,
  };
}

/** Deterministically detect the session type from signals. */
export function detectSessionType(signals: SessionTypeSignals): GlassCopilotSessionType {
  return detectSessionTypeDetailed(signals).type;
}

/** Resolve a configured setting (auto → detection) into a concrete type. */
export function resolveSessionType(
  setting: GlassCopilotSessionTypeSetting,
  signals: SessionTypeSignals,
): GlassCopilotSessionType {
  if (setting && setting !== "auto") return setting;
  return detectSessionType(signals);
}
