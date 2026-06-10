/**
 * IIVO Glass direct assistant — single OpenAI call, no Council/router.
 */

import {
  buildGlassModelTryChain,
  recordGlassModelRuntime,
  resolveGlassModelPrimary,
  type GlassModelPurpose,
} from "../config/glassModels.js";
import { callOpenAIWithModelChain, ProviderError } from "../providers/openai.js";
import type { GlassAskRequestBody, GlassAskResponseBody, GlassAskSessionPayload } from "./glassAskTypes.js";
import { buildActiveListeningPromptBlock } from "./activeListeningPrompt.js";
import { buildGlassLensContextBlock, type GlassAskLensContext } from "./glassLensContext.js";
import { formatGlassUserProfileBlock, normalizeGlassUserProfile } from "../userProfile/formatUserProfile.js";
import { getGlassUserProfile } from "../userProfile/userProfileStore.js";
import type { GlassUserProfile } from "../userProfile/types.js";

export const GLASS_DIRECT_SYSTEM_PROMPT = `You are IIVO Glass, a fast conversational AI companion over the user's workspace. Answer naturally and directly, like ChatGPT. Use the provided session context only when relevant. Be concise unless the user asks for depth. Do not invent screen/audio details you were not given. Do not use council/report formatting.

Do not reuse the same answer structure across similar sessions. Mention specific names, numbers, topics, decisions, objections, lesson details, owners, dates, sprint numbers, customer names, metrics, episode numbers, prospect names, env vars, agenda items — or differences from this session. If context is thin, say exactly what is missing instead of producing a generic template.

If the user asks for deep analysis, strategic council review, or multi-agent deliberation, briefly answer what you can and suggest they use Analyze Now in IIVO Glass for a deeper session analysis. Do not switch into council mode yourself.

Style:
- 1–5 short paragraphs or bullets
- conversational and practical
- no heavy markdown, no ## headers
- no Final Action Plan, Decision Quality, Risk Flags, Recommended Action, Score, Sales Attack, Product Decision, or agent/council language`;

const MEETING_PROMPT_PATTERNS = [
  /\baction items?\b/i,
  /\bwho owns?\b/i,
  /\bowns? what\b/i,
  /\bblockers?\b/i,
  /\bdecisions?\b/i,
  /\bnext meeting\b/i,
  /\bagenda\b/i,
  /\bfollow[- ]?ups?\b/i,
  /\bdebrief\b/i,
  /\bwhat did i miss\b/i,
];

const MEETING_CONTEXT_PATTERNS = [
  /\bsprint\b/i,
  /\bstand[- ]?up\b/i,
  /\bagenda\b/i,
  /\battendees?\b/i,
  /\bparticipants?\b/i,
  /\baction items?\b/i,
  /\bblockers?\b/i,
  /\bowner\b/i,
  /\bdeadline\b/i,
  /\b(zoom|google meet|microsoft teams|webex|huddle)\b/i,
  /\b(kickoff|retro|retrospective|1:1|sync|standup|discovery call|demo|stakeholder|escalation|incident review|interview debrief|investor update)\b/i,
];

const MEETING_FULL_REPORT_PATTERNS = [
  /\bgive me the report\b/i,
  /\bdebrief\b/i,
  /\bsummari[sz]e (the )?(session|meeting|call)\b/i,
  /\bwhat happened\b/i,
  /\bfull (report|summary|debrief)\b/i,
];

/** True when the prompt or session context looks meeting/call-shaped. */
export function looksLikeMeeting(prompt: string, session?: GlassAskSessionPayload): boolean {
  const text = prompt.toLowerCase();
  const app = session?.currentSource?.appName?.toLowerCase() ?? "";
  if (/(zoom|google meet|microsoft teams|webex|slack huddle)/.test(app)) return true;
  const promptHit = MEETING_PROMPT_PATTERNS.some((re) => re.test(text));
  const contextHit = MEETING_CONTEXT_PATTERNS.some((re) => re.test(text));
  // A meeting prompt alone (action items / who owns what / blockers) counts; a
  // generic prompt only counts when meeting context signals are present.
  return promptHit && contextHit ? true : contextHit && MEETING_CONTEXT_PATTERNS.filter((re) => re.test(text)).length >= 2;
}

/** Whether a meeting prompt wants the full debrief vs. a quick answer. */
export function meetingWantsFullReport(prompt: string): boolean {
  return MEETING_FULL_REPORT_PATTERNS.some((re) => re.test(prompt));
}

/**
 * Meeting-specific answer guidance. Forces extraction of decisions, action
 * items, owners, deadlines, blockers, and explicit call-outs for missing
 * fields — without inventing owners/deadlines/names.
 */
export function buildMeetingAnswerGuidance(fullReport: boolean): string {
  const shared =
    "This is a meeting/call session. Extract real specifics — decisions, action items, owners, deadlines, blockers, risks, open questions, attendee/customer names, sprint numbers, and metrics. " +
    "If a field is absent, say so explicitly (e.g. \"No owner given\", \"No deadline given\", \"No decision recorded\", \"No customer name visible\"). Never invent owners, deadlines, names, or decisions.";
  if (fullReport) {
    return [
      shared,
      "",
      "Structure the full debrief as:",
      "- Meeting summary (specific to this session)",
      "- Decisions made",
      "- Action items (action — owner — deadline)",
      "- Owners (flag any action with no owner)",
      "- Deadlines (flag any action with no date)",
      "- Blockers / risks",
      "- Open questions",
      "- Follow-up message draft (ready to send)",
      "- Next meeting agenda",
    ].join("\n");
  }
  return [
    shared,
    "",
    "Give a quick, specific answer covering:",
    "- Decision / main point",
    "- Action items",
    "- Owners (or 'no owner given')",
    "- Deadlines (or 'no deadline given')",
    "- Risks / blockers",
    "- Next step",
  ].join("\n");
}

const VIDEO_LEARNING_PATTERNS = [
  /\b(lesson|module|chapter|tutorial|lecture|course|instructor|video)\b/i,
  /\bwhat should i remember\b/i,
  /\b(takeaway|key concept|study notes?)\b/i,
  /\bwatch(ing)?\b/i,
];

const CREATOR_CONTENT_PATTERNS = [
  /\bepisode\b/i,
  /\b(hook|thumbnail|cta|call to action)\b/i,
  /\b(podcast|newsletter|short[- ]?form|reel|tiktok|youtube|livestream|channel)\b/i,
  /\b(audience|viewers?|subscribers?)\b/i,
  /\b(content (calendar|plan|promise)|upload|publish)\b/i,
];

const SALES_REVIEW_PATTERNS = [
  /\b(prospect|deal|pipeline|account|opportunity)\b/i,
  /\b(objection|procurement|competitor|quota|close|renewal|expansion)\b/i,
  /\b(demo|discovery|follow[- ]?up|outreach|cold email)\b/i,
  /\b(crm|hubspot|salesforce)\b/i,
];

function countHits(text: string, patterns: RegExp[]): number {
  return patterns.filter((re) => re.test(text)).length;
}

/** Detection for the non-meeting answer-quality categories (off prompt+context text). */
export function looksLikeVideoLearning(prompt: string): boolean {
  return countHits(prompt, VIDEO_LEARNING_PATTERNS) >= 2;
}

export function looksLikeCreatorContent(prompt: string): boolean {
  return countHits(prompt, CREATOR_CONTENT_PATTERNS) >= 2;
}

export function looksLikeSalesReview(prompt: string): boolean {
  return countHits(prompt, SALES_REVIEW_PATTERNS) >= 2;
}

const VIDEO_LEARNING_GUIDANCE = [
  "This is a video-learning session. Ground the answer in THIS video's specifics: lesson number/topic, key concepts, exact terms, examples, warnings/mistakes, and steps actually present in the transcript or screen.",
  "Do NOT default to generic advice (for example: diversify, dollar-cost averaging, rebalance, \"avoid timing the market\") unless those concepts are actually in the context.",
  "",
  "Answer with:",
  "- 3–5 session-specific takeaways using exact terms/concepts from the context",
  "- one practical application",
  "- one question to review",
  "- mention the lesson number/topic if present",
  "If context is thin, say exactly what is missing (lesson topic, key concepts, examples) instead of inventing. The transcript may be simulated — do not invent details from a real video.",
].join("\n");

const CREATOR_CONTENT_GUIDANCE = [
  "This is a creator-content planning session. Ground the answer in THIS episode/piece: episode number/title, target audience, topic, content promise, hook angle, thumbnail/title idea, CTA, platform, and upload timing actually present in the context.",
  "Do NOT repeat the same generic hook/CTA advice across episodes.",
  "",
  "Answer with:",
  "- the viewer promise",
  "- hook / title / thumbnail alignment",
  "- the main content risk",
  "- one concrete next edit",
  "- the CTA decision",
  "- any missing assets/details",
  "If the context only says \"episode N\" without a real topic/audience/title, say the missing topic, audience, title, thumbnail, CTA, platform, and publish date must be defined. Do not invent episode substance.",
].join("\n");

const SALES_REVIEW_GUIDANCE = [
  "This is a sales-review session. Ground the answer in THIS account: prospect/company name, deal stage, objection, next step, deadline/quarter close, competitor, deal risk, value proposition, and owner actually present in the context.",
  "Do NOT produce a generic sales-ops list (for example: \"send follow-up, confirm demo, tailor demo\").",
  "",
  "Answer with:",
  "- a prospect-specific next step",
  "- objection handling",
  "- a demo/follow-up plan",
  "- the close risk",
  "- a short follow-up message angle or talk track",
  "If prospect name, objection, owner, deadline, or deal value is missing, say so. Never invent a prospect name or deadline.",
].join("\n");

/**
 * Category-specific answer guidance for the non-meeting answer-quality
 * categories. Returns null when the prompt/context doesn't match a category.
 */
export function buildNonMeetingCategoryGuidance(prompt: string): string | null {
  if (looksLikeVideoLearning(prompt)) return VIDEO_LEARNING_GUIDANCE;
  if (looksLikeCreatorContent(prompt)) return CREATOR_CONTENT_GUIDANCE;
  if (looksLikeSalesReview(prompt)) return SALES_REVIEW_GUIDANCE;
  return null;
}

const COUNCIL_FORMAT_MARKERS =
  /\b(Final Action Plan|Decision Quality|Risk Flags|Recommended Action|Sales Attack|Product Decision|Final Judge|Strategist complete)\b/i;

export type GlassDirectAskCaller = (
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
  purpose?: GlassModelPurpose,
) => Promise<import("../providers/openai.js").OpenAICallWithFallbackResult>;

const defaultCaller: GlassDirectAskCaller = async (system, user, signal, purpose = "default") => {
  const selected = resolveGlassModelPrimary("text", purpose);
  const chain = buildGlassModelTryChain(selected);
  const result = await callOpenAIWithModelChain(system, user, chain, signal, 900);
  recordGlassModelRuntime("text", purpose, {
    requestedModel: result.requestedModel,
    selectedModel: result.selectedModel,
    modelUsed: result.modelUsed,
    fallbackUsed: result.fallbackUsed,
    fallbackReason: result.fallbackReason ?? null,
  });
  return result;
};

export interface SessionAnchors {
  names: string[];
  metrics: string[];
  sprints: string[];
  lessons: string[];
  objections: string[];
  envErrors: string[];
  decisions: string[];
  dueDates: string[];
}

const STOP_NAME_WORDS = new Set([
  "The", "This", "That", "There", "Then", "These", "Those", "What", "When",
  "Where", "Which", "Who", "Why", "How", "Session", "Recent", "Active",
  "Summary", "Transcript", "Source", "Glass", "IIVO", "OpenAI", "GPT",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December",
]);

function dedupeAnchor(values: string[], max = 6): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const clean = value.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= max) break;
  }
  return out;
}

function collectSessionText(session?: GlassAskSessionPayload): string {
  if (!session) return "";
  const parts: string[] = [];
  if (session.summary) parts.push(session.summary);
  if (session.recentTranscript) parts.push(session.recentTranscript);
  if (session.recentInsights?.length) parts.push(session.recentInsights.join("\n"));
  for (const event of session.recentEvents ?? []) {
    if (event.title) parts.push(event.title);
    if (event.text) parts.push(event.text);
  }
  if (session.currentSource) {
    parts.push(
      [session.currentSource.appName, session.currentSource.windowTitle, session.currentSource.sourceTitle]
        .filter(Boolean)
        .join(" "),
    );
  }
  return parts.join("\n");
}

/**
 * Extract concrete, session-specific anchors so the model can ground answers in
 * real details (names, metrics, sprint/lesson numbers, objections, errors,
 * decisions, due dates) rather than producing a generic template.
 */
export function extractSessionAnchors(session?: GlassAskSessionPayload): SessionAnchors {
  const text = collectSessionText(session);
  const anchors: SessionAnchors = {
    names: [],
    metrics: [],
    sprints: [],
    lessons: [],
    objections: [],
    envErrors: [],
    decisions: [],
    dueDates: [],
  };
  if (!text.trim()) return anchors;

  // Proper-noun-ish names (multi-word capitalized or single capitalized token).
  const nameMatches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g) ?? [];
  anchors.names = dedupeAnchor(
    nameMatches.filter((n) => {
      const first = n.split(/\s+/)[0];
      return !STOP_NAME_WORDS.has(first);
    }),
  );

  // Metrics: currency, percentages, multipliers, counts with units.
  const metricMatches =
    text.match(/(?:\$|€|£)\s?\d[\d,.]*\s?[kKmMbB]?|\b\d[\d,.]*\s?%|\b\d[\d,.]*\s?(?:x|users|reps|deals|leads|MRR|ARR|days|weeks|hrs|hours)\b/gi) ?? [];
  anchors.metrics = dedupeAnchor(metricMatches);

  anchors.sprints = dedupeAnchor(text.match(/\bsprint\s*#?\s*\d+\b/gi) ?? []);
  anchors.lessons = dedupeAnchor(
    text.match(/\b(?:lesson|module|episode|chapter|video)\s*#?\s*\d+\b/gi) ?? [],
  );

  // Objections / hesitations.
  const objectionMatches =
    text.match(/[^.!?\n]*\b(?:objection|concerned about|worried about|pushback|hesitant|too expensive|not sure|budget|blocker)\b[^.!?\n]*/gi) ?? [];
  anchors.objections = dedupeAnchor(objectionMatches.map((m) => m.trim()), 4);

  // Env vars (UPPER_SNAKE) + error markers.
  const envMatches = text.match(/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/g) ?? [];
  const errorMatches =
    text.match(/[^.!?\n]*\b(?:error|exception|failed|stack trace|undefined|null pointer|timeout|500|404)\b[^.!?\n]*/gi) ?? [];
  anchors.envErrors = dedupeAnchor([...envMatches, ...errorMatches.map((m) => m.trim())], 5);

  // Decisions.
  const decisionMatches =
    text.match(/[^.!?\n]*\b(?:decided|decision|we will|we'll|going with|agreed to|chose|committed to)\b[^.!?\n]*/gi) ?? [];
  anchors.decisions = dedupeAnchor(decisionMatches.map((m) => m.trim()), 4);

  // Due dates.
  const dueMatches =
    text.match(/\bdue\b[^.!?\n]*|\bby\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|next week|end of (?:day|week|month)|\d{1,2}\/\d{1,2})[^.!?\n]*/gi) ?? [];
  anchors.dueDates = dedupeAnchor(dueMatches.map((m) => m.trim()), 4);

  return anchors;
}

/** Count how many anchor categories produced concrete hits. */
export function sessionAnchorStrength(anchors: SessionAnchors): number {
  return Object.values(anchors).filter((arr) => arr.length > 0).length;
}

export const GLASS_WEAK_ANCHOR_INSTRUCTION =
  "Context is thin: few session-specific anchors were found. If you cannot ground this answer in concrete names, numbers, decisions, or details from THIS session, say \"I need more specific context to separate this from prior sessions.\" instead of producing a generic template.";

function buildSessionAnchorBlock(anchors: SessionAnchors): string[] {
  const lines: string[] = [];
  const entries: [string, string[]][] = [
    ["Names", anchors.names],
    ["Metrics", anchors.metrics],
    ["Sprints", anchors.sprints],
    ["Lessons/topics", anchors.lessons],
    ["Objections", anchors.objections],
    ["Errors/env", anchors.envErrors],
    ["Decisions", anchors.decisions],
    ["Due dates", anchors.dueDates],
  ];
  const present = entries.filter(([, arr]) => arr.length > 0);
  if (present.length === 0) return lines;
  lines.push("", "Session-specific anchors (ground your answer in these — do not ignore them):");
  for (const [label, arr] of present) {
    lines.push(`- ${label}: ${arr.join("; ")}`);
  }
  return lines;
}

export function buildGlassDirectUserPrompt(
  prompt: string,
  session?: GlassAskSessionPayload,
  userProfile?: GlassUserProfile,
  userContext?: string,
  lensContext?: GlassAskLensContext,
): string {
  const lines: string[] = [prompt.trim()];

  const contextBlock = userContext?.trim();
  if (contextBlock) {
    lines.push("", contextBlock);
  } else if (userProfile) {
    lines.push("", formatGlassUserProfileBlock(userProfile));
  }

  const lensBlock = buildGlassLensContextBlock(lensContext);
  if (lensBlock) {
    lines.push("", lensBlock);
  }

  if (session?.summary?.trim()) {
    lines.push("", "Session summary:", session.summary.trim());
  }
  if (session?.recentTranscript?.trim()) {
    lines.push("", "Recent transcript:", session.recentTranscript.trim().slice(-1500));
  }
  if (session?.currentSource) {
    const src = [session.currentSource.appName, session.currentSource.windowTitle, session.currentSource.sourceTitle]
      .filter(Boolean)
      .join(" — ");
    if (src) lines.push("", "Active source:", src);
  }
  if (session?.recentInsights?.length) {
    lines.push("", "Recent insights:", session.recentInsights.slice(0, 5).join("\n"));
  }
  if (session?.recentEvents?.length) {
    lines.push("", "Recent session events:");
    for (const event of session.recentEvents.slice(-8)) {
      const when = event.timestamp ? new Date(event.timestamp).toLocaleString() : "";
      const src = event.sourceTitle ? ` (${event.sourceTitle})` : "";
      lines.push(
        `- [${event.kind}${src}${when ? ` · ${when}` : ""}] ${event.title}${event.text ? `: ${event.text}` : ""}`,
      );
    }
    const recentAnswers = session.recentEvents
      .filter((e) => e.kind === "iivo_response" && e.text?.trim())
      .slice(-2);
    if (recentAnswers.length > 0) {
      lines.push("", "Recent answers in this session (vary phrasing; do not repeat structure):");
      for (const answer of recentAnswers) {
        lines.push(`- ${answer.text!.trim().slice(0, 280)}`);
      }
    }
  }

  const anchors = extractSessionAnchors(session);
  const anchorBlock = buildSessionAnchorBlock(anchors);
  if (anchorBlock.length > 0) {
    lines.push(...anchorBlock);
  }

  const categoryGuidance = buildNonMeetingCategoryGuidance(prompt);
  if (session?.activeListening?.enabled) {
    lines.push("", buildActiveListeningPromptBlock(session.activeListening, prompt));
  } else if (looksLikeMeeting(prompt, session)) {
    lines.push("", buildMeetingAnswerGuidance(meetingWantsFullReport(prompt)));
  } else if (categoryGuidance) {
    lines.push("", categoryGuidance);
  } else if (session && sessionAnchorStrength(anchors) < 2) {
    // Only nudge toward "need more context" when we have a non-meeting thin session.
    lines.push("", GLASS_WEAK_ANCHOR_INSTRUCTION);
  }

  return lines.join("\n");
}

function normalizeAnswerForCompare(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Jaccard-like overlap on meaningful tokens — used to detect template-like repeats. */
export function answersTooSimilar(current: string, previous: string): boolean {
  const tokensA = normalizeAnswerForCompare(current)
    .split(" ")
    .filter((w) => w.length > 3);
  const tokensB = normalizeAnswerForCompare(previous)
    .split(" ")
    .filter((w) => w.length > 3);
  if (tokensA.length < 8 || tokensB.length < 8) return false;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let overlap = 0;
  for (const token of setA) {
    if (setB.has(token)) overlap += 1;
  }
  const ratio = overlap / Math.max(setA.size, setB.size);
  return ratio >= 0.55;
}

export function buildGlassDirectRetryPrompt(userPrompt: string): string {
  return `${userPrompt}\n\nYour previous answer was too similar/generic to another answer in this session. Rewrite using only the distinct facts from THIS session — specific names, owners, dates, sprint numbers, decisions, metrics, customer names, and blockers. If distinct facts are missing, list the missing fields explicitly instead of filling with generic advice. Do not repeat the same structure or headings.`;
}

/** Strip council-style formatting; optionally cap for overlay HUD. */
export function formatGlassDirectAnswer(
  raw: string,
  opts?: { overlayCap?: boolean },
): {
  answer: string;
  shortAnswer?: string;
  warnings?: string[];
} {
  const overlayCapEnabled = opts?.overlayCap !== false;
  const cleaned = raw
    .trim()
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(Final Action Plan|Decision Quality|Risk Flags|Recommended Action)\*\*/gi, "")
    .replace(/\n{3,}/g, "\n\n");

  const warnings: string[] = [];
  if (COUNCIL_FORMAT_MARKERS.test(cleaned)) {
    warnings.push("Answer cleaned of council-style formatting for overlay display.");
  }

  const withoutCouncilLines = cleaned
    .split("\n")
    .filter((line) => !COUNCIL_FORMAT_MARKERS.test(line))
    .join("\n")
    .trim();

  const full = withoutCouncilLines || cleaned;
  const overlayCap = 720;

  if (!overlayCapEnabled || full.length <= overlayCap) {
    return { answer: full, warnings: warnings.length ? warnings : undefined };
  }

  const short = `${full.slice(0, overlayCap).trim()}…`;
  return {
    answer: short,
    shortAnswer: short,
    warnings: ["Answer shortened for overlay.", ...(warnings.length ? warnings : [])],
  };
}

export function validateGlassDirectApiKey(): string[] {
  return process.env.OPENAI_API_KEY?.trim() ? [] : ["OPENAI_API_KEY"];
}

export async function runGlassDirectAsk(
  body: GlassAskRequestBody,
  signal?: AbortSignal,
  caller: GlassDirectAskCaller = defaultCaller,
): Promise<GlassAskResponseBody> {
  const prompt = body.prompt?.trim();
  if (!prompt) {
    throw new Error("prompt is required");
  }

  const purpose = body.modelPurpose ?? "default";
  const storedProfile = await getGlassUserProfile();
  const userProfile =
    normalizeGlassUserProfile(body.userProfile) ?? storedProfile ?? undefined;
  const userContext = body.userContext?.trim() || undefined;
  const userPrompt = buildGlassDirectUserPrompt(
    prompt,
    body.session,
    userProfile,
    userContext,
    body.lensContext,
  );
  let result = await caller(GLASS_DIRECT_SYSTEM_PROMPT, userPrompt, signal, purpose);
  let formatted = formatGlassDirectAnswer(result.content, {
    overlayCap: body.responseStyle !== "full",
  });

  const lastAnswer = body.session?.recentEvents
    ?.filter((event) => event.kind === "iivo_response" && event.text?.trim())
    .slice(-1)[0]
    ?.text?.trim();
  if (lastAnswer && answersTooSimilar(formatted.answer, lastAnswer)) {
    result = await caller(
      GLASS_DIRECT_SYSTEM_PROMPT,
      buildGlassDirectRetryPrompt(userPrompt),
      signal,
      purpose,
    );
    formatted = formatGlassDirectAnswer(result.content, {
      overlayCap: body.responseStyle !== "full",
    });
  }

  const title = prompt.length > 60 ? `${prompt.slice(0, 59)}…` : prompt;

  return {
    answer: formatted.answer,
    shortAnswer: formatted.shortAnswer,
    model: result.modelUsed,
    modelRequested: result.requestedModel,
    modelUsed: result.modelUsed,
    fallbackUsed: result.fallbackUsed,
    routeUsed: "glass_direct",
    title,
    warnings: formatted.warnings,
    usage: result.usage,
  };
}

export { ProviderError };
