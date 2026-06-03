import { useEffect, useRef, useState } from "react";
import type { IivoArtifact } from "../../types/artifacts";
import {
  artifactDeepLink,
  artifactShareSummary,
  artifactShareUrl,
  hasPermanentArtifactLink,
  isPublicShareEnabled,
  shareLinkLabel,
} from "../../utils/artifactShare";
import { copyText } from "../../utils/artifactClipboard";
import {
  createArtifactShareLink,
  fetchActiveShareForArtifact,
  fetchArtifactSaved,
  saveArtifactToLibrary,
  setArtifactShareEnabled,
  updateArtifactShareVisibility,
  type ArtifactShareRecord,
} from "../../utils/artifactApi";

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
  const [shareRecord, setShareRecord] = useState<ArtifactShareRecord | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetchArtifactSaved(artifact.id).then((v) => {
      setSaved(v);
      onSavedChange?.(v);
    });
    void fetchActiveShareForArtifact(artifact.id).then((record) => {
      if (record) setShareRecord(record);
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
  const deepLink = artifactDeepLink(runId, artifact.id);
  const shareUrl = shareRecord ? artifactShareUrl(shareRecord.shareId) : null;
  const linkAvailable = hasPermanentArtifactLink(runId, shareRecord?.shareId);

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

  const handleCreateShareLink = async () => {
    setShareBusy(true);
    const record = await createArtifactShareLink({
      artifactId: artifact.id,
      title: artifact.title,
      type: artifact.type,
      runId: runId ?? undefined,
      artifact,
    });
    setShareBusy(false);
    if (!record) {
      notify("Could not create share link.");
      return;
    }
    setShareRecord(record);
    onShareAction?.("create_share_link");
    notify(shareLinkLabel(record));
  };

  const handleCopyShareLink = async () => {
    const url = shareUrl ?? deepLink;
    if (!url) return;
    await copyText(url);
    notify("Share link copied.");
    onShareAction?.("copy_share_link");
    setShareOpen(false);
  };

  const handleDisableShareLink = async () => {
    if (!shareRecord) return;
    setShareBusy(true);
    const ok = await setArtifactShareEnabled(shareRecord.shareId, false);
    setShareBusy(false);
    if (ok) {
      setShareRecord(null);
      notify("Share link disabled.");
      onShareAction?.("disable_share_link");
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
              data-testid="share-create-link"
              disabled={shareBusy || Boolean(shareRecord)}
              onClick={() => void handleCreateShareLink()}
            >
              Create share link
            </button>
            <button
              type="button"
              className="btn ghost small share-item"
              data-testid="share-copy-link"
              disabled={!linkAvailable}
              title={
                linkAvailable
                  ? shareRecord
                    ? shareLinkLabel(shareRecord)
                    : "Copy link to this run and artifact"
                  : "Create a share link first."
              }
              onClick={() => void handleCopyShareLink()}
            >
              Copy share link
            </button>
            {shareRecord && isPublicShareEnabled() && shareRecord.visibility === "private_link" && (
              <button
                type="button"
                className="btn ghost small share-item"
                data-testid="share-enable-public"
                disabled={shareBusy}
                onClick={() => {
                  void updateArtifactShareVisibility(shareRecord.shareId, "public").then((next) => {
                    if (next) {
                      setShareRecord(next);
                      notify(shareLinkLabel(next));
                      onShareAction?.("enable_public_share");
                    }
                  });
                }}
              >
                Enable public visibility
              </button>
            )}
            {shareRecord && (
              <button
                type="button"
                className="btn ghost small share-item"
                data-testid="share-disable-link"
                disabled={shareBusy}
                onClick={() => void handleDisableShareLink()}
              >
                Disable share link
              </button>
            )}
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
          </div>
        )}
      </div>
    </div>
  );
}
