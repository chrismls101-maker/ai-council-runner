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
  /unable to view/i,
  /no image (was )?provided/i,
  /without (an )?image/i,
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
