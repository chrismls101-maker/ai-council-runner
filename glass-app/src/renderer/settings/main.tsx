import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GlassSettings } from "./GlassSettings.tsx";
import "./GlassSettings.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GlassSettings />
  </StrictMode>,
);
