import "../initSentry.ts";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Panel } from "./Panel.tsx";
import { TranscriptionProvider } from "../TranscriptionProvider.tsx";
import "../styles/glass.css";
import "../styles/glassPanelChrome.css";
import "../settings/GlassSettings.css";
import "../dashboard/GlassDashboard.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TranscriptionProvider>
      <Panel />
    </TranscriptionProvider>
  </StrictMode>,
);
