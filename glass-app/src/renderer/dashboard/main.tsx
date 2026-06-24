import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GlassDashboard } from "./GlassDashboard.tsx";
import "./GlassDashboard.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GlassDashboard onClose={() => window.close()} />
  </StrictMode>,
);
