import { useEffect, useState } from "react";
import App from "./App";
import LandingGate from "./components/glass-landing/LandingGate";
import GlassLandingPage from "./pages/GlassLandingPage";
import { resolveAppRoute } from "./utils/appRoute";

type AppRoute = "landing" | "dashboard";

export default function AppRouter() {
  const [route, setRoute] = useState<AppRoute>(() => resolveAppRoute());

  useEffect(() => {
    const sync = () => setRoute(resolveAppRoute());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  useEffect(() => {
    document.title =
      route === "landing" ? "IIVO Glass" : "IIVO — Intelligence In. Verified Action Out.";
    document.documentElement.classList.toggle("glass-landing-route", route === "landing");
    return () => {
      document.documentElement.classList.remove("glass-landing-route");
    };
  }, [route]);

  if (route === "dashboard") {
    return <App />;
  }

  return (
    <LandingGate>
      <GlassLandingPage />
    </LandingGate>
  );
}
