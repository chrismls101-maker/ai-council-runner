import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import GlassLogoPrototypeApp from "./GlassLogoPrototypeApp.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GlassLogoPrototypeApp />
  </StrictMode>,
);
