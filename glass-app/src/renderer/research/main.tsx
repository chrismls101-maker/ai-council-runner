import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ResearchExplorer } from "./ResearchExplorer";
import "../styles/glass.css";

function ResearchApp(): JSX.Element {
  const [question, setQuestion] = useState("");

  useEffect(() => {
    void window.glass.getState().then((state) => {
      setQuestion(state.researchExplorerQuestion ?? "");
    });
    return window.glass.onState((state) => {
      setQuestion(state.researchExplorerQuestion ?? "");
    });
  }, []);

  return (
    <ResearchExplorer
      question={question}
      onClose={() => window.glass.closeResearchExplorer()}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ResearchApp />
  </StrictMode>,
);
