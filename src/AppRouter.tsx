import { useEffect, useState, type JSX } from "react";
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
 *   *              → Glass404Page
 */

type PublicRoute = Extract<AppRoute, "landing" | "install" | "privacy" | "terms" | "not-found">;

const ROUTE_TITLES: Record<PublicRoute, string> = {
  landing: "IIVO Glass",
  install: "Installation Guide — IIVO Glass",
  privacy: "Privacy Policy — IIVO Glass",
  terms: "Terms of Service — IIVO Glass",
  "not-found": "Page Not Found — IIVO Glass",
};

function resolvePublicRoute(raw: AppRoute): PublicRoute {
  switch (raw) {
    case "install":  return "install";
    case "privacy":  return "privacy";
    case "terms":    return "terms";
    case "landing":  return "landing";
    default:         return "not-found";
  }
}

function PublicPage({ route }: { route: PublicRoute }): JSX.Element {
  switch (route) {
    case "install":    return <GlassInstallPage />;
    case "privacy":    return <GlassPrivacyPage />;
    case "terms":      return <GlassTermsPage />;
    case "not-found":  return <Glass404Page />;
    default:           return <GlassLandingPage />;
  }
}

export default function AppRouter() {
  const [route, setRoute] = useState<PublicRoute>(() =>
    resolvePublicRoute(resolveAppRoute()),
  );

  useEffect(() => {
    const sync = () => setRoute(resolvePublicRoute(resolveAppRoute()));
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

  return <PublicPage route={route} />;
}
