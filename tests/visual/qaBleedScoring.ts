/**
 * Shared bleed-term scoring — subtract terms explicitly allowed by the scenario prompt.
 */

export const AI_FRONT_DESK_BLEED_TERMS = [
  "AI Front Desk",
  "AI receptionist",
  "AI Receptionist",
  "missed calls",
  "missed-call recovery",
  "SMS follow-up",
  "delayed SMS",
  "0 pilots",
  "pilot customers",
  "plumbers",
  "HVAC",
  "Relevant Past Outcome",
];

/** Always forbidden in general answers unless scenario explicitly allows via allowedTerms. */
export const ALWAYS_FORBIDDEN_BLEED_TERMS = [
  "AI Front Desk",
  "AI receptionist",
  "AI Receptionist",
  "delayed SMS",
  "0 pilots",
  "Relevant Past Outcome",
  "Relevant Past Outcomes",
];

const SMS_BLEED_TERMS = new Set(
  ["SMS follow-up", "delayed SMS", "sms follow-up", "sms follow up", "delayed sms"].map((t) =>
    t.toLowerCase(),
  ),
);

/** Prompt explicitly asks about SMS/text alerts — not merely "missed-call recovery". */
export function promptExplicitlyAllowsSms(prompt: string): boolean {
  return /\b(sms|text alert|text message|text follow-up|text follow up)\b/i.test(prompt);
}

export function collectAllowedTerms(scenario: {
  prompt: string;
  allowedTerms?: string[];
}): string[] {
  const allowed = new Set<string>();
  const promptLower = scenario.prompt.toLowerCase();
  const smsAllowed = promptExplicitlyAllowsSms(scenario.prompt);

  for (const term of scenario.allowedTerms ?? []) {
    allowed.add(term.toLowerCase());
  }

  for (const term of AI_FRONT_DESK_BLEED_TERMS) {
    const termLower = term.toLowerCase();
    if (SMS_BLEED_TERMS.has(termLower) && !smsAllowed) {
      continue;
    }
    if (promptLower.includes(termLower)) {
      allowed.add(termLower);
    }
  }

  return [...allowed];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function termAllowedInAnswer(term: string, allowedLower: string[]): boolean {
  const t = term.toLowerCase();
  return allowedLower.some((a) => {
    if (t === a) return true;
    if (a.length >= 10 && (t.includes(a) || a.includes(t))) return true;
    return new RegExp(`\\b${escapeRegExp(a)}\\b`, "i").test(t);
  });
}

export function detectBleedTerms(
  answer: string,
  terms: string[],
  allowedLower: string[],
): string[] {
  const lower = answer.toLowerCase();
  const hits: string[] = [];
  for (const term of terms) {
    if (!lower.includes(term.toLowerCase())) continue;
    if (termAllowedInAnswer(term, allowedLower)) continue;
    hits.push(term);
  }
  return hits;
}
