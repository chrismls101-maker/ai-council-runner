import { useEffect, useState, type JSX } from "react";
import AccountPage from "./pages/AccountPage";
import LoginPage from "./pages/LoginPage";
import Glass404Page from "./pages/Glass404Page";
import GlassInstallPage from "./pages/GlassInstallPage";
import GlassLandingPage from "./pages/GlassLandingPage";
import GlassPrivacyPage from "./pages/GlassPrivacyPage";
import GlassTermsPage from "./pages/GlassTermsPage";
import { isGlassPublicPath, resolveAppRoute, type AppRoute } from "./utils/appRoute";

/**
 * Public-only router.
 *
 * The web app (dashboard, command bar, council UI, login, account) has been
 * retired. iivo.io is now a landing page + download link only.
 * All functionality lives in the Glass desktop app.
 *
 * Routes:
 *   /              → GlassLandingPage
 *   /install       → GlassInstallPage
 *   /privacy       → GlassPrivacyPage
 *   /terms         → GlassTermsPage
 *   /login         → LoginPage
 *   /account       → AccountPage
 *   *              → Glass404Page
 */

type AppRouteView =
  | "landing"
  | "install"
  | "privacy"
  | "terms"
  | "login"
  | "account"
  | "not-found";

const ROUTE_TITLES: Record<AppRouteView, string> = {
  landing: "IIVO Glass",
  install: "Installation Guide — IIVO Glass",
  privacy: "Privacy Policy — IIVO Glass",
  terms: "Terms of Service — IIVO Glass",
  login: "Sign in — IIVO",
  account: "Account — IIVO",
  "not-found": "Page Not Found — IIVO Glass",
};

function resolveRoute(raw: AppRoute): AppRouteView {
  switch (raw) {
    case "install":  return "install";
    case "privacy":  return "privacy";
    case "terms":    return "terms";
    case "login":    return "login";
    case "account":  return "account";
    case "landing":  return "landing";
    default:         return "not-found";
  }
}

function AppPage({ route }: { route: AppRouteView }): JSX.Element {
  switch (route) {
    case "install":    return <GlassInstallPage />;
    case "privacy":    return <GlassPrivacyPage />;
    case "terms":      return <GlassTermsPage />;
    case "login":      return <LoginPage />;
    case "account":    return <AccountPage />;
    case "not-found":  return <Glass404Page />;
    default:           return <GlassLandingPage />;
  }
}

export default function AppRouter() {
  const [route, setRoute] = useState<AppRouteView>(() =>
    resolveRoute(resolveAppRoute()),
  );

  useEffect(() => {
    const sync = () => setRoute(resolveRoute(resolveAppRoute()));
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  useEffect(() => {
    document.title = ROUTE_TITLES[route];
    document.documentElement.classList.toggle("glass-landing-route", isGlassPublicPath());
    return () => {
      document.documentElement.classList.remove("glass-landing-route");
    };
  }, [route]);

  return <AppPage route={route} />;
}
