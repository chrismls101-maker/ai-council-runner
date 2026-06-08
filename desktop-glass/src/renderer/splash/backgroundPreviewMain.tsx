import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LoadingBootScreen } from "./LoadingBootScreen.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LoadingBootScreen />
  </StrictMode>,
);
