/**
 * Feature flags for Aletheia public architecture — reversible rollout controls.
 */

export interface GlassPublicArchitectureFlags {
  /** When true, Glass System and Aletheia dashboards cannot be open simultaneously. */
  dashboardMutualExclusion: boolean;
  /** When true, builder strip is visible for all personas after onboarding. */
  aletheiaStripForAllPersonas: boolean;
}

export const DEFAULT_GLASS_PUBLIC_ARCHITECTURE_FLAGS: GlassPublicArchitectureFlags = {
  dashboardMutualExclusion: true,
  aletheiaStripForAllPersonas: true,
};

export function glassPublicArchitectureFlags(
  env: Record<string, string | undefined> = typeof process !== "undefined"
    ? (process.env as Record<string, string | undefined>)
    : {},
): GlassPublicArchitectureFlags {
  return {
    dashboardMutualExclusion: env.IIVO_GLASS_DASHBOARD_MUTUAL_EXCLUSION !== "0",
    aletheiaStripForAllPersonas: env.IIVO_ALETHEIA_STRIP_ALL_PERSONAS !== "0",
  };
}

/** When mutual exclusion is on, return the dashboard flag to clear when opening the other. */
export function oppositeDashboardToClose(
  opening: "glass" | "aletheia",
  flags: GlassPublicArchitectureFlags,
): "glassDashboardActive" | "aletheiaDashboardActive" | null {
  if (!flags.dashboardMutualExclusion) return null;
  return opening === "glass" ? "aletheiaDashboardActive" : "glassDashboardActive";
}
