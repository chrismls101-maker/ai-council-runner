import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GlassSettings } from "./GlassSettings.tsx";
import "../styles/glass.css";
import "../styles/glassPanelChrome.css";
import "./GlassSettings.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GlassSettings />
  </StrictMode>,
);
