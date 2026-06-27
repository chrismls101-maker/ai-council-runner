/**
 * Aletheia surface doctrine (B5.3) — one calm presence across Glass surfaces.
 *
 * Same identity and tone; pacing and depth vary by surface, enforced at prompt construction.
 */

import type { AletheiaPersonaBehaviorSnapshot } from "./aletheiaPersonaBehavior.ts";
import { truncateAletheiaSpokenText } from "./aletheiaPersonaBehavior.ts";

export type AletheiaSurface =
  | "companion"
  | "command_bar"
  | "dashboard"
  | "strip";

export interface AletheiaSurfaceDoctrineInput {
  surface: AletheiaSurface;
  companionModeActive?: boolean;
  personaBehavior?: AletheiaPersonaBehaviorSnapshot | null;
}

const SURFACE_DIRECTIVES: Record<AletheiaSurface, string> = {
  companion:
    "Aletheia surface: voice companion. Same person — warm, direct, narrating when acting. Speakable replies only; no bullet dumps unless asked.",
  command_bar:
    "Aletheia surface: command bar. Same person — terse text answers. Two short paragraphs max unless the task is complex.",
  dashboard:
    "Aletheia surface: dashboard. Same person — fuller structured detail is OK in text. Assume the user is reading, not listening.",
  strip:
    "Aletheia surface: strip status. Same person — status-only phrasing, one line, no preamble.",
};

export function surfaceDoctrineDirective(surface: AletheiaSurface): string {
  return SURFACE_DIRECTIVES[surface];
}

export function resolveAletheiaSurface(input: {
  companionModeActive?: boolean;
  aletheiaDashboardActive?: boolean;
  fromStrip?: boolean;
}): AletheiaSurface {
  if (input.companionModeActive) return "companion";
  if (input.aletheiaDashboardActive) return "dashboard";
  if (input.fromStrip) return "strip";
  return "command_bar";
}

export function spokenTextForSurface(
  text: string,
  input: AletheiaSurfaceDoctrineInput,
): string {
  const surfaceCap =
    input.surface === "strip" ? 180
    : input.surface === "command_bar" ? 360
    : input.surface === "dashboard" ? 900
    : input.personaBehavior?.ttsMaxChars ?? 600;

  if (input.personaBehavior) {
    return truncateAletheiaSpokenText(text, {
      ...input.personaBehavior,
      ttsMaxChars: Math.min(input.personaBehavior.ttsMaxChars, surfaceCap),
    });
  }

  if (text.length <= surfaceCap) return text;
  return truncateAletheiaSpokenText(text, {
    operatingMode: "balanced",
    persona: "general",
    founderTierActive: false,
    toneLabel: "Balanced",
    verbosity: "balanced",
    initiativeLevel: "medium",
    activatedAt: Date.now(),
    promptDirective: "",
    activationSpeech: "",
    ttsMaxChars: surfaceCap,
  });
}

export function buildAletheiaSurfaceContext(input: AletheiaSurfaceDoctrineInput): string {
  return surfaceDoctrineDirective(input.surface);
}
