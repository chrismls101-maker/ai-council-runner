import "../initSentry.ts";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TranscriptionProvider } from "../TranscriptionProvider.tsx";
import { CommandBar } from "./CommandBar.tsx";
import "../styles/glass.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TranscriptionProvider>
      <CommandBar />
    </TranscriptionProvider>
  </StrictMode>,
);
