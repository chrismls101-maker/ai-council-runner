import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { NotesPad } from "./NotesPad.tsx";
import "../styles/glass.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NotesPad />
  </StrictMode>,
);
