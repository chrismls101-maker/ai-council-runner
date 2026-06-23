/** Personas that use the bottom Prompts / Keys strip in production. */
export type BuilderStripPersona = "developer" | "sales" | "operator" | "writer" | "general";

export function shouldShowBuilderStrip(input: {
  onboardingComplete?: boolean;
  persona?: BuilderStripPersona;
  /** Unpackaged Electron dev — strip available after onboarding for local testing. */
  glassDevMode?: boolean;
}): boolean {
  if (input.onboardingComplete !== true) return false;
  if (input.persona === "developer") return true;
  return input.glassDevMode === true;
}
