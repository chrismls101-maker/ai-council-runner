/**
 * Aletheia pending advice queue (B2.1 — Advise-then-wait surface).
 *
 * Advice is surfaced separately from execution — cards stay pending until the
 * user approves or dismisses by voice or tap.
 */

import { randomUUID } from "node:crypto";
import type { AmbientSignalConnection } from "./aletheiaAmbientSynthesis.ts";
import type { AletheiaActivationState } from "./aletheiaActivationPolicy.ts";

export type AletheiaAdviceStatus = "pending" | "approved" | "dismissed";

export type AletheiaAdviceKind =
  | "terminal_error"
  | "debugging_context"
  | "screen_alignment"
  | "general";

export interface AletheiaAdviceCard {
  id: string;
  kind: AletheiaAdviceKind;
  status: AletheiaAdviceStatus;
  headline: string;
  body: string;
  question: string;
  /** Stable dedupe key — usually ambient connection id. */
  sourceKey: string;
  createdAt: number;
  resolvedAt?: number;
}

export interface AletheiaPendingAdviceSnapshot {
  updatedAt: number;
  cards: AletheiaAdviceCard[];
  /** Most recently surfaced pending card — for voice targeting. */
  focusAdviceId?: string;
}

export interface AdviceGenerationInput {
  now?: number;
  companionModeActive: boolean;
  companionPrivacyActive: boolean;
  activation?: AletheiaActivationState | null;
  connections: readonly AmbientSignalConnection[];
  existingCards: readonly AletheiaAdviceCard[];
}

export interface VoiceAdviceResolution {
  adviceId: string;
  decision: "approve" | "dismiss";
  matched: string;
}

const ADVICEABLE_CONNECTIONS = new Set([
  "terminal_clipboard_error",
  "terminal_dev_app",
  "clipboard_parallel_terminal",
]);

const YES_PATTERNS: RegExp[] = [
  /^(yes|yeah|yep|yup|sure|ok|okay|go ahead|do it|please do|sounds good|let'?s do it)\b/i,
  /^(yes|yeah|yep|yup|sure|ok|okay|go ahead|do it|please do|sounds good|let'?s do it)[.!?,]*$/i,
  /\b(yes please|go for it|that works|do that)\b/i,
];

const NO_PATTERNS: RegExp[] = [
  /^(no|nope|nah|not now|skip|never mind|nevermind|don'?t|dismiss|ignore)\b/i,
  /^(no|nope|nah|not now|skip|never mind|nevermind|don'?t|dismiss|ignore)[.!?,]*$/i,
  /\b(no thanks|not right now|leave it)\b/i,
];

function connectionKind(connectionId: string): AletheiaAdviceKind {
  if (connectionId.startsWith("terminal")) return "terminal_error";
  if (connectionId.startsWith("screen")) return "screen_alignment";
  if (connectionId.includes("clipboard")) return "debugging_context";
  return "general";
}

function adviceFromConnection(connection: AmbientSignalConnection, now: number): AletheiaAdviceCard {
  const kind = connectionKind(connection.id);
  const headline =
    kind === "terminal_error"
      ? "Build or command error detected"
      : kind === "debugging_context"
        ? "Clipboard and terminal both active"
        : "Context worth a look";

  let question = "Want me to help with this?";
  if (kind === "terminal_error") {
    question = "I can help investigate the error. Should I?";
  } else if (kind === "debugging_context") {
    question = "I can walk through what you copied. Should I?";
  }

  return {
    id: randomUUID(),
    kind,
    status: "pending",
    headline,
    body: connection.insight,
    question,
    sourceKey: connection.id,
    createdAt: now,
  };
}

export function emptyAletheiaPendingAdviceSnapshot(now = Date.now()): AletheiaPendingAdviceSnapshot {
  return { updatedAt: now, cards: [] };
}

export function canSurfaceAletheiaAdvice(input: AdviceGenerationInput): boolean {
  if (!input.companionModeActive || input.companionPrivacyActive) return false;
  const activation = input.activation;
  if (!activation) return false;
  if (activation.awaitingUserLead && activation.userTurnCount === 0) return false;
  return true;
}

export function generateAletheiaAdviceCards(input: AdviceGenerationInput): AletheiaAdviceCard[] {
  if (!canSurfaceAletheiaAdvice(input)) return [];

  const now = input.now ?? Date.now();
  const existingKeys = new Set(
    input.existingCards
      .filter((card) => card.status !== "dismissed")
      .map((card) => card.sourceKey),
  );

  const next: AletheiaAdviceCard[] = [];
  for (const connection of input.connections) {
    if (!ADVICEABLE_CONNECTIONS.has(connection.id)) continue;
    if (existingKeys.has(connection.id)) continue;
    next.push(adviceFromConnection(connection, now));
    existingKeys.add(connection.id);
  }
  return next;
}

export function mergeAletheiaAdviceCards(
  existing: readonly AletheiaAdviceCard[],
  incoming: readonly AletheiaAdviceCard[],
  now = Date.now(),
): AletheiaPendingAdviceSnapshot {
  const cards = [...existing];
  for (const card of incoming) {
    if (cards.some((row) => row.sourceKey === card.sourceKey && row.status !== "dismissed")) {
      continue;
    }
    cards.push(card);
  }

  const pending = cards.filter((row) => row.status === "pending");
  return {
    updatedAt: now,
    cards,
    focusAdviceId: pending[pending.length - 1]?.id,
  };
}

export function approveAletheiaAdvice(
  snapshot: AletheiaPendingAdviceSnapshot,
  adviceId: string,
  now = Date.now(),
): AletheiaPendingAdviceSnapshot {
  return {
    ...snapshot,
    updatedAt: now,
    cards: snapshot.cards.map((card) =>
      card.id === adviceId && card.status === "pending"
        ? { ...card, status: "approved", resolvedAt: now }
        : card,
    ),
    focusAdviceId: snapshot.cards.find((row) => row.status === "pending" && row.id !== adviceId)?.id,
  };
}

export function dismissAletheiaAdvice(
  snapshot: AletheiaPendingAdviceSnapshot,
  adviceId: string,
  now = Date.now(),
): AletheiaPendingAdviceSnapshot {
  return {
    ...snapshot,
    updatedAt: now,
    cards: snapshot.cards.map((card) =>
      card.id === adviceId && card.status === "pending"
        ? { ...card, status: "dismissed", resolvedAt: now }
        : card,
    ),
    focusAdviceId: snapshot.cards.find((row) => row.status === "pending" && row.id !== adviceId)?.id,
  };
}

export function pendingAletheiaAdviceCards(
  snapshot: AletheiaPendingAdviceSnapshot | null | undefined,
): AletheiaAdviceCard[] {
  return snapshot?.cards.filter((row) => row.status === "pending") ?? [];
}

export function resolveVoiceAdviceResponse(
  text: string,
  snapshot: AletheiaPendingAdviceSnapshot | null | undefined,
): VoiceAdviceResolution | null {
  const pending = pendingAletheiaAdviceCards(snapshot);
  if (pending.length === 0) return null;

  const trimmed = text.trim();
  if (!trimmed) return null;

  const target =
    pending.find((row) => row.id === snapshot?.focusAdviceId)
    ?? pending[pending.length - 1]!;

  for (const re of NO_PATTERNS) {
    if (re.test(trimmed)) {
      return { adviceId: target.id, decision: "dismiss", matched: trimmed };
    }
  }

  for (const re of YES_PATTERNS) {
    if (re.test(trimmed)) {
      return { adviceId: target.id, decision: "approve", matched: trimmed };
    }
  }

  return null;
}

export function adviceApprovalAckSpeech(card: AletheiaAdviceCard): string {
  if (card.kind === "terminal_error") {
    return "Got it — tell me what you want me to focus on, and I'll help from there.";
  }
  return "Understood — go ahead with your question when you're ready.";
}

export function adviceDismissAckSpeech(): string {
  return "Okay — I'll stay quiet about that for now.";
}

export function pendingAdviceSnapshotsEqual(
  a: AletheiaPendingAdviceSnapshot | null | undefined,
  b: AletheiaPendingAdviceSnapshot | null | undefined,
): boolean {
  if (!a || !b) return false;
  if (a.updatedAt !== b.updatedAt) return false;
  if (a.focusAdviceId !== b.focusAdviceId) return false;
  if (a.cards.length !== b.cards.length) return false;
  for (let i = 0; i < a.cards.length; i += 1) {
    const left = a.cards[i]!;
    const right = b.cards[i]!;
    if (left.id !== right.id) return false;
    if (left.status !== right.status) return false;
    if (left.headline !== right.headline) return false;
    if (left.body !== right.body) return false;
  }
  return true;
}
