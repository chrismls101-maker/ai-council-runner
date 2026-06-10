import "../initSentry.ts";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Overlay } from "./Overlay.tsx";
import "../styles/glass.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Overlay />
  </StrictMode>,
);
