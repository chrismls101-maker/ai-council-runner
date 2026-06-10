import "../initSentry.ts";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Splash } from "./Splash.tsx";
import { useGlassBootSound } from "./useGlassBootSound.ts";
import "./splash.css";

function BootApp(): JSX.Element {
  useGlassBootSound();
  return <Splash />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BootApp />
  </StrictMode>,
);
