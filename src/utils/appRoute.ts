import { hasLensHandoffQueryParam } from "./lensHandoff";

export const DASHBOARD_PATH = "/dashboard";

export function isDashboardPath(pathname = typeof window !== "undefined" ? window.location.pathname : ""): boolean {
  return pathname === DASHBOARD_PATH || pathname.startsWith(`${DASHBOARD_PATH}/`);
}

/** Deep links from Glass/Lens/app should open the dashboard, not the public landing. */
export function shouldRedirectRootToDashboard(
  search = typeof window !== "undefined" ? window.location.search : "",
): boolean {
  if (hasLensHandoffQueryParam(search)) return true;
  const runId = new URLSearchParams(search).get("runId")?.trim();
  return Boolean(runId);
}

export function redirectRootHandoffToDashboard(): void {
  if (typeof window === "undefined") return;
  const { pathname, search, hash } = window.location;
  if (pathname !== "/" && pathname !== "") return;
  if (!shouldRedirectRootToDashboard(search)) return;
  window.history.replaceState({}, "", `${DASHBOARD_PATH}${search}${hash}`);
}

export function resolveAppRoute(): "landing" | "dashboard" {
  redirectRootHandoffToDashboard();
  return isDashboardPath(window.location.pathname) ? "dashboard" : "landing";
}
