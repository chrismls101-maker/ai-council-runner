import "../initSentry.ts";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Dock } from "./Dock.tsx";
import { TranscriptionProvider } from "../TranscriptionProvider.tsx";
import "../styles/glass.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TranscriptionProvider>
      <Dock />
    </TranscriptionProvider>
  </StrictMode>,
);
