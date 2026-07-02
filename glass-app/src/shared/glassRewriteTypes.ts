/**
 * Glass Rewrite — source ledger + delta engine types.
 *
 * The ledger is what Glass read in the *other* document (their email, the
 * brief, the thread). The delta engine compares the user's draft against it
 * and returns structured findings rendered as beads on the margin rail.
 */

export type RewriteFindingCategory = "missing" | "contradicts" | "tone";

export interface RewriteFinding {
  /** Stable id for apply/dismiss plumbing. */
  id: string;
  category: RewriteFindingCategory;
  /** "They asked about Q1 pricing" */
  description: string;
  /** Exact words from their message — the proof Glass read it. */
  sourceQuote: string;
  /** Char range in the draft (for "contradicts" ranged replacement). */
  draftSpan?: { start: number; end: number };
  /** The fixed text (contradicts) or suggested sentence (tone/missing insert). */
  suggestion?: string;
  /** 0-1 vertical position of the finding's paragraph within the field. */
  paragraphFraction: number;
}

/** What Glass extracted while the user was reading a received message. */
export interface RewriteSourceLedger {
  /** window + document identity this ledger belongs to. */
  contextKey: string;
  appName: string;
  windowTitle: string | null;
  questionsAsked: string[];
  requestsMade: string[];
  factsAndNumbers: Array<{ value: string; context: string }>;
  deadlines: string[];
  senderName: string | null;
  toneSignal: "formal" | "casual" | "urgent" | "friendly";
  capturedAt: number;
}

/** Renderer snapshot — margin rail state for the focused compose field. */
export interface RewriteFindingsState {
  /** Overlay-local px bounds of the compose field the rail attaches to. */
  fieldBounds: { x: number; y: number; width: number; height: number } | null;
  findings: RewriteFinding[];
  /** Nonce bumps when the send-moment gate flares an unresolved contradiction. */
  sendFlareNonce?: number;
  /** Finding id to flare (amber, 300ms, once). */
  sendFlareFindingId?: string | null;
}

export function parseRewriteLedgerJson(text: string): Omit<
  RewriteSourceLedger,
  "contextKey" | "appName" | "windowTitle" | "capturedAt"
> | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      questionsAsked?: unknown;
      requestsMade?: unknown;
      factsAndNumbers?: unknown;
      deadlines?: unknown;
      senderName?: unknown;
      toneSignal?: unknown;
    };
    const strings = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.trim().length > 0) : [];
    const facts = Array.isArray(parsed.factsAndNumbers)
      ? parsed.factsAndNumbers
          .map((f) => {
            if (!f || typeof f !== "object") return null;
            const obj = f as { value?: unknown; context?: unknown };
            if (typeof obj.value !== "string" || !obj.value.trim()) return null;
            return {
              value: obj.value.trim(),
              context: typeof obj.context === "string" ? obj.context.trim() : "",
            };
          })
          .filter((f): f is { value: string; context: string } => f != null)
      : [];
    const tone =
      parsed.toneSignal === "formal"
      || parsed.toneSignal === "casual"
      || parsed.toneSignal === "urgent"
      || parsed.toneSignal === "friendly"
        ? parsed.toneSignal
        : "formal";
    return {
      questionsAsked: strings(parsed.questionsAsked),
      requestsMade: strings(parsed.requestsMade),
      factsAndNumbers: facts,
      deadlines: strings(parsed.deadlines),
      senderName: typeof parsed.senderName === "string" ? parsed.senderName.trim() || null : null,
      toneSignal: tone,
    };
  } catch {
    return null;
  }
}

export function parseRewriteFindingsJson(
  text: string,
  draft: string,
): RewriteFinding[] {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];
    const findings: RewriteFinding[] = [];
    for (let i = 0; i < parsed.length && findings.length < 8; i += 1) {
      const raw = parsed[i] as {
        category?: unknown;
        description?: unknown;
        sourceQuote?: unknown;
        draftSpan?: { start?: unknown; end?: unknown };
        suggestion?: unknown;
      };
      const category =
        raw?.category === "missing" || raw?.category === "contradicts" || raw?.category === "tone"
          ? raw.category
          : null;
      if (!category) continue;
      if (typeof raw.description !== "string" || !raw.description.trim()) continue;
      if (typeof raw.sourceQuote !== "string" || !raw.sourceQuote.trim()) continue;

      let draftSpan: { start: number; end: number } | undefined;
      if (
        raw.draftSpan
        && typeof raw.draftSpan.start === "number"
        && typeof raw.draftSpan.end === "number"
        && raw.draftSpan.start >= 0
        && raw.draftSpan.end > raw.draftSpan.start
        && raw.draftSpan.end <= draft.length
      ) {
        draftSpan = { start: Math.floor(raw.draftSpan.start), end: Math.floor(raw.draftSpan.end) };
      }

      const anchorIndex = draftSpan?.start ?? draft.length;
      const paragraphFraction = draft.length > 0
        ? Math.max(0, Math.min(1, anchorIndex / draft.length))
        : 0;

      findings.push({
        id: `finding-${Date.now()}-${i}`,
        category,
        description: raw.description.trim(),
        sourceQuote: raw.sourceQuote.trim(),
        draftSpan,
        suggestion: typeof raw.suggestion === "string" ? raw.suggestion.trim() || undefined : undefined,
        paragraphFraction,
      });
    }
    return findings;
  } catch {
    return [];
  }
}
