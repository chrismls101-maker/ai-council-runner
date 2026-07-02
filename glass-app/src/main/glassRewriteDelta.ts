/**
 * Glass Rewrite — delta engine.
 *
 * When the user pauses at a paragraph boundary in a compose field and a source
 * ledger exists for the same thread/window, a single Haiku call compares the
 * draft against the ledger and returns structured findings (missing /
 * contradicts / tone). Findings render as beads on the margin rail — Glass has
 * no visible presence when the draft is clean.
 */

import { screen } from "electron";
import { listApiKeys, getApiKeyValue } from "./apiKeyStore.ts";
import { getWindows } from "./windows.ts";
import {
  parseRewriteFindingsJson,
  type RewriteFinding,
  type RewriteFindingsState,
  type RewriteSourceLedger,
} from "../shared/glassRewriteTypes.ts";
import { getRewriteLedgerForContext } from "./glassRewriteLedger.ts";
import {
  replaceFocusedFieldSpan,
  type FocusedTextFieldSnapshot,
} from "./glassTypingIntelligence.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const DELTA_TIMEOUT_MS = 10_000;
/** Pause after a paragraph boundary before the delta runs. */
const PARAGRAPH_PAUSE_MS = 2_000;
/** Send-imminent watcher poll while unresolved findings exist. */
const SEND_WATCH_POLL_MS = 300;

export type RewriteDeltaHost = {
  isEnabled: () => boolean;
  getWindowTitle: () => string | null;
  onFindings: (state: RewriteFindingsState) => void;
};

let host: RewriteDeltaHost | null = null;
let lastField: FocusedTextFieldSnapshot | null = null;
let lastText = "";
let lastTextChangeAt = 0;
let analyzedTextKey = "";
let deltaInFlight = false;
let currentFindings: RewriteFinding[] = [];
let currentLedger: RewriteSourceLedger | null = null;
let sendWatchTimer: ReturnType<typeof setInterval> | null = null;
let cursorWasInsideField = false;
let sendFlareNonce = 0;
let flaredOnce = false;

function resolveAnthropicKey(): string | null {
  const keys = listApiKeys();
  for (const meta of keys) {
    if (meta.service.toLowerCase().includes("anthropic")) {
      const value = getApiKeyValue(meta.id);
      if (value) return value;
    }
  }
  return process.env.ANTHROPIC_API_KEY?.trim() ?? null;
}

export function configureRewriteDelta(next: RewriteDeltaHost): void {
  host = next;
}

function toOverlayBounds(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number; width: number; height: number } {
  const overlay = getWindows()?.overlay;
  if (!overlay || overlay.isDestroyed()) return bounds;
  const [ox, oy] = overlay.getPosition();
  return { x: bounds.x - ox, y: bounds.y - oy, width: bounds.width, height: bounds.height };
}

function emitFindings(): void {
  if (!host) return;
  host.onFindings({
    fieldBounds: lastField ? toOverlayBounds(lastField.bounds) : null,
    findings: currentFindings,
    sendFlareNonce: sendFlareNonce || undefined,
    sendFlareFindingId: flaredOnce
      ? currentFindings.find((f) => f.category === "contradicts")?.id ?? null
      : null,
  });
}

function clearFindings(): void {
  if (currentFindings.length === 0 && !lastField) return;
  currentFindings = [];
  flaredOnce = false;
  stopSendWatch();
  emitFindings();
}

function endsAtParagraphBoundary(text: string): boolean {
  const trimmed = text.trimEnd();
  if (!trimmed) return false;
  const last = trimmed[trimmed.length - 1]!;
  return last === "." || last === "!" || last === "?" || text.endsWith("\n");
}

/**
 * Called from the focused-field poll with the latest compose snapshot (or null
 * when no compose field is focused).
 */
export function notifyRewriteComposeSnapshot(field: FocusedTextFieldSnapshot | null): void {
  if (!host?.isEnabled()) return;

  if (!field || field.secure) {
    lastField = null;
    lastText = "";
    analyzedTextKey = "";
    clearFindings();
    return;
  }

  const fieldChanged = !lastField || lastField.appName !== field.appName;
  lastField = field;

  if (field.text !== lastText) {
    lastText = field.text;
    lastTextChangeAt = Date.now();
    // Draft moved — beads for stale paragraphs would lie; recompute on next pause.
    if (currentFindings.length > 0) {
      currentFindings = currentFindings.filter(
        (f) => !f.draftSpan || f.draftSpan.end <= field.text.length,
      );
      emitFindings();
    }
    return;
  }

  if (fieldChanged) {
    clearFindings();
    return;
  }

  if (deltaInFlight) return;
  if (!field.text.trim() || !endsAtParagraphBoundary(field.text)) return;
  if (Date.now() - lastTextChangeAt < PARAGRAPH_PAUSE_MS) return;

  const textKey = `${field.appName}:${field.text.length}:${field.text.slice(-80)}`;
  if (textKey === analyzedTextKey) return;

  const ledger = getRewriteLedgerForContext(field.appName, host.getWindowTitle());
  if (!ledger) return;

  analyzedTextKey = textKey;
  deltaInFlight = true;
  void runDelta(field, ledger).finally(() => {
    deltaInFlight = false;
  });
}

function buildDeltaPrompt(ledger: RewriteSourceLedger, draft: string): string {
  return `The user is replying to a message. Here is what the OTHER person's message contained:

Questions asked: ${JSON.stringify(ledger.questionsAsked)}
Requests made: ${JSON.stringify(ledger.requestsMade)}
Facts and numbers: ${JSON.stringify(ledger.factsAndNumbers)}
Deadlines: ${JSON.stringify(ledger.deadlines)}
Sender: ${ledger.senderName ?? "unknown"}
Their tone: ${ledger.toneSignal}

Here is the user's current draft reply (character indices matter):
"""${draft}"""

Compare the draft against their message. Return a JSON array (max 4 items, empty array if the draft is clean):
[{
  "category": "missing" | "contradicts" | "tone",
  "description": string,          // e.g. "They asked about Q1 pricing"
  "sourceQuote": string,          // exact words from THEIR message
  "draftSpan": {"start": number, "end": number} | null,  // char range in the draft (required for "contradicts")
  "suggestion": string | null     // corrected text for the span, or a suggested sentence
}]

Rules:
- "missing": a question/request/deadline from their message the draft does not address.
- "contradicts": the draft states a fact/number that conflicts with theirs — include the exact draftSpan and a suggestion.
- "tone": only when the draft's register sharply mismatches theirs (max 1 tone finding).
- Do not invent findings. An empty array is a good answer.`;
}

async function runDelta(
  field: FocusedTextFieldSnapshot,
  ledger: RewriteSourceLedger,
): Promise<void> {
  const apiKey = resolveAnthropicKey();
  if (!apiKey) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELTA_TIMEOUT_MS);
  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 800,
        messages: [{ role: "user", content: buildDeltaPrompt(ledger, field.text) }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return;
    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = data.content?.find((c) => c.type === "text")?.text?.trim() ?? "";
    if (!text) return;

    // Field may have moved on while the model ran.
    if (!lastField || lastField.text !== field.text) return;

    currentLedger = ledger;
    currentFindings = parseRewriteFindingsJson(text, field.text);
    flaredOnce = false;
    emitFindings();
    syncSendWatch();
  } catch {
    /* silent */
  } finally {
    clearTimeout(timer);
  }
}

// ── Send-moment gate ─────────────────────────────────────────────────────────
// A single amber flare when the cursor leaves the compose field (reaching for
// Send) while an unresolved contradiction exists. Never blocks. Missing/tone
// findings never flare.

function stopSendWatch(): void {
  if (sendWatchTimer) {
    clearInterval(sendWatchTimer);
    sendWatchTimer = null;
  }
  cursorWasInsideField = false;
}

function syncSendWatch(): void {
  const hasContradiction = currentFindings.some((f) => f.category === "contradicts");
  if (!hasContradiction || flaredOnce) {
    stopSendWatch();
    return;
  }
  if (sendWatchTimer) return;
  sendWatchTimer = setInterval(() => {
    if (!lastField || flaredOnce) {
      stopSendWatch();
      return;
    }
    const cursor = screen.getCursorScreenPoint();
    const b = lastField.bounds;
    const inside =
      cursor.x >= b.x && cursor.x <= b.x + b.width && cursor.y >= b.y && cursor.y <= b.y + b.height;
    if (cursorWasInsideField && !inside) {
      flaredOnce = true;
      sendFlareNonce = Date.now();
      emitFindings();
      stopSendWatch();
    }
    cursorWasInsideField = inside;
  }, SEND_WATCH_POLL_MS);
}

/** Apply a finding: ranged replacement (contradicts/tone) or end-insert (missing). */
export async function applyRewriteFinding(findingId: string): Promise<boolean> {
  const finding = currentFindings.find((f) => f.id === findingId);
  if (!finding || !lastField) return false;

  const field = lastField;
  let ok = false;
  if (finding.draftSpan && finding.suggestion) {
    ok = await replaceFocusedFieldSpan({
      originalText: field.text,
      start: finding.draftSpan.start,
      end: finding.draftSpan.end,
      replacement: finding.suggestion,
      appName: field.appName,
      source: field.source,
    });
  } else if (finding.suggestion) {
    const separator = field.text.endsWith("\n") || field.text.length === 0 ? "" : "\n\n";
    ok = await replaceFocusedFieldSpan({
      originalText: field.text,
      start: field.text.length,
      end: field.text.length,
      replacement: `${separator}${finding.suggestion}`,
      appName: field.appName,
      source: field.source,
    });
  }

  if (ok) {
    currentFindings = currentFindings.filter((f) => f.id !== findingId);
    analyzedTextKey = ""; // field content changed
    emitFindings();
    syncSendWatch();
  }
  return ok;
}

export function getRewriteFindingsForTest(): RewriteFinding[] {
  return currentFindings;
}

export { type RewriteSourceLedger, currentLedger as _currentLedgerForDebug };
