import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GlassDashboard } from "./GlassDashboard.tsx";
import "./GlassDashboard.css";
import "../settings/GlassSettings.css";
import "../styles/glass.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GlassDashboard onClose={() => window.close()} />
  </StrictMode>,
);
