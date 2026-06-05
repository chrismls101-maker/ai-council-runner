import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Splash } from "./Splash.tsx";
import "./splash.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Splash />
  </StrictMode>,
);
