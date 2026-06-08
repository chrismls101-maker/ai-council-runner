import type { GlassUserProfile } from "./glassUserProfile.ts";

export interface GlassOnboardingState {
  completed: boolean;
  profile: GlassUserProfile | null;
}

export const DEFAULT_GLASS_ONBOARDING_STATE: GlassOnboardingState = {
  completed: false,
  profile: null,
};

export const GLASS_ONBOARDING_QUESTIONS = [
  { key: "name" as const, label: "What's your name?" },
  { key: "usualWork" as const, label: "What kind of work do you usually do?" },
  { key: "currentFocus" as const, label: "What are you focused on right now?" },
];
