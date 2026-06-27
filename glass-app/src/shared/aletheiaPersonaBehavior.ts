/**
 * Aletheia persona-aware operating behavior (B4.1).
 *
 * Same Aletheia identity — different operating mode by persona and founder tier.
 */

import type { IivoAccountLink } from "./iivoAccountLink.ts";

export type GlassSortingHatPersona = "developer" | "sales" | "operator" | "writer" | "general";

export type AletheiaOperatingMode =
  | "founder_operational"
  | "developer_terse"
  | "guided"
  | "balanced";

export type AletheiaInitiativeLevel = "high" | "medium" | "low";

export type AletheiaVerbosity = "terse" | "balanced" | "guided";

export interface AletheiaPersonaBehaviorSnapshot {
  operatingMode: AletheiaOperatingMode;
  persona: GlassSortingHatPersona;
  founderTierActive: boolean;
  toneLabel: string;
  verbosity: AletheiaVerbosity;
  initiativeLevel: AletheiaInitiativeLevel;
  activatedAt: number;
  /** Injected into companion ask context — never shown raw to the user. */
  promptDirective: string;
  /** Spoken once when companion finishes warm-up. */
  activationSpeech: string;
  ttsMaxChars: number;
}

export interface AletheiaPersonaBehaviorInput {
  persona?: GlassSortingHatPersona;
  accountLink?: IivoAccountLink | null;
  glassDevMode?: boolean;
  now?: number;
}

const DEFAULT_PERSONA: GlassSortingHatPersona = "general";

export function isFounderCommandTier(input: Pick<AletheiaPersonaBehaviorInput, "accountLink" | "glassDevMode">): boolean {
  const role = input.accountLink?.role;
  if (role === "founder") return true;
  if (input.glassDevMode && role === "admin") return true;
  return false;
}

export function resolveAletheiaOperatingMode(
  persona: GlassSortingHatPersona,
  founderTierActive: boolean,
): AletheiaOperatingMode {
  if (founderTierActive) return "founder_operational";
  if (persona === "general") return "guided";
  if (persona === "developer" || persona === "operator") return "developer_terse";
  return "balanced";
}

function toneLabelForMode(mode: AletheiaOperatingMode): string {
  switch (mode) {
    case "founder_operational":
      return "Operational — terse";
    case "developer_terse":
      return "Direct — builder mode";
    case "guided":
      return "Guided — step by step";
    default:
      return "Balanced";
  }
}

function verbosityForMode(mode: AletheiaOperatingMode): AletheiaVerbosity {
  switch (mode) {
    case "founder_operational":
    case "developer_terse":
      return "terse";
    case "guided":
      return "guided";
    default:
      return "balanced";
  }
}

function initiativeForMode(mode: AletheiaOperatingMode): AletheiaInitiativeLevel {
  switch (mode) {
    case "founder_operational":
      return "high";
    case "guided":
      return "low";
    default:
      return "medium";
  }
}

function promptDirectiveForMode(mode: AletheiaOperatingMode, founderTierActive: boolean): string {
  const founderNote = founderTierActive
    ? "Founder command tier is active — expanded authority scope is acknowledged. Be decisive and operational."
    : "";

  switch (mode) {
    case "founder_operational":
      return [
        "Aletheia operating mode: founder operational.",
        "Be terse, direct, and action-oriented. Skip tutorials and preamble.",
        "Lead with the answer or next move. Offer depth only when asked.",
        founderNote,
      ].filter(Boolean).join(" ");
    case "developer_terse":
      return [
        "Aletheia operating mode: developer direct.",
        "Assume technical fluency. Be concise and precise.",
        "Prefer concrete steps, file paths, and commands when relevant.",
      ].join(" ");
    case "guided":
      return [
        "Aletheia operating mode: guided.",
        "Assume the user wants clear, patient guidance.",
        "Explain briefly before acting. Confirm when context is ambiguous.",
        "Do not volunteer unsolicited fixes until the user engages.",
      ].join(" ");
    default:
      return [
        "Aletheia operating mode: balanced.",
        "Match the user's pace — concise by default, fuller when the question is complex.",
      ].join(" ");
  }
}

export function companionActivationSpeechForMode(mode: AletheiaOperatingMode): string {
  switch (mode) {
    case "founder_operational":
      return "I'm here — what's the move?";
    case "developer_terse":
      return "Ready when you are.";
    case "guided":
      return "I'm here when you're ready — just tell me what you'd like help with.";
    default:
      return "I'm Aletheia — what's on your mind?";
  }
}

export function ttsMaxCharsForMode(mode: AletheiaOperatingMode): number {
  switch (mode) {
    case "founder_operational":
    case "developer_terse":
      return 420;
    case "guided":
      return 720;
    default:
      return 600;
  }
}

export function resolveAletheiaPersonaBehavior(
  input: AletheiaPersonaBehaviorInput,
): AletheiaPersonaBehaviorSnapshot {
  const persona = input.persona ?? DEFAULT_PERSONA;
  const founderTierActive = isFounderCommandTier(input);
  const operatingMode = resolveAletheiaOperatingMode(persona, founderTierActive);
  const now = input.now ?? Date.now();

  return {
    operatingMode,
    persona,
    founderTierActive,
    toneLabel: toneLabelForMode(operatingMode),
    verbosity: verbosityForMode(operatingMode),
    initiativeLevel: initiativeForMode(operatingMode),
    activatedAt: now,
    promptDirective: promptDirectiveForMode(operatingMode, founderTierActive),
    activationSpeech: companionActivationSpeechForMode(operatingMode),
    ttsMaxChars: ttsMaxCharsForMode(operatingMode),
  };
}

export function truncateAletheiaSpokenText(
  text: string,
  snapshot: AletheiaPersonaBehaviorSnapshot | undefined,
): string {
  const max = snapshot?.ttsMaxChars ?? 600;
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed = lastSpace > max * 0.55 ? cut.slice(0, lastSpace) : cut;
  return `${trimmed.trim()}…`;
}

export function operatingModeLabel(mode: AletheiaOperatingMode): string {
  return mode.replace(/_/g, " ");
}
