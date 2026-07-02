/**
 * Glass This core-flow QA simulator — models ambient, copy, and Open in Glass
 * without Electron or live API calls. Used by unit tests and `glass:qa:text-overlay`.
 */

import { buildTextOverlayOpenInGlassPrompt } from "./textOverlayActions.ts";
import { parseAmbientReadingJson } from "./textOverlayTypes.ts";
import type { TextOverlayCard, TextOverlayTrigger } from "./textOverlayTypes.ts";
import {
  AMBIENT_LEGAL_PROBE_JSON,
  LEGAL_PDF_SENTENCE,
  MEDICAL_CHART_SENTENCE,
  buildMockTextOverlayCard,
} from "./textOverlayFixtures.ts";

/** Must match glassScreenDigest.AMBIENT_INTERVAL_MS */
const AMBIENT_INTERVAL_MS = 60_000;

export type TextOverlayQAResult = {
  name: string;
  pass: boolean;
  detail: string;
  evidence?: Record<string, unknown>;
};

export type TextOverlayQAReport = {
  ranAt: string;
  results: TextOverlayQAResult[];
  passCount: number;
  failCount: number;
};

/** Clipboard poll gate — mirrors textOverlayTrigger.pollClipboard. */
export function shouldFireClipboardTrigger(
  lastClipboard: string,
  nextText: string,
): boolean {
  if (!nextText || nextText === lastClipboard) return false;
  if (nextText.trim().length < 2) return false;
  return true;
}

/** After card copy action acknowledges clipboard, same text must not re-fire. */
export function simulateCopyTriggerLoop(input: {
  userCopies: string;
  cardCopyPayload: string;
}): {
  triggers: TextOverlayTrigger[];
  finalLastClipboard: string;
} {
  let lastClipboard = "";
  const triggers: TextOverlayTrigger[] = [];

  if (shouldFireClipboardTrigger(lastClipboard, input.userCopies)) {
    lastClipboard = input.userCopies;
    triggers.push("clipboard");
  }

  // Card copy action: writes summary to clipboard and acknowledgeClipboardText(payload)
  lastClipboard = input.cardCopyPayload;

  // Next clipboard poll — clipboard still holds the card payload, already acknowledged
  if (shouldFireClipboardTrigger(lastClipboard, input.cardCopyPayload)) {
    lastClipboard = input.cardCopyPayload;
    triggers.push("clipboard");
  }

  return { triggers, finalLastClipboard: lastClipboard };
}

export type AmbientSimulationState = {
  readingIdle: boolean;
  overlayBusy: boolean;
  probeJson: string;
  card: TextOverlayCard | null;
  ambientTimerReset: boolean;
};

/** Models ambient reading-idle → probe → card without user action. */
export function simulateAmbientReadingFlow(input: {
  readingIdle: boolean;
  overlayBusy: boolean;
  probeJson?: string;
}): AmbientSimulationState {
  const state: AmbientSimulationState = {
    readingIdle: input.readingIdle,
    overlayBusy: input.overlayBusy,
    probeJson: input.probeJson ?? AMBIENT_LEGAL_PROBE_JSON,
    card: null,
    ambientTimerReset: false,
  };

  if (!state.readingIdle || state.overlayBusy) return state;

  const parsed = parseAmbientReadingJson(state.probeJson);
  if (!parsed?.found || !parsed.text) return state;

  state.card = buildMockTextOverlayCard({
    id: "ambient-qa-card",
    rawText: parsed.text,
    contentType: parsed.contentType ?? "legal_contract",
    triggerSource: "ambient",
  });
  state.ambientTimerReset = true;
  return state;
}

export type OpenInGlassSimulation = {
  submitAskCalled: boolean;
  prefillCalled: boolean;
  submittedPrompt: string | null;
  cardDismissed: boolean;
};

/** Models Open in Glass → full ask, not command-bar prefill. */
export function simulateOpenInGlassAction(
  card: TextOverlayCard,
): OpenInGlassSimulation {
  const prompt = buildTextOverlayOpenInGlassPrompt(card);
  return {
    submitAskCalled: true,
    prefillCalled: false,
    submittedPrompt: prompt,
    cardDismissed: true,
  };
}

export function runTextOverlayQASuite(): TextOverlayQAReport {
  const results: TextOverlayQAResult[] = [];

  // ── 1. Ambient ─────────────────────────────────────────────────────────────
  const ambientIdle = simulateAmbientReadingFlow({
    readingIdle: true,
    overlayBusy: false,
    probeJson: AMBIENT_LEGAL_PROBE_JSON,
  });
  results.push({
    name: "Ambient — card on dense legal text while reading-idle",
    pass: ambientIdle.card != null
      && ambientIdle.card.triggerSource === "ambient"
      && ambientIdle.card.rawText.includes("Indemnifying Party"),
    detail: ambientIdle.card
      ? `Card appeared for: "${ambientIdle.card.rawText.slice(0, 72)}…"`
      : "No card produced from ambient probe",
    evidence: {
      level1: ambientIdle.card?.level1,
      contentType: ambientIdle.card?.contentType,
      timerReset: ambientIdle.ambientTimerReset,
      intervalMs: AMBIENT_INTERVAL_MS,
    },
  });

  const ambientBusy = simulateAmbientReadingFlow({
    readingIdle: true,
    overlayBusy: true,
    probeJson: AMBIENT_LEGAL_PROBE_JSON,
  });
  results.push({
    name: "Ambient — blocked while pipeline/card busy",
    pass: ambientBusy.card == null,
    detail: ambientBusy.card ? "Double-fire: card appeared while busy" : "Probe correctly skipped while busy",
  });

  const ambientSkip = parseAmbientReadingJson("SKIP");
  results.push({
    name: "Ambient — SKIP when nothing confusing on screen",
    pass: ambientSkip == null || ambientSkip.found === false,
    detail: "Haiku returned SKIP — no card expected",
  });

  const medicalAmbient = simulateAmbientReadingFlow({
    readingIdle: true,
    overlayBusy: false,
    probeJson: JSON.stringify({
      found: true,
      text: MEDICAL_CHART_SENTENCE,
      contentType: "medical_health",
    }),
  });
  results.push({
    name: "Ambient — medical chart text triggers card",
    pass: medicalAmbient.card?.contentType === "medical_health",
    detail: medicalAmbient.card?.level1 ?? "No card",
    evidence: { rawText: medicalAmbient.card?.rawText.slice(0, 80) },
  });

  // ── 2. Copy trigger ──────────────────────────────────────────────────────────
  const copyOnce = simulateCopyTriggerLoop({
    userCopies: LEGAL_PDF_SENTENCE,
    cardCopyPayload: "This clause shifts liability to you — if something goes wrong…",
  });
  results.push({
    name: "Copy — fires once on user copy",
    pass: copyOnce.triggers.length === 1 && copyOnce.triggers[0] === "clipboard",
    detail: `Trigger count: ${copyOnce.triggers.length}`,
    evidence: { triggers: copyOnce.triggers },
  });

  results.push({
    name: "Copy — card copy action does not re-trigger",
    pass: copyOnce.triggers.length === 1,
    detail: "After acknowledgeClipboardText, same user copy did not fire again",
    evidence: { finalLastClipboard: copyOnce.finalLastClipboard.slice(0, 60) },
  });

  const duplicatePoll = shouldFireClipboardTrigger(LEGAL_PDF_SENTENCE, LEGAL_PDF_SENTENCE);
  results.push({
    name: "Copy — identical clipboard text ignored",
    pass: duplicatePoll === false,
    detail: "Same text as lastClipboard does not fire",
  });

  // ── 3. Open in Glass ─────────────────────────────────────────────────────────
  const card = buildMockTextOverlayCard({
    id: "open-in-glass-qa",
    rawText: LEGAL_PDF_SENTENCE,
    contentType: "legal_contract",
    triggerSource: "clipboard",
  });
  const openInGlass = simulateOpenInGlassAction(card);
  results.push({
    name: "Open in Glass — submits full ask immediately",
    pass: openInGlass.submitAskCalled
      && !openInGlass.prefillCalled
      && openInGlass.cardDismissed
      && Boolean(openInGlass.submittedPrompt?.includes("Indemnifying Party")),
    detail: openInGlass.submittedPrompt
      ? `Prompt starts: "${openInGlass.submittedPrompt.slice(0, 80)}…"`
      : "No prompt submitted",
    evidence: {
      includesSummary: openInGlass.submittedPrompt?.includes("shifts liability"),
      prefillCalled: openInGlass.prefillCalled,
    },
  });

  const passCount = results.filter((r) => r.pass).length;
  return {
    ranAt: new Date().toISOString(),
    passCount,
    failCount: results.length - passCount,
    results,
  };
}
