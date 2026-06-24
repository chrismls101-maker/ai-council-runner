import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import * as monaco from "monaco-editor";
import type { GlassState } from "../../shared/ipc.ts";
import {
  firstChangedLineFromDisplay,
  getActiveCoderRunId,
  getCoderPendingApproval,
  pathsMatchRelative,
} from "../../shared/glassIdeInlineDiff.ts";
import {
  GLASS_IDE_REVEAL_HUNK_EVENT,
  groupDiffIntoHunks,
  revealLineAndPulseFromDisplay,
  type GlassIdeRevealHunkDetail,
} from "../../shared/glassIdeHunkSync.ts";
import { linesToPulseFromDisplay } from "../../shared/glassIdePresence.ts";
import type { GlassIdeEditorContext } from "../../shared/glassIdeEditorContext.ts";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";
import {
  createGlassIdeDiffSession,
  disposeGlassIdeDiffSession,
  type GlassIdeDiffSession,
} from "./glassIdeDiffEditor.ts";
import {
  initMonacoEditor,
  modelUriForRelativePath,
  toMonacoLanguage,
} from "./glassIdeMonacoShared.ts";
import { configureGlassIdeTypeScript } from "./glassIdeMonacoTypeScript.ts";
import { useGlassIdeGhostText } from "./useGlassIdeGhostText.ts";
import "./GlassIdeEditor.css";

interface TabState {
  relativePath: string;
  dirty: boolean;
  truncated: boolean;
  readOnly: boolean;
}

interface PendingMeta {
  relativePath: string;
  description: string;
  isDelete: boolean;
  pendingToolId: string;
}

interface GlassIdeEditorWorkspaceProps {
  state: GlassState;
  selectedPath: string | null;
  onSelectedPathChange: (relativePath: string) => void;
  onDirtyChange: (hasDirty: boolean) => void;
  onSaveNotice?: (message: string, isError?: boolean) => void;
  onTreeRefresh?: () => void;
}

function tabKey(relativePath: string): string {
  return relativePath.replace(/\\/g, "/");
}

export function GlassIdeEditorWorkspace({
  state,
  selectedPath,
  onSelectedPathChange,
  onDirtyChange,
  onSaveNotice,
  onTreeRefresh,
}: GlassIdeEditorWorkspaceProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const diffContainerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const diffSessionRef = useRef<GlassIdeDiffSession | null>(null);
  const modelsRef = useRef(new Map<string, monaco.editor.ITextModel>());
  const baselinesRef = useRef(new Map<string, string>());
  const truncatedRef = useRef(new Set<string>());
  const contentListenersRef = useRef(new Map<string, monaco.IDisposable>());
  const seenAppliedRef = useRef(new Set<string>());
  const openTabsRef = useRef<TabState[]>([]);
  const lastPendingToolRef = useRef<string | null>(null);
  const projectRootForModelsRef = useRef<string | null>(null);
  const pulseDecorationsRef = useRef<string[]>([]);
  const [editorReady, setEditorReady] = useState(false);
  const [hunkIndex, setHunkIndex] = useState(0);
  const [monacoEditor, setMonacoEditor] = useState<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [tsIntelligenceReady, setTsIntelligenceReady] = useState(false);
  const [openTabs, setOpenTabs] = useState<TabState[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [pendingMeta, setPendingMeta] = useState<PendingMeta | null>(null);

  openTabsRef.current = openTabs;
  const activePathRef = useRef(activePath);
  activePathRef.current = activePath;

  const activeRunId = getActiveCoderRunId(state, null);
  const ghostTextEnabled = state.glassSettings.coderGhostTextEnabled === true;
  useGlassIdeGhostText(monacoEditor, ghostTextEnabled, activePath);
  const showDiffView = Boolean(
    pendingMeta
    && activePath
    && pathsMatchRelative(activePath, pendingMeta.relativePath),
  );

  const clearDiffSession = useCallback((): void => {
    disposeGlassIdeDiffSession(diffSessionRef.current);
    diffSessionRef.current = null;
  }, []);

  const pulseLines = useCallback((lines: number[], useDiffEditor = false): void => {
    const editor = useDiffEditor
      ? diffSessionRef.current?.diffEditor.getModifiedEditor() ?? null
      : editorRef.current;
    if (!editor || lines.length === 0) return;
    const decorations = lines.map((line) => ({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: "gide-line-pulse",
        marginClassName: "gide-line-pulse-gutter",
      },
    }));
    pulseDecorationsRef.current = editor.deltaDecorations(pulseDecorationsRef.current, decorations);
    window.setTimeout(() => {
      pulseDecorationsRef.current = editor.deltaDecorations(pulseDecorationsRef.current, []);
    }, 2600);
  }, []);

  const syncEditorContext = useCallback((): void => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    const selection = editor?.getSelection();
    const selectedText = selection && model
      ? model.getValueInRange(selection)
      : "";
    const ctx: GlassIdeEditorContext = {
      relativePath: activePathRef.current,
      language: model?.getLanguageId() ?? null,
      selectionStartLine: selection?.startLineNumber ?? 0,
      selectionEndLine: selection?.endLineNumber ?? 0,
      selectionStartColumn: selection?.startColumn ?? 0,
      selectionEndColumn: selection?.endColumn ?? 0,
      selectedText,
      cursorLine: selection?.positionLineNumber ?? 0,
      cursorColumn: selection?.positionColumn ?? 0,
      updatedAt: Date.now(),
    };
    window.glass.glassIdeEditorContextUpdate(ctx);
  }, []);

  const syncDirtyFlag = useCallback((tabs: TabState[]): void => {
    onDirtyChange(tabs.some((t) => t.dirty));
  }, [onDirtyChange]);

  const patchTab = useCallback((
    relativePath: string,
    patch: Partial<TabState>,
    setter: Dispatch<SetStateAction<TabState[]>> = setOpenTabs,
  ): void => {
    const key = tabKey(relativePath);
    setter((prev) => {
      const next = prev.map((t) => (
        tabKey(t.relativePath) === key ? { ...t, ...patch } : t
      ));
      syncDirtyFlag(next);
      return next;
    });
  }, [syncDirtyFlag]);

  const attachContentListener = useCallback((
    relativePath: string,
    model: monaco.editor.ITextModel,
  ): void => {
    const key = tabKey(relativePath);
    contentListenersRef.current.get(key)?.dispose();
    const disposable = model.onDidChangeContent(() => {
      if (pendingMeta && pathsMatchRelative(relativePath, pendingMeta.relativePath)) return;
      const baseline = baselinesRef.current.get(key) ?? "";
      const dirty = model.getValue() !== baseline;
      patchTab(relativePath, { dirty });
    });
    contentListenersRef.current.set(key, disposable);
  }, [patchTab, pendingMeta]);

  const loadModel = useCallback(async (relativePath: string): Promise<{
    model: monaco.editor.ITextModel;
    truncated: boolean;
    readOnly: boolean;
  } | null> => {
    const key = tabKey(relativePath);
    const existing = modelsRef.current.get(key);
    if (existing) {
      return {
        model: existing,
        truncated: truncatedRef.current.has(key),
        readOnly: truncatedRef.current.has(key),
      };
    }

    const res = await window.glass.glassIdeReadProjectFile(relativePath);
    if (!res.ok) {
      setLoadError(res.error ?? "Could not read file.");
      return null;
    }

    setLoadError(null);
    const lang = toMonacoLanguage(res.language ?? "plain");
    const isTruncated = Boolean(res.truncated);
    const content = res.content ?? "";
    const model = monaco.editor.createModel(
      content,
      lang,
      modelUriForRelativePath(key, projectRootForModelsRef.current),
    );
    modelsRef.current.set(key, model);
    baselinesRef.current.set(key, content);
    if (isTruncated) truncatedRef.current.add(key);
    attachContentListener(relativePath, model);
    return { model, truncated: isTruncated, readOnly: isTruncated };
  }, [attachContentListener]);

  const showModel = useCallback((relativePath: string, model: monaco.editor.ITextModel, readOnly: boolean): void => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.setModel(model);
    editor.updateOptions({ readOnly });
    editor.focus();
  }, []);

  const openFile = useCallback(async (
    relativePath: string,
    revealLine?: number,
    opts?: { skipShowModel?: boolean },
  ): Promise<void> => {
    const key = tabKey(relativePath);
    if (!key) return;

    setLoadingPath(key);
    const loaded = await loadModel(key);
    setLoadingPath(null);
    if (!loaded) return;

    setOpenTabs((prev) => {
      if (prev.some((t) => tabKey(t.relativePath) === key)) return prev;
      const next = [
        ...prev,
        {
          relativePath: key,
          dirty: false,
          truncated: loaded.truncated,
          readOnly: loaded.readOnly,
        },
      ];
      syncDirtyFlag(next);
      return next;
    });

    setActivePath(key);
    onSelectedPathChange(key);
    if (!opts?.skipShowModel) {
      showModel(key, loaded.model, loaded.readOnly);
    }

    if (revealLine != null && revealLine > 0) {
      const target = diffSessionRef.current?.diffEditor.getModifiedEditor() ?? editorRef.current;
      target?.revealLineInCenter(revealLine);
      target?.setPosition({ lineNumber: revealLine, column: 1 });
    }
  }, [loadModel, onSelectedPathChange, showModel, syncDirtyFlag]);

  const openFileRef = useRef(openFile);
  const pulseLinesRef = useRef(pulseLines);
  const pendingMetaRef = useRef(pendingMeta);
  openFileRef.current = openFile;
  pulseLinesRef.current = pulseLines;
  pendingMetaRef.current = pendingMeta;

  useEffect(() => {
    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<GlassIdeRevealHunkDetail>).detail;
      if (!detail?.relativePath) return;
      const { revealLine, pulseLines: lines } = revealLineAndPulseFromDisplay(detail.displayLines);
      const key = tabKey(detail.relativePath);
      const useDiffEditor = Boolean(
        pendingMetaRef.current
        && pathsMatchRelative(key, pendingMetaRef.current.relativePath),
      );
      void openFileRef.current(detail.relativePath, revealLine).then(() => {
        if (lines.length > 0) {
          pulseLinesRef.current(lines, useDiffEditor);
        }
      });
    };
    window.addEventListener(GLASS_IDE_REVEAL_HUNK_EVENT, handler);
    return () => window.removeEventListener(GLASS_IDE_REVEAL_HUNK_EVENT, handler);
  }, []);

  const mountPendingDiff = useCallback(async (pending: NonNullable<ReturnType<typeof getCoderPendingApproval>>): Promise<void> => {
    const key = tabKey(pending.relativePath);
    const disk = await window.glass.glassIdeReadProjectFile(key);
    if (!disk.ok || !diffContainerRef.current) return;

    clearDiffSession();
    diffSessionRef.current = createGlassIdeDiffSession(
      diffContainerRef.current,
      key,
      disk.content ?? "",
      pending,
      disk.language ?? "plain",
      projectRootForModelsRef.current,
    );

    const revealLine = firstChangedLineFromDisplay(pending.displayLines);
    const modified = diffSessionRef.current.diffEditor.getModifiedEditor();
    modified.revealLineInCenter(revealLine);
    modified.setPosition({ lineNumber: revealLine, column: 1 });

    setPendingMeta({
      relativePath: key,
      description: pending.description,
      isDelete: Boolean(pending.isDelete),
      pendingToolId: pending.pendingToolId,
    });
    pulseLines(linesToPulseFromDisplay(pending.displayLines), true);
  }, [clearDiffSession, pulseLines]);

  const reloadFromDisk = useCallback(async (relativePath: string): Promise<void> => {
    const key = tabKey(relativePath);
    const res = await window.glass.glassIdeReadProjectFile(key);
    if (!res.ok) return;

    const content = res.content ?? "";
    const isTruncated = Boolean(res.truncated);
    let model = modelsRef.current.get(key);
    if (!model) {
      const lang = toMonacoLanguage(res.language ?? "plain");
      model = monaco.editor.createModel(
        content,
        lang,
        modelUriForRelativePath(key, projectRootForModelsRef.current),
      );
      modelsRef.current.set(key, model);
      attachContentListener(relativePath, model);
    } else {
      model.setValue(content);
    }
    baselinesRef.current.set(key, content);
    if (isTruncated) truncatedRef.current.add(key);
    else truncatedRef.current.delete(key);

    patchTab(key, { dirty: false, truncated: isTruncated, readOnly: isTruncated });
    if (activePathRef.current === key && !pendingMeta) {
      showModel(key, model, isTruncated);
    }
  }, [attachContentListener, patchTab, pendingMeta, showModel]);

  const saveFile = useCallback(async (relativePath: string): Promise<boolean> => {
    const key = tabKey(relativePath);
    const model = modelsRef.current.get(key);
    if (!model || truncatedRef.current.has(key)) return false;
    if (pendingMeta && pathsMatchRelative(key, pendingMeta.relativePath)) return false;

    const res = await window.glass.glassIdeWriteProjectFile(key, model.getValue());
    if (!res.ok) {
      onSaveNotice?.(res.error ?? "Save failed.", true);
      return false;
    }
    baselinesRef.current.set(key, model.getValue());
    patchTab(key, { dirty: false });
    onSaveNotice?.("Saved");
    return true;
  }, [onSaveNotice, patchTab, pendingMeta]);

  const closeTab = useCallback((relativePath: string): void => {
    const key = tabKey(relativePath);
    if (pendingMeta && pathsMatchRelative(key, pendingMeta.relativePath)) return;

    const tab = openTabsRef.current.find((t) => tabKey(t.relativePath) === key);
    if (tab?.dirty) {
      const discard = window.confirm(`Discard unsaved changes to ${key.split("/").pop()}?`);
      if (!discard) return;
    }

    contentListenersRef.current.get(key)?.dispose();
    contentListenersRef.current.delete(key);
    modelsRef.current.get(key)?.dispose();
    modelsRef.current.delete(key);
    baselinesRef.current.delete(key);
    truncatedRef.current.delete(key);

    setOpenTabs((prev) => {
      const next = prev.filter((t) => tabKey(t.relativePath) !== key);
      syncDirtyFlag(next);

      if (activePathRef.current === key) {
        const nextActive = next[next.length - 1]?.relativePath ?? null;
        setActivePath(nextActive);
        if (nextActive) {
          const model = modelsRef.current.get(tabKey(nextActive));
          if (model) {
            showModel(nextActive, model, truncatedRef.current.has(tabKey(nextActive)));
          }
          onSelectedPathChange(nextActive);
        } else {
          editorRef.current?.setModel(null);
        }
      }
      return next;
    });
  }, [onSelectedPathChange, pendingMeta, showModel, syncDirtyFlag]);

  const handleInlineApproval = useCallback((approved: boolean): void => {
    const pending = getCoderPendingApproval(state, activeRunId);
    if (!pending || !activeRunId) return;
    void window.glass.agentApprove({
      runId: activeRunId,
      pendingToolId: pending.pendingToolId,
      approved,
    });
  }, [activeRunId, state]);

  const handleApplyAll = useCallback((): void => {
    const pending = getCoderPendingApproval(state, activeRunId);
    if (!pending || !activeRunId || pending.isDelete) return;
    void window.glass.agentSetApprovalMode({ runId: activeRunId, mode: "trust_edits" }).then(() => {
      handleInlineApproval(true);
    });
  }, [activeRunId, handleInlineApproval, state]);

  const pendingApproval = getCoderPendingApproval(state, activeRunId);
  const diffHunks = useMemo(
    () => groupDiffIntoHunks(pendingApproval?.displayLines),
    [pendingApproval?.displayLines],
  );

  useEffect(() => {
    setHunkIndex(0);
  }, [pendingApproval?.pendingToolId]);

  const revealHunk = useCallback((index: number): void => {
    const hunk = diffHunks[index];
    if (!hunk) return;
    const modified = diffSessionRef.current?.diffEditor.getModifiedEditor() ?? editorRef.current;
    modified?.revealLineInCenter(hunk.startLine);
    modified?.setPosition({ lineNumber: hunk.startLine, column: 1 });
  }, [diffHunks]);

  const handlePrevHunk = useCallback((): void => {
    setHunkIndex((prev) => {
      const next = Math.max(0, prev - 1);
      revealHunk(next);
      return next;
    });
  }, [revealHunk]);

  const handleNextHunk = useCallback((): void => {
    setHunkIndex((prev) => {
      const next = Math.min(diffHunks.length - 1, prev + 1);
      revealHunk(next);
      return next;
    });
  }, [diffHunks.length, revealHunk]);

  const handleSkipAll = useCallback((): void => {
    const pending = getCoderPendingApproval(state, activeRunId);
    if (!pending || !activeRunId) return;
    void window.glass.agentSetApprovalMode({ runId: activeRunId, mode: "skip_all" }).then(() => {
      handleInlineApproval(false);
    });
  }, [activeRunId, handleInlineApproval, state]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const editor = initMonacoEditor(container);
    editorRef.current = editor;
    setMonacoEditor(editor);
    setEditorReady(true);
    const selectionDisposable = editor.onDidChangeCursorSelection(() => syncEditorContext());
    const modelDisposable = editor.onDidChangeModel(() => syncEditorContext());
    syncEditorContext();

    return () => {
      selectionDisposable.dispose();
      modelDisposable.dispose();
      clearDiffSession();
      for (const d of contentListenersRef.current.values()) d.dispose();
      contentListenersRef.current.clear();
      for (const m of modelsRef.current.values()) m.dispose();
      modelsRef.current.clear();
      editor.dispose();
      editorRef.current = null;
      setMonacoEditor(null);
      setEditorReady(false);
    };
  }, [clearDiffSession, syncEditorContext]);

  const remountModelsForProjectRoot = useCallback((projectRoot: string | null): void => {
    if (!projectRoot) return;
    for (const [relativePath, oldModel] of modelsRef.current.entries()) {
      const target = modelUriForRelativePath(relativePath, projectRoot);
      if (oldModel.uri.toString() === target.toString()) continue;
      const next = monaco.editor.createModel(
        oldModel.getValue(),
        oldModel.getLanguageId(),
        target,
      );
      contentListenersRef.current.get(relativePath)?.dispose();
      attachContentListener(relativePath, next);
      modelsRef.current.set(relativePath, next);
      oldModel.dispose();
      if (activePathRef.current === relativePath && editorRef.current) {
        editorRef.current.setModel(next);
      }
    }
  }, [attachContentListener]);

  useEffect(() => {
    if (!editorReady) return;
    const rootLabel = state.glassSettings.agentCodeWorkspaceRoot?.trim() ?? "";
    let cancelled = false;
    setTsIntelligenceReady(false);

    void (async () => {
      if (!rootLabel) {
        projectRootForModelsRef.current = null;
        await configureGlassIdeTypeScript("");
        if (!cancelled) setTsIntelligenceReady(true);
        return;
      }

      const res = await configureGlassIdeTypeScript(rootLabel);
      if (cancelled) return;
      projectRootForModelsRef.current = res.projectRoot ?? null;
      remountModelsForProjectRoot(projectRootForModelsRef.current);
      setTsIntelligenceReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [editorReady, remountModelsForProjectRoot, state.glassSettings.agentCodeWorkspaceRoot]);

  useEffect(() => {
    if (!editorReady || !tsIntelligenceReady || !selectedPath) return;
    const key = tabKey(selectedPath);
    if (key === activePathRef.current) return;
    void openFile(key);
  }, [editorReady, tsIntelligenceReady, selectedPath, openFile]);

  useEffect(() => {
    if (!showDiffView) {
      const key = activePathRef.current;
      if (!key) return;
      const model = modelsRef.current.get(key);
      if (model && editorRef.current?.getModel() !== model) {
        showModel(key, model, truncatedRef.current.has(key));
      }
      return;
    }
    diffSessionRef.current?.diffEditor.layout();
  }, [showDiffView, showModel]);

  useEffect(() => {
    const pending = getCoderPendingApproval(state, activeRunId);
    if (!pending) {
      clearDiffSession();
      setPendingMeta(null);
      lastPendingToolRef.current = null;
      const key = activePathRef.current;
      if (key) {
        const model = modelsRef.current.get(key);
        if (model) showModel(key, model, truncatedRef.current.has(key));
      }
      return;
    }

    if (lastPendingToolRef.current === pending.pendingToolId) return;
    lastPendingToolRef.current = pending.pendingToolId;

    void (async () => {
      await openFile(
        pending.relativePath,
        firstChangedLineFromDisplay(pending.displayLines),
        { skipShowModel: true },
      );
      await mountPendingDiff(pending);
    })();
  }, [
    state.agentPendingApproval,
    activeRunId,
    openFile,
    mountPendingDiff,
    clearDiffSession,
    showModel,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "s") return;
      if (!activePathRef.current || pendingMeta) return;
      e.preventDefault();
      void saveFile(activePathRef.current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveFile, pendingMeta]);

  useEffect(() => {
    for (const entry of state.agentChangeLog ?? []) {
      if (entry.action !== "applied") continue;
      const key = `${entry.relativePath}:${entry.at}`;
      if (seenAppliedRef.current.has(key)) continue;
      seenAppliedRef.current.add(key);
      void (async () => {
        await openFile(entry.relativePath);
        await reloadFromDisk(entry.relativePath);
        onTreeRefresh?.();
        pulseLines([1]);
      })();
    }
  }, [state.agentChangeLog, openFile, reloadFromDisk, onTreeRefresh, pulseLines]);

  const switchTab = useCallback((relativePath: string): void => {
    const key = tabKey(relativePath);
    const model = modelsRef.current.get(key);
    if (!model) return;
    setActivePath(key);
    onSelectedPathChange(key);
    if (!pendingMeta || !pathsMatchRelative(key, pendingMeta.relativePath)) {
      showModel(key, model, truncatedRef.current.has(key));
    }
  }, [onSelectedPathChange, pendingMeta, showModel]);

  const activeTab = openTabs.find((t) => tabKey(t.relativePath) === tabKey(activePath ?? ""));
  const activeTruncated = activeTab?.truncated ?? false;

  return (
    <div className="gide-editor-workspace" data-testid="glass-ide-editor-workspace">
      {openTabs.length > 0 ? (
        <div className="gide-file-tabs">
          {openTabs.map((tab) => {
            const key = tabKey(tab.relativePath);
            const isActive = key === tabKey(activePath ?? "");
            const isPendingTab = pendingMeta && pathsMatchRelative(key, pendingMeta.relativePath);
            return (
              <div
                key={key}
                className={`gide-file-tab${isActive ? " gide-file-tab--active" : ""}${isPendingTab ? " gide-file-tab--pending" : ""}`}
              >
                <button
                  type="button"
                  className="gide-file-tab__label"
                  title={key}
                  onClick={() => switchTab(key)}
                  onPointerDown={ensureOverlayInteractive}
                >
                  {tab.dirty ? <span className="gide-file-tab__dot">●</span> : null}
                  {isPendingTab ? <span className="gide-file-tab__pending-mark">◆</span> : null}
                  {key.split("/").pop()}
                </button>
                <button
                  type="button"
                  className="gide-file-tab__close"
                  aria-label={`Close ${key.split("/").pop()}`}
                  onClick={() => closeTab(key)}
                  disabled={Boolean(isPendingTab)}
                  onPointerDown={ensureOverlayInteractive}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {pendingMeta ? (
        <div className="gide-inline-approval" data-testid="glass-ide-inline-approval">
          <div className="gide-inline-approval__copy">
            <span className="gide-inline-approval__path">{pendingMeta.relativePath}</span>
            <span className="gide-inline-approval__desc">{pendingMeta.description}</span>
            {pendingMeta.isDelete ? (
              <span className="gide-inline-approval__warning">
                This file will be moved to Trash.
              </span>
            ) : null}
            {!showDiffView ? (
              <span className="gide-inline-approval__hint">Switch to the marked tab to review the diff.</span>
            ) : null}
          </div>
          <div className="gide-inline-approval__actions">
            <button
              type="button"
              className={`gide-inline-approval__btn gide-inline-approval__btn--primary${pendingMeta.isDelete ? " gide-inline-approval__btn--danger" : ""}`}
              onClick={() => handleInlineApproval(true)}
              onPointerDown={ensureOverlayInteractive}
            >
              {pendingMeta.isDelete ? "Delete" : "Apply"}
            </button>
            <button
              type="button"
              className="gide-inline-approval__btn"
              onClick={() => handleInlineApproval(false)}
              onPointerDown={ensureOverlayInteractive}
            >
              Skip
            </button>
            {!pendingMeta.isDelete ? (
              <>
                {diffHunks.length > 1 ? (
                  <div className="gide-inline-approval__hunks" data-testid="glass-ide-hunk-nav">
                    <button
                      type="button"
                      className="gide-inline-approval__btn gide-inline-approval__btn--secondary"
                      onClick={handlePrevHunk}
                      disabled={hunkIndex <= 0}
                      onPointerDown={ensureOverlayInteractive}
                    >
                      Prev hunk
                    </button>
                    <span className="gide-inline-approval__hunk-label">
                      Hunk {hunkIndex + 1} / {diffHunks.length}
                    </span>
                    <button
                      type="button"
                      className="gide-inline-approval__btn gide-inline-approval__btn--secondary"
                      onClick={handleNextHunk}
                      disabled={hunkIndex >= diffHunks.length - 1}
                      onPointerDown={ensureOverlayInteractive}
                    >
                      Next hunk
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="gide-inline-approval__btn gide-inline-approval__btn--secondary"
                  onClick={handleApplyAll}
                  onPointerDown={ensureOverlayInteractive}
                  data-testid="glass-ide-trust-edits-editor"
                >
                  Trust edits for this run
                </button>
                <button
                  type="button"
                  className="gide-inline-approval__btn gide-inline-approval__btn--secondary"
                  onClick={handleSkipAll}
                  onPointerDown={ensureOverlayInteractive}
                >
                  Skip all
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeTruncated && !showDiffView ? (
        <div className="gide-editor__banner">File truncated — read-only preview.</div>
      ) : null}
      {loadError ? (
        <div className="gide-editor__error">{loadError}</div>
      ) : null}
      {loadingPath && !loadError ? (
        <div className="gide-editor__loading">Opening…</div>
      ) : null}

      {openTabs.length === 0 ? (
        <div className="gide-editor-empty gide-editor-empty--overlay">
          <p>Select a file from the project tree, or click <strong>Show</strong> on a changelog entry.</p>
        </div>
      ) : null}

      <div className="gide-editor-body">
        <div
          ref={containerRef}
          className={`gide-editor__surface${openTabs.length === 0 || showDiffView ? " gide-editor__surface--hidden" : ""}`}
        />
        <div
          ref={diffContainerRef}
          className={`gide-editor__surface gide-editor__surface--diff${showDiffView ? "" : " gide-editor__surface--hidden"}`}
          data-testid="glass-ide-diff-editor"
        />
      </div>
    </div>
  );
}
