import { useEffect, useRef, useState } from "react";
import type { IivoArtifact } from "../../types/artifacts";
import {
  artifactDeepLink,
  artifactShareSummary,
  hasPermanentArtifactLink,
} from "../../utils/artifactShare";
import { copyText } from "../../utils/artifactClipboard";
import { fetchArtifactSaved, saveArtifactToLibrary } from "../../utils/artifactApi";

export interface ShareSaveMenuProps {
  artifact: IivoArtifact;
  runId?: string | null;
  onFeedback?: (message: string) => void;
  onSavedChange?: (saved: boolean) => void;
  onShareAction?: (action: string) => void;
}

export default function ShareSaveMenu({
  artifact,
  runId,
  onFeedback,
  onSavedChange,
  onShareAction,
}: ShareSaveMenuProps) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetchArtifactSaved(artifact.id).then((v) => {
      setSaved(v);
      onSavedChange?.(v);
    });
  }, [artifact.id, onSavedChange]);

  useEffect(() => {
    if (!shareOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShareOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [shareOpen]);

  const notify = (msg: string) => onFeedback?.(msg);
  const linkAvailable = hasPermanentArtifactLink(runId);
  const deepLink = artifactDeepLink(runId, artifact.id);

  const handleSave = async () => {
    if (saved) {
      notify("Already saved.");
      return;
    }
    setSaving(true);
    const ok = await saveArtifactToLibrary({
      artifactId: artifact.id,
      title: artifact.title,
      type: artifact.type,
      sourceRunId: runId ?? undefined,
      artifact,
    });
    setSaving(false);
    if (ok) {
      setSaved(true);
      onSavedChange?.(true);
      notify("Artifact saved.");
    } else {
      notify("Save failed — try again later.");
    }
  };

  return (
    <div className="share-save-menu" ref={menuRef}>
      <button
        type="button"
        className="btn ghost small"
        data-testid="builder-save"
        disabled={saving}
        onClick={() => void handleSave()}
      >
        {saved ? "Saved" : "Save"}
      </button>
      <div className="share-menu-wrap">
        <button
          type="button"
          className="btn ghost small"
          data-testid="builder-share"
          onClick={() => setShareOpen((v) => !v)}
        >
          Share
        </button>
        {shareOpen && (
          <div className="share-dropdown" data-testid="builder-share-menu">
            <button
              type="button"
              className="btn ghost small share-item"
              data-testid="share-copy-summary"
              onClick={() => {
                void copyText(artifactShareSummary(artifact)).then(() => {
                  notify("Summary copied");
                  onShareAction?.("copy_summary");
                  setShareOpen(false);
                });
              }}
            >
              Copy summary
            </button>
            <button
              type="button"
              className="btn ghost small share-item"
              data-testid="share-copy-export"
              onClick={() => {
                void copyText(artifactShareSummary(artifact)).then(() => {
                  notify("Export text copied");
                  onShareAction?.("copy_export");
                  setShareOpen(false);
                });
              }}
            >
              Copy export text
            </button>
            <button
              type="button"
              className="btn ghost small share-item"
              data-testid="share-copy-link"
              disabled={!linkAvailable}
              title={
                linkAvailable
                  ? "Copy link to this run and artifact"
                  : "Permanent links are not enabled yet."
              }
              onClick={() => {
                if (!deepLink) return;
                void copyText(deepLink).then(() => {
                  notify("Link copied");
                  onShareAction?.("copy_link");
                  setShareOpen(false);
                });
              }}
            >
              Copy artifact link
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
