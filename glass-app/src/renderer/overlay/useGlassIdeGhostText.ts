import { useCallback, useEffect, useRef } from "react";
import * as monaco from "monaco-editor";

const GHOST_DEBOUNCE_MS = 900;
const GHOST_CLASS = "gide-ghost-text";

export function useGlassIdeGhostText(
  editor: monaco.editor.IStandaloneCodeEditor | null,
  enabled: boolean,
  relativePath: string | null,
): void {
  const decorationIdsRef = useRef<string[]>([]);
  const suggestionRef = useRef("");
  const timerRef = useRef<number | null>(null);
  const requestGenRef = useRef(0);

  const clearGhost = useCallback(() => {
    suggestionRef.current = "";
    if (!editor) return;
    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, []);
  }, [editor]);

  const applyGhostDecoration = useCallback(
    (line: number, column: number, text: string) => {
      if (!editor || !text) return;
      decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, [
        {
          range: new monaco.Range(line, column, line, column),
          options: {
            after: {
              content: text,
              inlineClassName: GHOST_CLASS,
            },
          },
        },
      ]);
    },
    [editor],
  );

  const acceptGhost = useCallback(() => {
    if (!editor || !suggestionRef.current) return false;
    const model = editor.getModel();
    if (!model) return false;
    const pos = editor.getPosition();
    if (!pos) return false;

    const lineContent = model.getLineContent(pos.lineNumber);
    const prefix = lineContent.slice(0, pos.column - 1);
    if (!prefix.trim() && !suggestionRef.current.trim()) return false;

    editor.executeEdits("ghost-text", [
      {
        range: new monaco.Range(
          pos.lineNumber,
          pos.column,
          pos.lineNumber,
          pos.column,
        ),
        text: suggestionRef.current,
        forceMoveMarkers: true,
      },
    ]);
    clearGhost();
    return true;
  }, [clearGhost, editor]);

  useEffect(() => {
    if (!editor || !enabled) {
      clearGhost();
      return;
    }

    const disposable = editor.onDidChangeCursorPosition(() => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        const model = editor.getModel();
        const pos = editor.getPosition();
        if (!model || !pos || !relativePath?.trim()) {
          clearGhost();
          return;
        }

        const lineContent = model.getLineContent(pos.lineNumber);
        const prefix = lineContent.slice(0, pos.column - 1);
        if (prefix.trim().length < 2) {
          clearGhost();
          return;
        }

        const gen = ++requestGenRef.current;
        void window.glass
          .glassIdeGhostSuggest({
            relativePath,
            line: pos.lineNumber,
            linePrefix: prefix,
          })
          .then((res) => {
            if (gen !== requestGenRef.current) return;
            const suggestion = res.suggestion?.trim() ?? "";
            if (!suggestion) {
              clearGhost();
              return;
            }
            suggestionRef.current = suggestion;
            applyGhostDecoration(pos.lineNumber, pos.column, suggestion);
          })
          .catch(() => clearGhost());
      }, GHOST_DEBOUNCE_MS);
    });

    const tabDisposable = editor.onKeyDown((e) => {
      if (
        e.keyCode === monaco.KeyCode.Tab
        && !e.shiftKey
        && !e.altKey
        && !e.ctrlKey
        && !e.metaKey
        && suggestionRef.current
      ) {
        e.preventDefault();
        e.stopPropagation();
        acceptGhost();
      }
    });

    return () => {
      disposable.dispose();
      tabDisposable.dispose();
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      clearGhost();
    };
  }, [
    acceptGhost,
    applyGhostDecoration,
    clearGhost,
    editor,
    enabled,
    relativePath,
  ]);
}
