/** Personas that use the bottom Prompts / Keys strip in production. */
export type BuilderStripPersona = "developer" | "sales" | "operator" | "writer" | "general";

/**
 * Aletheia core refocus — builder strip shows only Aletheia + quit.
 * Full strip preserved on archive/full-feature-set.
 */
export const ALETHEIA_CORE_STRIP = true;

export function shouldShowBuilderStrip(input: {
  onboardingComplete?: boolean;
  persona?: BuilderStripPersona;
  /** Unpackaged Electron dev — strip available after onboarding for local testing. */
  glassDevMode?: boolean;
  /** Public Aletheia — show strip for every persona after onboarding (default on). */
  aletheiaStripForAllPersonas?: boolean;
}): boolean {
  if (input.onboardingComplete !== true) return false;
  if (input.aletheiaStripForAllPersonas !== false) return true;
  if (input.persona === "developer") return true;
  return input.glassDevMode === true;
}
