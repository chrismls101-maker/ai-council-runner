/**
 * IIVO Glass — meeting intelligence (pure, no electron / fs).
 *
 * Deterministic extraction of meeting/call specifics (decisions, action items,
 * owners, deadlines, blockers, risks, open questions, participants, customers,
 * metrics, sprint numbers, priority) plus a Business Meeting Debrief template.
 *
 * It never invents missing fields — absent fields are reported explicitly so
 * the model/UI can say "Not specified" / "No owner given".
 */

export interface MeetingIntelligence {
  topic?: string;
  participants: string[];
  decisions: string[];
  actionItems: string[];
  owners: string[];
  deadlines: string[];
  blockers: string[];
  risks: string[];
  openQuestions: string[];
  followUps: string[];
  contradictions: string[];
  customers: string[];
  metrics: string[];
  sprints: string[];
  priority?: "high" | "medium" | "low";
}

const STOP_NAMES = new Set([
  "The", "This", "That", "There", "Then", "These", "Those", "What", "When",
  "Where", "Which", "Who", "Why", "How", "We", "Our", "Action", "Owner",
  "Decision", "Sprint", "Meeting", "Agenda", "Follow", "Next", "Team", "Let",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "Q1", "Q2", "Q3", "Q4", "OK", "Okay", "Yes", "No", "I", "It", "He", "She",
  "They", "But", "And", "If", "So", "Also", "Now", "Here", "Not",
]);

function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function dedupe(values: string[], max = 8): string[] {
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

function extractNames(text: string): string[] {
  const matches = text.match(/\b[A-Z][a-z]+\b/g) ?? [];
  return matches.filter((n) => !STOP_NAMES.has(n));
}

/** Pull a likely owner name out of an action/assignment sentence. */
function ownerFromSentence(sentence: string): string | undefined {
  const explicit = sentence.match(/\b(?:owner|assigned to|owned by)\s*[:\-]?\s*([A-Z][a-z]+)/i);
  if (explicit) return explicit[1];
  const willOwn = sentence.match(/\b([A-Z][a-z]+)\s+(?:will|to|is going to|owns|owns the|handles|takes)\b/);
  if (willOwn && !STOP_NAMES.has(willOwn[1])) return willOwn[1];
  const paren = sentence.match(/\(\s*([A-Z][a-z]+)\s*(?:,|\))/);
  if (paren && !STOP_NAMES.has(paren[1])) return paren[1];
  return undefined;
}

function deadlineFromSentence(sentence: string): string | undefined {
  const due = sentence.match(
    /\b(?:due|by|deadline|before)\s+((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*|next (?:week|month|sprint)|end of (?:day|week|month|quarter)|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|EOD|EOW|tomorrow)/i,
  );
  return due ? due[0].trim() : undefined;
}

export function extractMeetingIntelligence(
  rawText: string,
  opts: { topic?: string } = {},
): MeetingIntelligence {
  const text = (rawText ?? "").trim();
  const sentences = splitSentences(text);
  const intel: MeetingIntelligence = {
    topic: opts.topic?.trim() || undefined,
    participants: [],
    decisions: [],
    actionItems: [],
    owners: [],
    deadlines: [],
    blockers: [],
    risks: [],
    openQuestions: [],
    followUps: [],
    contradictions: [],
    customers: [],
    metrics: [],
    sprints: [],
  };
  if (!text) return intel;

  const owners: string[] = [];
  const deadlines: string[] = [];

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();

    if (/\b(decided|decision|agreed|approved|green[- ]?light|we'?ll go with|chose|locked|signed off)\b/.test(lower)) {
      intel.decisions.push(sentence);
    }
    if (
      /\b(action item|will (own|handle|take|ship|send|draft|prepare|set up|schedule)|to do|needs to|need to|follow up with|assigned to|owner[:\s])\b/.test(
        lower,
      )
    ) {
      intel.actionItems.push(sentence);
      const owner = ownerFromSentence(sentence);
      if (owner) owners.push(owner);
      const deadline = deadlineFromSentence(sentence);
      if (deadline) deadlines.push(deadline);
    }
    if (
      /\b(blocked|blocker|waiting on|stuck|can'?t proceed|dependency on|held up|objection|concerned (about|that|the)|too (long|high|slow|expensive))\b/.test(
        lower,
      )
    ) {
      intel.blockers.push(sentence);
    }
    if (/\b(risk|concern|worried|churn|might fail|danger|exposure|slip|jeopardy)\b/.test(lower)) {
      intel.risks.push(sentence);
    }
    if (/\b(follow[- ]?up|circle back|reconvene|next meeting|next sync|schedule a)\b/.test(lower)) {
      intel.followUps.push(sentence);
    }
    if (
      sentence.includes("?") ||
      /\b(open question|unclear|need to confirm|tbd|to be decided|still deciding|not sure (yet|if))\b/.test(lower)
    ) {
      intel.openQuestions.push(sentence);
    }
    if (/\b(however|but earlier|contradicts|disagree|on the other hand|conflicts with|pushed back|versus|tension)\b/.test(lower)) {
      intel.contradictions.push(sentence);
    }

    const sprint = sentence.match(/\bsprint\s*#?\s*\d+\b/i);
    if (sprint) intel.sprints.push(sprint[0]);

    const customer = sentence.match(/\b(?:customer|prospect|client|account|deal with|company)\s+([A-Z][A-Za-z0-9&.\- ]{1,30})/);
    if (customer) intel.customers.push(customer[1].trim());

    const metric = sentence.match(
      /(?:\$|€|£)\s?\d[\d,.]*\s?[kKmMbB]?|\b\d[\d,.]*\s?%|\b\d[\d,.]*\s?(?:x|users|reps|deals|leads|MRR|ARR|days|weeks|tickets|seats)\b/g,
    );
    if (metric) intel.metrics.push(...metric);

    if (/\b(p0|urgent|critical|high priority|top priority|asap|blocker for launch)\b/.test(lower)) {
      intel.priority = "high";
    } else if (/\b(low priority|nice to have|backlog|someday)\b/.test(lower) && !intel.priority) {
      intel.priority = "low";
    }
  }

  // Participants: explicit "attendees:/participants:" list, plus speaker prefixes.
  const attendeeLine = text.match(/\b(?:attendees|participants|present)\s*[:\-]\s*([^\n.]+)/i);
  const participantNames: string[] = [];
  if (attendeeLine) {
    for (const piece of attendeeLine[1].split(/,|\band\b|\//)) {
      const name = piece.trim().match(/^[A-Z][a-z]+/);
      if (name && !STOP_NAMES.has(name[0])) participantNames.push(name[0]);
    }
  }
  for (const line of text.split(/\n+/)) {
    const speaker = line.match(/^([A-Z][a-z]+)\s*:/);
    if (speaker && !STOP_NAMES.has(speaker[1])) participantNames.push(speaker[1]);
  }
  participantNames.push(...owners);

  intel.participants = dedupe(participantNames, 8);
  intel.decisions = dedupe(intel.decisions, 6);
  intel.actionItems = dedupe(intel.actionItems, 8);
  intel.owners = dedupe(owners, 8);
  intel.deadlines = dedupe(deadlines, 8);
  intel.blockers = dedupe(intel.blockers, 6);
  intel.risks = dedupe(intel.risks, 6);
  intel.openQuestions = dedupe(intel.openQuestions, 6);
  intel.followUps = dedupe(intel.followUps, 6);
  intel.contradictions = dedupe(intel.contradictions, 4);
  intel.customers = dedupe(intel.customers, 6);
  intel.metrics = dedupe(intel.metrics, 8);
  intel.sprints = dedupe(intel.sprints, 4);
  return intel;
}

export type MeetingMissingField =
  | "owner"
  | "deadline"
  | "decision"
  | "blocker"
  | "customer"
  | "action_item";

export const MEETING_MISSING_LABELS: Record<MeetingMissingField, string> = {
  owner: "No owner given",
  deadline: "No deadline given",
  decision: "No decision recorded",
  blocker: "No blocker details given",
  customer: "No customer name visible",
  action_item: "No action items captured",
};

/** Report which key meeting fields are absent (never invented). */
export function detectMissingMeetingFields(intel: MeetingIntelligence): MeetingMissingField[] {
  const missing: MeetingMissingField[] = [];
  if (intel.actionItems.length === 0) missing.push("action_item");
  if (intel.owners.length === 0) missing.push("owner");
  if (intel.deadlines.length === 0) missing.push("deadline");
  if (intel.decisions.length === 0) missing.push("decision");
  if (intel.blockers.length === 0) missing.push("blocker");
  if (intel.customers.length === 0) missing.push("customer");
  return missing;
}

const NOT_SPECIFIED = "Not specified";

function bulletList(items: string[]): string {
  return items.length ? items.map((i) => `* ${i}`).join("\n") : `* ${NOT_SPECIFIED}`;
}

/**
 * Render the Business Meeting Debrief markdown. Missing fields render as
 * "Not specified" — never invented.
 */
export function buildBusinessMeetingDebrief(
  intel: MeetingIntelligence,
  opts: { title?: string; summary?: string } = {},
): string {
  const title = (opts.title ?? intel.topic ?? "Meeting").trim();
  const summary = (opts.summary ?? "").trim() || NOT_SPECIFIED;

  const decisionRows = intel.decisions.length
    ? intel.decisions.map((d) => `* ${d}\n  * Confidence: ${NOT_SPECIFIED}\n  * Evidence: from transcript`)
    : [`* ${NOT_SPECIFIED}`];

  const actionRows = intel.actionItems.length
    ? intel.actionItems.map((a, i) => {
        const owner = intel.owners[i] ?? (intel.owners[0] ?? NOT_SPECIFIED);
        const deadline = intel.deadlines[i] ?? (intel.deadlines[0] ?? NOT_SPECIFIED);
        return `| ${a} | ${owner} | ${deadline} | transcript |`;
      })
    : [`| ${NOT_SPECIFIED} | ${NOT_SPECIFIED} | ${NOT_SPECIFIED} | — |`];

  const riskItems = [...intel.blockers, ...intel.risks];
  const riskRows = riskItems.length
    ? riskItems.map((r) => `| ${r} | ${NOT_SPECIFIED} | ${NOT_SPECIFIED} |`)
    : [`| ${NOT_SPECIFIED} | ${NOT_SPECIFIED} | ${NOT_SPECIFIED} |`];

  const questionRows = intel.openQuestions.length
    ? intel.openQuestions.map((q) => `* ${q}\n  * Who should answer: ${NOT_SPECIFIED}`)
    : [`* ${NOT_SPECIFIED}`];

  const followUp = intel.followUps.length
    ? intel.followUps.join(" ")
    : intel.decisions.length || intel.actionItems.length
      ? `Recap: ${[...intel.decisions, ...intel.actionItems].slice(0, 3).join("; ")}.`
      : NOT_SPECIFIED;

  const agendaItems = [
    ...intel.openQuestions.slice(0, 3),
    ...intel.blockers.slice(0, 2).map((b) => `Resolve: ${b}`),
  ];

  return [
    "# Meeting Debrief",
    "",
    `_${title}_`,
    "",
    "## Executive summary",
    "",
    summary,
    "",
    "## Decisions",
    "",
    decisionRows.join("\n"),
    "",
    "## Action items",
    "",
    "| Action | Owner | Deadline | Source |",
    "| ------ | ----- | -------- | ------ |",
    actionRows.join("\n"),
    "",
    "## Blockers / risks",
    "",
    "| Risk | Impact | Suggested next step |",
    "| ---- | ------ | ------------------- |",
    riskRows.join("\n"),
    "",
    "## Open questions",
    "",
    questionRows.join("\n"),
    "",
    "## Follow-up message draft",
    "",
    followUp,
    "",
    "## Next meeting agenda",
    "",
    bulletList(agendaItems),
    "",
  ].join("\n");
}

const MISSING_CALLOUT_RE =
  /(no owner|not specified|no deadline|not given|unspecified|none (given|recorded|specified)|isn'?t (an )?owner|wasn'?t (a )?deadline|nobody (was )?assigned|no (one|specific) owner|no action items?|no concrete|tbd|to be (decided|determined|confirmed|assigned)|not (a |an )?(formal |final )?decision|no (design |formal |final )?decision|not yet (decided|determined|set|assigned)|yet to be|pending (user |further )?(research|review|decision)|blocked until|status update, not)/i;

/** True when an answer explicitly flags a missing meeting field. */
function answerCallsOutMissing(answer: string): boolean {
  return MISSING_CALLOUT_RE.test(answer);
}

const NON_OWNER_WORDS = new Set([
  "given", "is", "was", "specified", "assigned", "listed", "named", "here",
  "none", "no", "not", "unknown", "tbd", "missing", "unspecified", "nobody",
  "unclear", "pending", "the", "a", "an",
]);

/**
 * Detect an invented owner: the answer names an owner (capitalized proper name)
 * even though the transcript recorded none.
 */
function answerInventsOwner(answer: string, ownersEmpty: boolean): boolean {
  if (!ownersEmpty) return false;
  const m = /\bowner[:\s]+([A-Za-z]+)/i.exec(answer);
  if (!m) return false;
  const word = m[1];
  if (NON_OWNER_WORDS.has(word.toLowerCase())) return false;
  // A real assignment names a capitalized person.
  return /^[A-Z][a-z]+$/.test(word);
}

export type MeetingVerdict = "strong" | "acceptable" | "weak";

export interface MeetingVerdictResult {
  verdict: MeetingVerdict;
  reasons: string[];
  mentionedFacts: string[];
  missingCalledOut: boolean;
  hallucinatedOwner: boolean;
}

/**
 * Grade a meeting answer against the known scenario facts.
 * - strong: mentions specific facts + extracts decisions/actions/blockers + calls
 *   out missing owners/deadlines when absent.
 * - acceptable: accurate but thin, and clearly states what is missing.
 * - weak: generic, invents owners/deadlines, or ignores decisions/blockers.
 */
export function meetingAnswerVerdict(
  answer: string,
  intel: MeetingIntelligence,
): MeetingVerdictResult {
  const text = (answer ?? "").toLowerCase();
  const reasons: string[] = [];
  const mentionedFacts: string[] = [];

  const factPool = [
    ...intel.participants,
    ...intel.customers,
    ...intel.sprints,
    ...intel.metrics,
    ...intel.owners,
  ];
  for (const fact of factPool) {
    if (fact && text.includes(fact.toLowerCase())) mentionedFacts.push(fact);
  }

  const extractsDecisions = intel.decisions.length === 0 || /decid|agreed|approved|decision|go with|chose/.test(text);
  const extractsActions = /action|next step|to-?do|will |follow up|owner|deadline|by /.test(text);
  const extractsBlockers = intel.blockers.length === 0 || /block|risk|waiting on|stuck|dependency/.test(text);

  const missing = detectMissingMeetingFields(intel);
  // The "strong" gate centers on accountability fields (owner/deadline/action).
  // Decision/customer/blocker absence is reported but not required, since many
  // valid meetings simply have no decision or no external customer.
  const criticalMissing = missing.filter(
    (m) => m === "owner" || m === "deadline" || m === "action_item",
  );
  const missingCalledOut = criticalMissing.length === 0 || answerCallsOutMissing(answer ?? "");

  const hallucinatedOwner = answerInventsOwner(answer ?? "", intel.owners.length === 0);

  if (mentionedFacts.length > 0) reasons.push(`mentions ${mentionedFacts.length} session fact(s)`);
  else reasons.push("no specific session facts mentioned");
  if (extractsDecisions) reasons.push("addresses decisions");
  if (extractsActions) reasons.push("addresses action items");
  if (extractsBlockers) reasons.push("addresses blockers/risks");
  if (!missingCalledOut) reasons.push("does not call out missing owners/deadlines");
  if (hallucinatedOwner) reasons.push("appears to invent an owner");

  let verdict: MeetingVerdict;
  const hasFacts = mentionedFacts.length > 0;
  const extractsCore = extractsDecisions && extractsActions && extractsBlockers;
  const isGeneric = !hasFacts && !extractsCore;

  if (hallucinatedOwner || isGeneric || (!extractsCore && !missingCalledOut)) {
    verdict = "weak";
  } else if (hasFacts && extractsCore && missingCalledOut) {
    verdict = "strong";
  } else if (missingCalledOut || hasFacts) {
    verdict = "acceptable";
  } else {
    verdict = "weak";
  }

  return { verdict, reasons, mentionedFacts, missingCalledOut, hallucinatedOwner };
}
