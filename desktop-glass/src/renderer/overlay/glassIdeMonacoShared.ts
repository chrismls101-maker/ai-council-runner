import * as monaco from "monaco-editor";
import { ensureMonacoEnvironment } from "./monacoEnvironment.ts";

let glassThemeDefined = false;

export function defineGlassDarkTheme(): void {
  if (glassThemeDefined) return;
  monaco.editor.defineTheme("glass-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6a9a7a", fontStyle: "italic" },
      { token: "keyword", foreground: "82aaff" },
      { token: "string", foreground: "d4a574" },
      { token: "number", foreground: "b49aff" },
      { token: "type", foreground: "7ec8e3" },
      { token: "function", foreground: "dcdcff" },
    ],
    colors: {
      "editor.background": "#080a12",
      "editor.foreground": "#dce6ffe8",
      "editor.lineHighlightBackground": "#ffffff08",
      "editor.selectionBackground": "#64a0ff40",
      "editor.inactiveSelectionBackground": "#64a0ff22",
      "editorCursor.foreground": "#82aaff",
      "editorLineNumber.foreground": "#788cb055",
      "editorLineNumber.activeForeground": "#a0b8e080",
      "editorWidget.background": "#0c0e18",
      "editorWidget.border": "#ffffff14",
      "input.background": "#ffffff0a",
      "scrollbarSlider.background": "#ffffff18",
      "scrollbarSlider.hoverBackground": "#ffffff28",
    },
  });
  glassThemeDefined = true;
}

export function toMonacoLanguage(language: string): string {
  switch (language) {
    case "typescript":
      return "typescript";
    case "javascript":
      return "javascript";
    case "json":
      return "json";
    case "css":
      return "css";
    case "html":
      return "html";
    case "markdown":
      return "markdown";
    default:
      return "plaintext";
  }
}

export function modelUriForRelativePath(
  relativePath: string,
  projectRoot?: string | null,
): monaco.Uri {
  const rel = relativePath.replace(/\\/g, "/");
  const root = projectRoot?.trim().replace(/\\/g, "/").replace(/\/$/, "");
  if (root) {
    return monaco.Uri.file(`${root}/${rel}`);
  }
  return monaco.Uri.parse(`glass-ide:///${rel}`);
}

export function initMonacoEditor(container: HTMLElement): monaco.editor.IStandaloneCodeEditor {
  ensureMonacoEnvironment();
  defineGlassDarkTheme();
  const editor = monaco.editor.create(container, {
    theme: "glass-dark",
    readOnly: false,
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 12,
    lineHeight: 18,
    fontFamily: '"JetBrains Mono", "SF Mono", ui-monospace, monospace',
    scrollBeyondLastLine: false,
    renderLineHighlight: "line",
    padding: { top: 8, bottom: 8 },
    wordWrap: "off",
    scrollbar: {
      verticalScrollbarSize: 8,
      horizontalScrollbarSize: 8,
    },
    quickSuggestions: {
      other: true,
      comments: false,
      strings: true,
    },
    suggestOnTriggerCharacters: true,
    wordBasedSuggestions: "matchingDocuments",
    parameterHints: { enabled: true },
    hover: { enabled: true, delay: 280 },
    links: true,
    colorDecorators: true,
    bracketPairColorization: { enabled: true },
    guides: {
      bracketPairs: true,
      indentation: true,
    },
  });
  return editor;
}
