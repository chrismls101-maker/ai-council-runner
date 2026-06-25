/** DEV ONLY — background preview harness; not bundled (see electron.vite.config.ts). */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LoadingBootScreen } from "./LoadingBootScreen.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LoadingBootScreen />
  </StrictMode>,
);
