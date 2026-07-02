/**
 * Glass Rewrite — source ledger extraction.
 *
 * While the user reads a received message (not a compose field), a single
 * Haiku call extracts what was asked, requested, promised, and in what tone.
 * The ledger is cached by window + document identity and later compared
 * against the user's draft by the delta engine.
 */

import { listApiKeys, getApiKeyValue } from "./apiKeyStore.ts";
import { captureForTextOverlay } from "./textOverlayCapture.ts";
import {
  parseRewriteLedgerJson,
  type RewriteSourceLedger,
} from "../shared/glassRewriteTypes.ts";
import { isGlassAppName } from "../shared/textOverlayTypes.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const LEDGER_TIMEOUT_MS = 12_000;
/** Reading dwell before a ledger extraction fires. */
const READING_DWELL_MS = 8_000;
/** Ledgers older than this are dropped — the thread has moved on. */
const LEDGER_MAX_AGE_MS = 30 * 60_000;
const MAX_LEDGERS = 12;

const LEDGER_PROMPT = `You are reading a message/document that someone SENT to the user (they are reading it, not writing it). Extract a reply ledger as JSON:
{
  "questionsAsked": string[],        // explicit questions the sender asked
  "requestsMade": string[],          // things the sender asked the user to do
  "factsAndNumbers": [{"value": string, "context": string}],  // prices, dates, quantities, commitments
  "deadlines": string[],             // any deadlines or time constraints
  "senderName": string | null,
  "toneSignal": "formal" | "casual" | "urgent" | "friendly"
}
If the screen does not show a received message or readable document, respond with exactly: SKIP`;

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

function contextKeyFor(appName: string, windowTitle: string | null): string {
  return `${appName.trim()}::${(windowTitle ?? "").trim()}`;
}

const ledgers = new Map<string, RewriteSourceLedger>();
const attemptedContexts = new Set<string>();

type ReadingContext = {
  appName: string;
  windowTitle: string | null;
  readingSince: number;
};
let reading: ReadingContext | null = null;
let extractionInFlight = false;

export type RewriteLedgerHost = {
  isEnabled: () => boolean;
  getDisplayTarget: () => import("../shared/glassSettings.ts").GlassDisplayTarget;
};

let host: RewriteLedgerHost | null = null;

export function configureRewriteLedger(next: RewriteLedgerHost): void {
  host = next;
}

/** Ledger for the current thread/window, or null. */
export function getRewriteLedgerForContext(
  appName: string | undefined,
  windowTitle: string | null,
): RewriteSourceLedger | null {
  if (!appName) return null;
  const ledger = ledgers.get(contextKeyFor(appName, windowTitle));
  if (!ledger) return null;
  if (Date.now() - ledger.capturedAt > LEDGER_MAX_AGE_MS) {
    ledgers.delete(ledger.contextKey);
    return null;
  }
  return ledger;
}

/**
 * Called from the focused-field poll: `composeFieldFocused === false` means the
 * user is reading. After 8s of dwell on the same window, extract once.
 */
export function notifyRewriteReadingContext(input: {
  appName: string | undefined;
  windowTitle: string | null;
  composeFieldFocused: boolean;
}): void {
  if (!host?.isEnabled()) return;
  const appName = input.appName?.trim();
  if (!appName || isGlassAppName(appName)) {
    reading = null;
    return;
  }

  if (input.composeFieldFocused) {
    // Writing, not reading — reset the dwell.
    reading = null;
    return;
  }

  const key = contextKeyFor(appName, input.windowTitle);
  if (ledgers.has(key) || attemptedContexts.has(key)) return;

  if (
    !reading
    || reading.appName !== appName
    || (reading.windowTitle ?? "") !== (input.windowTitle ?? "")
  ) {
    reading = { appName, windowTitle: input.windowTitle, readingSince: Date.now() };
    return;
  }

  if (Date.now() - reading.readingSince >= READING_DWELL_MS && !extractionInFlight) {
    extractionInFlight = true;
    attemptedContexts.add(key);
    void maybeExtractRewriteLedger({
      appName,
      windowTitle: input.windowTitle,
    }).finally(() => {
      extractionInFlight = false;
    });
  }
}

/** Capture the screen and extract a ledger for the given context. */
export async function maybeExtractRewriteLedger(input: {
  appName: string;
  windowTitle: string | null;
  imageDataUrl?: string;
}): Promise<RewriteSourceLedger | null> {
  const apiKey = resolveAnthropicKey();
  if (!apiKey) return null;

  let imageDataUrl = input.imageDataUrl;
  if (!imageDataUrl) {
    const capture = await captureForTextOverlay({
      displayTarget: host?.getDisplayTarget() ?? "primary",
      mode: "full",
      hideGlassChrome: false,
    });
    if (!capture) return null;
    imageDataUrl = capture.imageDataUrl;
  }

  const match = /^data:([^;]+);base64,(.+)$/.exec(imageDataUrl.trim());
  const mediaType = match?.[1] ?? "image/png";
  const base64 = match?.[2] ?? imageDataUrl;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LEDGER_TIMEOUT_MS);
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
        max_tokens: 700,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              { type: "text", text: LEDGER_PROMPT },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = data.content?.find((c) => c.type === "text")?.text?.trim() ?? "";
    if (!text || text.toUpperCase() === "SKIP") return null;

    const parsed = parseRewriteLedgerJson(text);
    if (!parsed) return null;
    if (
      parsed.questionsAsked.length === 0
      && parsed.requestsMade.length === 0
      && parsed.factsAndNumbers.length === 0
      && parsed.deadlines.length === 0
    ) {
      return null;
    }

    const contextKey = contextKeyFor(input.appName, input.windowTitle);
    const ledger: RewriteSourceLedger = {
      ...parsed,
      contextKey,
      appName: input.appName,
      windowTitle: input.windowTitle,
      capturedAt: Date.now(),
    };
    ledgers.set(contextKey, ledger);
    if (ledgers.size > MAX_LEDGERS) {
      const oldest = [...ledgers.values()].sort((a, b) => a.capturedAt - b.capturedAt)[0];
      if (oldest) ledgers.delete(oldest.contextKey);
    }
    return ledger;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Test/E2E — seed a ledger directly. */
export function e2eSeedRewriteLedger(ledger: RewriteSourceLedger): void {
  ledgers.set(ledger.contextKey, ledger);
  attemptedContexts.delete(ledger.contextKey);
}
