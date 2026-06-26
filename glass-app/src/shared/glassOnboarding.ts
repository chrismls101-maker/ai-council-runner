import { normalizeGlassUserProfile } from "./glassUserProfile.ts";
import type { GlassUserProfile } from "./glassUserProfile.ts";

export interface GlassOnboardingState {
  completed: boolean;
  profile: GlassUserProfile | null;

  /**
   * Consent checkpoints — recorded at onboarding and required before
   * any corresponding capability is activated. All default to false.
   *
   * Architecture law: no recording, mic, or screen capture capability may
   * activate without the corresponding consent flag being true.
   */
  /** User acknowledged microphone access for companion voice mode. */
  consentMicAck: boolean;
  /** User acknowledged screen capture for Glass Lens / context. */
  consentScreenAck: boolean;
  /** User acknowledged machine audio capture (meeting / ambient). */
  consentRecordingAck: boolean;
  /** User accepted Terms of Service and Privacy Policy. */
  consentTosAck: boolean;
}

export const DEFAULT_GLASS_ONBOARDING_STATE: GlassOnboardingState = {
  completed: false,
  profile: null,
  consentMicAck: false,
  consentScreenAck: false,
  consentRecordingAck: false,
  consentTosAck: false,
};

export const GLASS_ONBOARDING_QUESTIONS = [
  { key: "name" as const, label: "What's your name?" },
  { key: "usualWork" as const, label: "What kind of work do you usually do?" },
];

// ---------------------------------------------------------------------------
// Pure parsing helper — no Electron / DB dependencies, safe for unit tests.
// Converts a raw JSON object (possibly from an older install that lacks
// consent fields) into a fully-typed GlassOnboardingState with safe defaults.
// ---------------------------------------------------------------------------
export function parseOnboardingJson(parsed: Partial<GlassOnboardingState>): GlassOnboardingState {
  return {
    completed: parsed.completed === true,
    profile: normalizeGlassUserProfile(parsed.profile ?? null),
    consentMicAck: parsed.consentMicAck === true,
    consentScreenAck: parsed.consentScreenAck === true,
    consentRecordingAck: parsed.consentRecordingAck === true,
    consentTosAck: parsed.consentTosAck === true,
  };
}
