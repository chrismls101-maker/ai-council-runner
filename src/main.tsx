import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AppRouter from "./AppRouter";
import "./App.css";
import "./glass-theme.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
);
