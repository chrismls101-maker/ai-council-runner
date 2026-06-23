import { useState } from "react";
import type { GlassState } from "../../shared/ipc.ts";
import { GlassHoverTooltip } from "../components/GlassHoverTooltip.tsx";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";
import { GlassIdeEditorWorkspace } from "./GlassIdeEditorWorkspace.tsx";
import { GlassIdePreview } from "./GlassIdePreview.tsx";
import "./GlassIdeEditor.css";

type CenterTab = "editor" | "preview";

interface GlassIdeEditorPaneProps {
  state: GlassState;
  selectedPath: string | null;
  onSelectedPathChange: (relativePath: string) => void;
  onDirtyChange: (hasDirty: boolean) => void;
  onTreeRefresh?: () => void;
}

export function GlassIdeEditorPane({
  state,
  selectedPath,
  onSelectedPathChange,
  onDirtyChange,
  onTreeRefresh,
}: GlassIdeEditorPaneProps): JSX.Element {
  const [centerTab, setCenterTab] = useState<CenterTab>("editor");
  const [saveNotice, setSaveNotice] = useState<{ text: string; isError: boolean } | null>(null);

  return (
    <div className="gide-editor-pane" data-testid="glass-ide-editor-pane">
      <div className="gide-center-tabs">
        <GlassHoverTooltip label="Code editor" placement="bottom">
          <button
            type="button"
            className={`gide-center-tab${centerTab === "editor" ? " gide-center-tab--active" : ""}`}
            onClick={() => setCenterTab("editor")}
            onPointerDown={ensureOverlayInteractive}
            aria-label="Editor"
          >
            Editor
          </button>
        </GlassHoverTooltip>
        <GlassHoverTooltip label="Live preview in webview" placement="bottom">
          <button
            type="button"
            className={`gide-center-tab${centerTab === "preview" ? " gide-center-tab--active" : ""}`}
            onClick={() => setCenterTab("preview")}
            onPointerDown={ensureOverlayInteractive}
            aria-label="Preview"
          >
            Preview
          </button>
        </GlassHoverTooltip>
        {saveNotice ? (
          <span className={`gide-save-notice${saveNotice.isError ? " gide-save-notice--error" : ""}`}>
            {saveNotice.text}
          </span>
        ) : null}
      </div>
      <div className="gide-center-tab-body gide-center-tab-body--stacked">
        <div
          className={`gide-center-tab-panel${centerTab !== "preview" ? " gide-center-tab-panel--behind" : ""}`}
          aria-hidden={centerTab !== "preview"}
        >
          <GlassIdePreview state={state} />
        </div>
        <div
          className={`gide-center-tab-panel${centerTab !== "editor" ? " gide-center-tab-panel--behind" : ""}`}
          aria-hidden={centerTab !== "editor"}
        >
          <GlassIdeEditorWorkspace
            state={state}
            selectedPath={selectedPath}
            onSelectedPathChange={(path) => {
              setCenterTab("editor");
              onSelectedPathChange(path);
            }}
            onDirtyChange={onDirtyChange}
            onSaveNotice={(message, isError) => {
              setSaveNotice({ text: message, isError: Boolean(isError) });
              window.setTimeout(() => setSaveNotice(null), isError ? 3000 : 1500);
            }}
            onTreeRefresh={onTreeRefresh}
          />
        </div>
      </div>
    </div>
  );
}
