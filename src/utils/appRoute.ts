import { hasLensHandoffQueryParam } from "./lensHandoff";

export const DASHBOARD_PATH = "/dashboard";

export type AppRoute =
  | "landing"
  | "landing-prototype"
  | "dashboard"
  | "install"
  | "privacy"
  | "terms"
  | "login"
  | "account"
  | "not-found";

export const INSTALL_PATH = "/install";
export const PRIVACY_PATH = "/privacy";
export const TERMS_PATH = "/terms";
export const LOGIN_PATH = "/login";
export const ACCOUNT_PATH = "/account";
export const LANDING_PROTOTYPE_PATH = "/landing-prototype";

export function isDashboardPath(pathname = typeof window !== "undefined" ? window.location.pathname : ""): boolean {
  return pathname === DASHBOARD_PATH || pathname.startsWith(`${DASHBOARD_PATH}/`);
}

export function isGlassPublicPath(
  pathname = typeof window !== "undefined" ? window.location.pathname : "",
): boolean {
  return (
    pathname === "/" ||
    pathname === LANDING_PROTOTYPE_PATH ||
    pathname === INSTALL_PATH ||
    pathname === PRIVACY_PATH ||
    pathname === TERMS_PATH
  );
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

export function resolveAppRoute(): AppRoute {
  redirectRootHandoffToDashboard();
  const pathname = window.location.pathname;
  if (isDashboardPath(pathname)) return "dashboard";
  if (pathname === INSTALL_PATH) return "install";
  if (pathname === PRIVACY_PATH) return "privacy";
  if (pathname === TERMS_PATH) return "terms";
  if (pathname === LOGIN_PATH) return "login";
  if (pathname === ACCOUNT_PATH) return "account";
  if (pathname === LANDING_PROTOTYPE_PATH) return "landing-prototype";
  if (pathname === "/" || pathname === "") return "landing";
  return "not-found";
}
