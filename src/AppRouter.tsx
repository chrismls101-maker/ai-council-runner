import { useEffect, useState, type JSX } from "react";
import App from "./App";
import LandingGate from "./components/glass-landing/LandingGate";
import AccountPage from "./pages/AccountPage";
import Glass404Page from "./pages/Glass404Page";
import GlassInstallPage from "./pages/GlassInstallPage";
import GlassLandingPage from "./pages/GlassLandingPage";
import GlassPrivacyPage from "./pages/GlassPrivacyPage";
import GlassTermsPage from "./pages/GlassTermsPage";
import LoginPage from "./pages/LoginPage";
import { isGlassPublicPath, resolveAppRoute, type AppRoute } from "./utils/appRoute";

const ROUTE_TITLES: Record<AppRoute, string> = {
  landing: "IIVO Glass",
  install: "Installation Guide — IIVO Glass",
  privacy: "Privacy Policy — IIVO Glass",
  terms: "Terms of Service — IIVO Glass",
  login: "Sign In — IIVO",
  account: "My Account — IIVO",
  dashboard: "IIVO — Intelligence In. Verified Action Out.",
  "not-found": "Page Not Found — IIVO Glass",
};

function PublicGlassPage({ route }: { route: Exclude<AppRoute, "dashboard"> }): JSX.Element {
  switch (route) {
    case "install":
      return <GlassInstallPage />;
    case "privacy":
      return <GlassPrivacyPage />;
    case "terms":
      return <GlassTermsPage />;
    case "login":
      return <LoginPage />;
    case "account":
      return <AccountPage />;
    case "not-found":
      return <Glass404Page />;
    default:
      return <GlassLandingPage />;
  }
}

export default function AppRouter() {
  const [route, setRoute] = useState<AppRoute>(() => resolveAppRoute());

  useEffect(() => {
    const sync = () => setRoute(resolveAppRoute());
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

  if (route === "dashboard") {
    return <App />;
  }

  // Auth pages don't need the landing gate
  if (route === "login" || route === "account") {
    return <PublicGlassPage route={route} />;
  }

  return (
    <LandingGate>
      <PublicGlassPage route={route} />
    </LandingGate>
  );
}
