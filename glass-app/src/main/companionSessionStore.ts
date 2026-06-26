/**
 * Glass Companion — main-process session memory store (Phase 4a).
 *
 * Also owns the Aletheia session lifecycle: generating session IDs on
 * companion mode activation and flushing them to SQLite on deactivation.
 * The session ID is tracked here as a module-level variable (not in GlassState)
 * because it is an implementation detail of the store, not renderer-visible state.
 */

import { randomUUID } from "crypto";
import type { CompanionGuidancePayload } from "../shared/companionGuidance.ts";
import type { GlassAskLatestScreenshot } from "../shared/glassAskTypes.ts";
import {
  buildCompanionSessionMemory,
  type CompanionSessionMemory,
} from "../shared/companionSessionMemory.ts";
import {
  startAletheiaSession,
  endAletheiaSession,
} from "./aletheiaSessionStore.ts";

// ---------------------------------------------------------------------------
// Aletheia session ID tracking (module-level, not in GlassState)
// ---------------------------------------------------------------------------

/** UUID for the currently-active Aletheia companion session. Null when idle. */
let _currentAletheiaSessionId: string | null = null;
/** Unix ms when the current session started. */
let _currentAletheiaSessionStartedAt: number = 0;
/** Voice-turn counter for the current session. */
let _currentAletheiaSessionTurnCount: number = 0;

/**
 * Call when companion mode activates. Generates a new session ID and
 * writes the start row to SQLite via aletheiaSessionStore.
 */
export function beginAletheiaSession(frontApp?: string): string {
  const id = randomUUID();
  const now = Date.now();
  _currentAletheiaSessionId = id;
  _currentAletheiaSessionStartedAt = now;
  _currentAletheiaSessionTurnCount = 0;
  startAletheiaSession(id, now, frontApp);
  return id;
}

/**
 * Increment the turn counter for the active session.
 * Call each time a voice-turn completes (Deepgram final transcript processed).
 */
export function incrementAletheiaSessionTurn(): void {
  _currentAletheiaSessionTurnCount += 1;
}

/**
 * Call when companion mode deactivates. Stamps ended_at and turn count in
 * SQLite, then clears module-level session state.
 */
export function finalizeAletheiaSession(summary?: string): void {
  if (!_currentAletheiaSessionId) return;
  endAletheiaSession(
    _currentAletheiaSessionId,
    Date.now(),
    _currentAletheiaSessionTurnCount,
    summary,
  );
  _currentAletheiaSessionId = null;
  _currentAletheiaSessionStartedAt = 0;
  _currentAletheiaSessionTurnCount = 0;
}

/** Read-only accessor — useful for wiring into GlassState or logging. */
export function currentAletheiaSessionId(): string | null {
  return _currentAletheiaSessionId;
}

export function updateCompanionSessionMemory(
  current: CompanionSessionMemory | null,
  input: {
    prompt: string;
    presence: CompanionGuidancePayload | null;
    frontApp?: string;
    windowTitle?: string;
    screenshot?: GlassAskLatestScreenshot;
    imageDataUrl?: string;
  },
): CompanionSessionMemory | null {
  if (!input.presence) return current;
  return buildCompanionSessionMemory({
    prompt: input.prompt,
    presence: input.presence,
    frontApp: input.frontApp,
    windowTitle: input.windowTitle,
    screenshot: input.screenshot,
    imageDataUrl: input.imageDataUrl,
  });
}

export function clearCompanionSessionMemory(): null {
  return null;
}
