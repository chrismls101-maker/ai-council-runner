/**
 * Active Listening — sales/call coaching signal extraction.
 *
 * Wired into the live listening pipeline (not imported from index.ts directly):
 *   salesActiveCoaching → activeListeningContext → currentMomentContext → ask path
 *   salesSignals → activeListeningGuidance (meeting mode coaching hints)
 *
 * Extracts live-call coaching signals from recent transcript only. Never
 * fabricates customer statements — if not in transcript, omit or say missing.
 */

import type { SalesActiveSignals, SalesCoachingMove } from "./activeListeningTypes.ts";

function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function dedupe(values: string[], max = 5): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const clean = v.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= max) break;
  }
  return out;
}

function matchLines(text: string, patterns: RegExp[]): string[] {
  const hits: string[] = [];
  for (const sentence of splitSentences(text)) {
    if (patterns.some((re) => re.test(sentence))) hits.push(sentence);
  }
  return hits;
}

const PAIN_PATTERNS = [
  /\b(pain|struggling|frustrated|problem|issue|challenge|bottleneck|slow|manual|waste)\b/i,
  /\b(can'?t|cannot|hard to|difficult to)\b/i,
];

const OBJECTION_PATTERNS = [
  /\b(too expensive|pricing|budget|cost|not sure|concern|worried|risk|security|compliance)\b/i,
  /\b(not ready|need to think|talk to|get approval|procurement)\b/i,
];

const BUYING_PATTERNS = [
  /\b(interested|sounds good|makes sense|let'?s|when can we|next step|trial|pilot|demo)\b/i,
  /\b(how soon|timeline|roll out|implement)\b/i,
];

const HESITATION_PATTERNS = [
  /\b(maybe|not sure|unclear|hesitant|on the fence|need more time)\b/i,
];

const COMPETITOR_PATTERNS = [
  /\b(competitor|alternative|also looking at|versus|vs\.?|compared to)\b/i,
];

const BUDGET_TIMING_PATTERNS = [
  /\b(budget|q[1-4]|this quarter|next quarter|fiscal|timeline|deadline|by (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))\b/i,
];

const DECISION_MAKER_PATTERNS = [
  /\b(ceo|cto|cfo|vp|director|head of|decision maker|my boss|stakeholder|procurement|legal)\b/i,
];

const NEXT_STEP_PATTERNS = [
  /\b(follow up|next step|schedule|send|share|demo|trial|proposal|contract|kickoff)\b/i,
];

const DEAL_RISK_PATTERNS = [
  /\b(stalled|ghost|no show|champion left|freeze|pause|delay|push(ed)? back|competitor won)\b/i,
];

function buildSuggestedMoves(signals: Omit<SalesActiveSignals, "suggestedMoves">): SalesCoachingMove[] {
  const moves: SalesCoachingMove[] = [];
  if (signals.objections.length > 0) {
    moves.push({
      kind: "clarify",
      text: "Ask what success would look like if this objection were resolved.",
    });
  }
  if (signals.customerPain.length > 0) {
    moves.push({ kind: "confirm_pain", text: "Reflect the pain back in their words, then ask one clarifying question." });
  }
  if (signals.buyingSignals.length > 0 && signals.hesitations.length === 0) {
    moves.push({ kind: "offer_next_step", text: "Offer a concrete next step (demo, trial, or follow-up) tied to what they said." });
  }
  if (signals.hesitations.length > 0) {
    moves.push({ kind: "dont_push", text: "Don't push yet — ask what would need to be true for them to move forward." });
  }
  if (signals.nextSteps.length > 0) {
    moves.push({ kind: "summarize_loop", text: "Summarize what you heard and confirm the agreed next step." });
  }
  if (signals.customerPain.length > 0 && signals.objections.some((o) => /price|cost|budget/i.test(o))) {
    moves.push({ kind: "tie_roi", text: "Tie the pain to ROI — ask which metric improving would justify the investment." });
  }
  if (moves.length === 0) {
    moves.push({ kind: "ask_next", text: "Ask one open question about their priority for this quarter." });
  }
  return moves.slice(0, 4);
}

/** Extract sales coaching signals from recent transcript text only. */
export function extractSalesActiveSignals(transcript: string): SalesActiveSignals {
  const text = transcript.trim();
  const base = {
    customerPain: dedupe(matchLines(text, PAIN_PATTERNS)),
    objections: dedupe(matchLines(text, OBJECTION_PATTERNS)),
    buyingSignals: dedupe(matchLines(text, BUYING_PATTERNS)),
    hesitations: dedupe(matchLines(text, HESITATION_PATTERNS)),
    competitors: dedupe(matchLines(text, COMPETITOR_PATTERNS)),
    budgetTimingConcerns: dedupe(matchLines(text, BUDGET_TIMING_PATTERNS)),
    decisionMakers: dedupe(matchLines(text, DECISION_MAKER_PATTERNS)),
    nextSteps: dedupe(matchLines(text, NEXT_STEP_PATTERNS)),
    dealRisks: dedupe(matchLines(text, DEAL_RISK_PATTERNS)),
  };
  return { ...base, suggestedMoves: buildSuggestedMoves(base) };
}

export function looksLikeSalesCallContext(transcript: string, appName?: string): boolean {
  const app = (appName ?? "").toLowerCase();
  if (/(zoom|google meet|microsoft teams|webex|salesforce|hubspot|gong|chorus)/.test(app)) return true;
  const lower = transcript.toLowerCase();
  const salesHits = [
    /\b(customer|prospect|client|deal|pipeline|objection|pricing|demo|discovery)\b/i.test(lower),
    /\b(roi|budget|contract|procurement|champion|stakeholder)\b/i.test(lower),
  ].filter(Boolean).length;
  return salesHits >= 2;
}
