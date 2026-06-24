/**
 * Glass Companion — script ack bridge (renderer singleton).
 *
 * When a multi-step script is waiting for user ack, intercepts auto-submit
 * so "next" / "okay" advances the script locally instead of a full ask.
 */

import { looksLikeScriptContinue } from "./companionRetarget.ts";

type ScriptAckHandler = (transcript: string) => boolean;

let handler: ScriptAckHandler | null = null;

export function setCompanionScriptAckHandler(fn: ScriptAckHandler | null): void {
  handler = fn;
}

export function tryCompanionScriptAck(transcript: string): boolean {
  if (!handler) return false;
  const text = transcript.trim();
  if (!text || !looksLikeScriptContinue(text)) return false;
  return handler(text);
}

export function isCompanionScriptAckPending(): boolean {
  return handler != null;
}
