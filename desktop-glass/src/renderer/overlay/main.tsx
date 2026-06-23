import "../initSentry.ts";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TranscriptionProvider } from "../TranscriptionProvider.tsx";
import { GlassCompanionProvider } from "../companion/GlassCompanionProvider.tsx";
import { Overlay } from "./Overlay.tsx";
import "../styles/glass.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TranscriptionProvider>
      <GlassCompanionProvider>
        <Overlay />
      </GlassCompanionProvider>
    </TranscriptionProvider>
  </StrictMode>,
);
