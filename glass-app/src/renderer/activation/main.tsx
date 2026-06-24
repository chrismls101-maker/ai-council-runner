import "../initSentry.ts";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ActivationScreen } from "./ActivationScreen.tsx";
import "./activation.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActivationScreen />
  </StrictMode>,
);
