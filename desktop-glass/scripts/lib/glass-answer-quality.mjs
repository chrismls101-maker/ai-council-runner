/**
 * Heuristic quality flags for live Glass answer audit samples.
 */

const STUB_CANARY = "IIVO Glass is working";
const COUNCIL_MARKERS = [
  "Final Action Plan",
  "Decision Quality",
  "Risk Flags",
  "Recommended Action",
  "Sales Attack",
  "Product Decision",
  "Final Judge",
  "Strategist complete",
];

const GENERIC_OPENERS = [
  /^it sounds like you/i,
  /^here are some (general )?tips/i,
  /^certainly!/i,
  /^sure[,!]/i,
  /^of course[,!]/i,
];

const REFUSAL_PATTERNS = [
  /i can't help with that/i,
  /i cannot assist/i,
  /i'm unable to/i,
  /as an ai language model/i,
];

const CANNOT_SEE_PATTERNS = [
  /i can't see/i,
  /i cannot see/i,
  /i can't make out/i,
  /i cannot make out/i,
  /i can't clearly/i,
  /i cannot clearly/i,
  /i'm not seeing/i,
  /unable to view/i,
  /no image (was )?provided/i,
  /without (an )?image/i,
  /appears essentially blank/i,
  /appears blank/i,
  /too small\/unclear/i,
  /too low-resolution/i,
];

const PLACEHOLDER_VISUAL_PATTERNS = [
  /solid red/i,
  /\b1[\s×x]1\b/,
  /single (red )?pixel/i,
  /tiny red/i,
  /placeholder (image|png|screenshot)/i,
];

const ACTIONABLE_PATTERNS = [
  /\b(check|fix|update|review|set|configure|ensure|verify|add|remove|deploy|run)\b/i,
  /\b\d+\.\s/m,
  /^-\s/m,
  /\*\*[^*]+\*\*/m,
];

/**
 * @param {object} input
 * @param {string} input.answer
 * @param {string} [input.contextSummary]
 * @param {string} [input.routeUsed]
 * @param {string} [input.expectedRoute]
 * @param {string[]} [input.contextKeywords]
 */
export function scoreGlassAnswerQuality(input) {
  const answer = String(input.answer ?? "").trim();
  const context = String(input.contextSummary ?? "");
  const flags = {
    generic: false,
    context_specific: false,
    wrong_route: false,
    stub_text: false,
    council_formatting: false,
    refusal: false,
    cannot_see_error: false,
    placeholder_visual: false,
    missing_expected_context: false,
    useful_actionable: false,
  };

  if (!answer || answer.includes(STUB_CANARY)) flags.stub_text = true;
  for (const m of COUNCIL_MARKERS) {
    if (answer.includes(m)) flags.council_formatting = true;
  }
  for (const re of REFUSAL_PATTERNS) {
    if (re.test(answer)) flags.refusal = true;
  }
  for (const re of CANNOT_SEE_PATTERNS) {
    if (re.test(answer)) flags.cannot_see_error = true;
  }
  for (const re of PLACEHOLDER_VISUAL_PATTERNS) {
    if (re.test(answer)) flags.placeholder_visual = true;
  }
  for (const re of GENERIC_OPENERS) {
    if (re.test(answer)) flags.generic = true;
  }

  const contextTokens = context
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length >= 4);
  const answerLower = answer.toLowerCase();
  const matched = contextTokens.filter((t) => answerLower.includes(t));
  flags.context_specific = matched.length >= 1 || contextTokens.length === 0;

  const keywords = input.contextKeywords ?? [];
  if (keywords.length > 0) {
    const hit = keywords.some((k) => answerLower.includes(String(k).toLowerCase()));
    if (!hit) flags.missing_expected_context = true;
  }

  if (input.expectedRoute && input.routeUsed && input.routeUsed !== input.expectedRoute) {
    flags.wrong_route = true;
  }

  flags.useful_actionable = ACTIONABLE_PATTERNS.some((re) => re.test(answer)) && answer.length >= 40;

  if (flags.context_specific && flags.useful_actionable) flags.generic = false;

  return flags;
}

/** Jaccard-like token overlap (0–1) used to detect template-similar answers. */
export function answerSimilarity(a, b) {
  const tok = (s) =>
    new Set(
      String(s ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3),
    );
  const setA = tok(a);
  const setB = tok(b);
  if (setA.size < 6 || setB.size < 6) return 0;
  let overlap = 0;
  for (const t of setA) if (setB.has(t)) overlap += 1;
  return overlap / Math.max(setA.size, setB.size);
}

/**
 * Grade a meeting answer against scenario facts. Mirrors the TS
 * meetingAnswerVerdict logic (kept in JS so the live audit stays dependency-free).
 *
 * @param {object} input
 * @param {string} input.answer
 * @param {import('../qa-scenarios/iivo-glass-scenarios.mjs').QaScenario} input.scenario
 */
export function scoreMeetingAnswer(input) {
  const answer = String(input.answer ?? "");
  const text = answer.toLowerCase();
  const s = input.scenario ?? {};

  const factAnchors = (s.expectedAnchors ?? []).filter((a) => !/^no\s|^not\s/i.test(a));
  const callOutAnchors = (s.expectedAnchors ?? []).filter((a) => /^no\s|^not\s/i.test(a));
  const mentionedAnchors = factAnchors.filter((a) => text.includes(String(a).toLowerCase()));

  const missingFields = [];
  if ((s.actionItems ?? []).length === 0) missingFields.push("action_item");
  if ((s.owners ?? []).length === 0) missingFields.push("owner");
  if ((s.deadlines ?? []).length === 0) missingFields.push("deadline");
  if ((s.decisions ?? []).length === 0) missingFields.push("decision");
  if ((s.blockers ?? []).length === 0) missingFields.push("blocker");

  // The "strong" gate centers on accountability fields (owner/deadline/action).
  const criticalMissing = missingFields.filter(
    (m) => m === "owner" || m === "deadline" || m === "action_item",
  );
  const missingCalledOut =
    criticalMissing.length === 0 ||
    /(no owner|not specified|no deadline|not given|unspecified|none (given|recorded|specified)|isn'?t (an )?owner|wasn'?t (a )?deadline|nobody (was )?assigned|no (one|specific) owner|no action items?|no concrete|tbd|to be (decided|determined|confirmed|assigned)|not (a |an )?(formal |final )?decision|no (design |formal |final )?decision|not yet (decided|determined|set|assigned)|yet to be|pending (user |further )?(research|review|decision)|blocked until|status update, not)/i.test(
      answer,
    );

  const NON_OWNER_WORDS = new Set([
    "given", "is", "was", "specified", "assigned", "listed", "named", "here",
    "none", "no", "not", "unknown", "tbd", "missing", "unspecified", "nobody",
    "unclear", "pending", "the", "a", "an",
  ]);
  let hallucinatedOwner = false;
  if ((s.owners ?? []).length === 0) {
    const claimed = /\bowner[:\s]+([A-Za-z]+)/i.exec(answer);
    if (claimed && !NON_OWNER_WORDS.has(claimed[1].toLowerCase()) && /^[A-Z][a-z]+$/.test(claimed[1])) {
      hallucinatedOwner = true;
    }
  }

  const extractsDecisions = (s.decisions ?? []).length === 0 || /decid|agreed|approved|decision|go with|chose/i.test(text);
  const extractsActions = /action|next step|to-?do|will |follow up|owner|deadline|by /i.test(text);
  const extractsBlockers = (s.blockers ?? []).length === 0 || /block|risk|waiting on|stuck|dependency/i.test(text);
  const extractsCore = extractsDecisions && extractsActions && extractsBlockers;
  const hasFacts = mentionedAnchors.length > 0;
  const isGeneric = !hasFacts && !extractsCore;

  let verdict;
  if (hallucinatedOwner || isGeneric || (!extractsCore && !missingCalledOut)) verdict = "weak";
  else if (hasFacts && extractsCore && missingCalledOut) verdict = "strong";
  else if (missingCalledOut || hasFacts) verdict = "acceptable";
  else verdict = "weak";

  return {
    verdict,
    mentionedAnchors,
    expectedFactAnchors: factAnchors,
    expectedCallOuts: callOutAnchors,
    missingFields,
    missingCalledOut,
    hallucinatedOwner,
  };
}

const CATEGORY_GENERIC_PHRASES = {
  video_learning: [
    /diversif/i,
    /dollar[- ]cost/i,
    /\bdca\b/i,
    /rebalance/i,
    /timing the market/i,
    /keep (an open mind|learning)/i,
  ],
  creator_content: [
    /strong hook/i,
    /clear (call to action|cta)/i,
    /know your audience/i,
    /post consistently/i,
    /engaging (content|thumbnail)/i,
  ],
  sales_review: [
    /send (a )?follow[- ]?up/i,
    /confirm the demo/i,
    /tailor the demo/i,
    /build rapport/i,
    /add value/i,
  ],
};

const CATEGORY_MISSING_RE =
  /(missing|not (given|specified|defined|sure|provided|clear|identified)|no (topic|audience|title|cta|call to action|platform|publish date|prospect|company|objection|deadline|deal value|stage|owner|lesson topic|key concepts?|examples?)|need(s)? (to be defined|more (context|detail|info))|isn'?t (defined|specified|clear)|unclear|tbd|undefined|wasn'?t (provided|specified|given)|to be defined|hasn'?t been)/i;

/**
 * Grade a non-meeting category answer (video_learning / creator_content /
 * sales_review) against scenario anchors. Kept in JS so the live audit stays
 * dependency-free.
 *
 * @param {object} input
 * @param {string} input.answer
 * @param {import('../qa-scenarios/iivo-glass-scenarios.mjs').QaScenario} input.scenario
 */
export function scoreCategoryAnswer(input) {
  const answer = String(input.answer ?? "");
  const text = answer.toLowerCase();
  const s = input.scenario ?? {};
  const anchors = s.expectedAnchors ?? [];

  const factAnchors = anchors.filter((a) => !/^(no |not |missing)/i.test(a));
  const callOuts = anchors.filter((a) => /^(no |not |missing)/i.test(a));
  const mentionedAnchors = factAnchors.filter((a) => text.includes(String(a).toLowerCase()));

  const thin = factAnchors.length === 0;
  const needed = factAnchors.length >= 3 ? 2 : 1;
  const hasFacts = !thin && mentionedAnchors.length >= needed;

  const missingCalledOut = CATEGORY_MISSING_RE.test(answer);

  const genericPhrases = CATEGORY_GENERIC_PHRASES[s.category] ?? [];
  const genericHits = genericPhrases.filter((re) => re.test(answer)).length;
  const genericFlag = !hasFacts && genericHits > 0;

  const CATEGORY_ACTIONABLE =
    /\b(next step|send|draft|propose|prepare|schedule|book|follow[- ]?up|reach out|ask|build|create|define|confirm|offer|share|map|outline|review|update|set|add|record|remember|study|practice|highlight|loop in|re-?engage|nurture|enroll|post|publish|edit|tighten|clarify|pin down)\b/i;
  const actionable =
    (CATEGORY_ACTIONABLE.test(answer) || ACTIONABLE_PATTERNS.some((re) => re.test(answer))) &&
    answer.length >= 40;

  let verdict;
  if (thin) {
    // Thin context: strong is impossible; honesty about missing info = acceptable.
    verdict = missingCalledOut ? "acceptable" : "weak";
  } else if (!hasFacts) {
    verdict = "weak";
  } else if (actionable) {
    verdict = "strong";
  } else {
    verdict = "acceptable";
  }

  return {
    verdict,
    thin,
    genericFlag,
    actionable,
    mentionedAnchors,
    expectedFactAnchors: factAnchors,
    missingFields: callOuts,
    missingCalledOut,
  };
}

const FAKE_AUDIO_CLAIM =
  /\b(i (?:am |'m )?listening to (?:your|the)|from the (?:real )?(?:audio|video|youtube|podcast) you (?:are playing|played)|i watched the video)\b/i;

/**
 * Grade Active Listening answers — must use transcript anchors, not claim real audio.
 *
 * @param {object} input
 * @param {string} input.answer
 * @param {import('../qa-scenarios/iivo-glass-scenarios.mjs').QaScenario} input.scenario
 */
export function scoreActiveListeningAnswer(input) {
  const answer = String(input.answer ?? "");
  const text = answer.toLowerCase();
  const s = input.scenario ?? {};
  const anchors = s.expectedAnchors ?? [];
  const mentionedAnchors = anchors.filter((a) => text.includes(String(a).toLowerCase()));
  const thin = anchors.length === 0;
  const needed = anchors.length >= 3 ? 2 : 1;
  const hasFacts = !thin && mentionedAnchors.length >= needed;
  const missingCalledOut = CATEGORY_MISSING_RE.test(answer);
  const fakeAudioClaim = FAKE_AUDIO_CLAIM.test(answer);
  const councilStub = /\b(Final Action Plan|IIVO Glass is working)\b/.test(answer);

  let verdict;
  if (fakeAudioClaim || councilStub) verdict = "weak";
  else if (thin && missingCalledOut) verdict = "acceptable";
  else if (!hasFacts && !missingCalledOut) verdict = "weak";
  else if (hasFacts) verdict = "strong";
  else verdict = "acceptable";

  return {
    verdict,
    mentionedAnchors,
    fakeAudioClaim,
    missingCalledOut,
    hasFacts,
  };
}

/**
 * Hard fail reasons for controlled visual fixture live asks.
 * @param {object} input
 * @param {string} input.answer
 * @param {string[]} [input.contextKeywords]
 * @returns {string|null}
 */
export function visualFixtureFailReason(input) {
  const answer = String(input.answer ?? "").trim();
  if (!answer) return "Empty answer";

  const flags = scoreGlassAnswerQuality({
    answer,
    contextKeywords: input.contextKeywords,
  });

  if (flags.stub_text) return "Stub text";
  if (flags.council_formatting) return "Council formatting";
  if (flags.placeholder_visual) return "Placeholder-only visual description";
  if (flags.cannot_see_error) return "Cannot-see visual response";
  if (flags.missing_expected_context) {
    return `Missing fixture keywords (${(input.contextKeywords ?? []).slice(0, 3).join(", ")})`;
  }
  return null;
}
