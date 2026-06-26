/** Sidebar destinations in the Glass Dashboard overlay. */
export type GlassDashboardNav =
  | "setup"
  | "overview"
  | "sessions"
  | "council"
  | "memory"
  | "ask"
  | "founder";

const DASHBOARD_NAV_IDS: GlassDashboardNav[] = [
  "setup",
  "overview",
  "sessions",
  "council",
  "memory",
  "ask",
  "founder",
];

export function parseGlassDashboardNav(value: unknown): GlassDashboardNav | null {
  if (typeof value !== "string") return null;
  return DASHBOARD_NAV_IDS.includes(value as GlassDashboardNav)
    ? (value as GlassDashboardNav)
    : null;
}
