import * as monaco from "monaco-editor";
import type { AgentPendingApprovalPayload } from "../../shared/ipc.ts";
import { defineGlassDarkTheme, modelUriForRelativePath, toMonacoLanguage } from "./glassIdeMonacoShared.ts";

export interface GlassIdeDiffSession {
  diffEditor: monaco.editor.IStandaloneDiffEditor;
  originalModel: monaco.editor.ITextModel;
  modifiedModel: monaco.editor.ITextModel;
}

const DIFF_EDITOR_OPTIONS: monaco.editor.IDiffEditorConstructionOptions = {
  renderSideBySide: false,
  readOnly: true,
  automaticLayout: true,
  minimap: { enabled: false },
  fontSize: 12,
  lineHeight: 18,
  fontFamily: '"JetBrains Mono", "SF Mono", ui-monospace, monospace',
  scrollBeyondLastLine: false,
  renderOverviewRuler: false,
  ignoreTrimWhitespace: false,
  diffAlgorithm: "advanced",
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
  },
};

export function createGlassIdeDiffSession(
  container: HTMLElement,
  relativePath: string,
  originalContent: string,
  pending: AgentPendingApprovalPayload,
  language: string,
  projectRoot?: string | null,
): GlassIdeDiffSession {
  defineGlassDarkTheme();
  monaco.editor.setTheme("glass-dark");
  const lang = toMonacoLanguage(language);
  const key = relativePath.replace(/\\/g, "/");
  const originalModel = monaco.editor.createModel(
    originalContent,
    lang,
    modelUriForRelativePath(`${key}#original`, projectRoot),
  );
  const modifiedModel = monaco.editor.createModel(
    pending.proposedContent,
    lang,
    modelUriForRelativePath(`${key}#modified`, projectRoot),
  );
  const diffEditor = monaco.editor.createDiffEditor(container, DIFF_EDITOR_OPTIONS);
  diffEditor.setModel({ original: originalModel, modified: modifiedModel });
  return { diffEditor, originalModel, modifiedModel };
}

export function disposeGlassIdeDiffSession(session: GlassIdeDiffSession | null): void {
  if (!session) return;
  session.diffEditor.setModel(null);
  session.diffEditor.dispose();
  session.originalModel.dispose();
  session.modifiedModel.dispose();
}
