import "../initSentry.ts";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Dock } from "./Dock.tsx";
import { TranscriptionProvider } from "../TranscriptionProvider.tsx";
import "../styles/glass.css";

/** Fires glass:renderer-mounted IPC once after React's first paint (dev primary mode). */
function ReadyReporter() {
  useEffect(() => {
    window.glass?.notifyRendererMounted?.();
  }, []);
  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TranscriptionProvider>
      <ReadyReporter />
      <Dock />
    </TranscriptionProvider>
  </StrictMode>,
);
