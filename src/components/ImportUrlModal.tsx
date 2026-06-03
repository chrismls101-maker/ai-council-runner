import { useEffect, useState } from "react";
import IivoPlaceholderField from "./IivoPlaceholderField";
import { withIivoWordmark } from "../utils/brandText";
import { importContextUrl } from "../utils/contextBridgeApi";

interface ImportUrlModalProps {
  open: boolean;
  onClose: () => void;
  onImported: (item: {
    title: string;
    sourceUrl: string;
    contentText: string;
    contentSummary?: string;
    extractedAt?: string;
  }) => void;
  onImportedAndAsk: (item: {
    title: string;
    sourceUrl: string;
    contentText: string;
    contentSummary?: string;
    extractedAt?: string;
  }) => Promise<void>;
}

export default function ImportUrlModal({
  open,
  onClose,
  onImported,
  onImportedAndAsk,
}: ImportUrlModalProps) {
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setUrl("");
      setNote("");
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const runImport = async (andAsk: boolean) => {
    if (!url.trim()) return;
    setBusy(andAsk ? "ask" : "import");
    setError(null);
    try {
      const imported = await importContextUrl(url.trim());
      const payload = {
        ...imported,
        contentText: note.trim()
          ? `${imported.contentText}\n\nUser note:\n${note.trim()}`
          : imported.contentText,
      };
      if (andAsk) {
        await onImportedAndAsk(payload);
      } else {
        onImported(payload);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="memory-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="memory-modal context-bridge-modal"
        role="dialog"
        aria-labelledby="import-url-title"
        data-testid="import-url-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="memory-modal-header">
          <h2 id="import-url-title">Import URL</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="memory-modal-body">
          <p className="muted context-bridge-hint">
            {withIivoWordmark(
              "Public web pages only. IIVO cannot import private ChatGPT/Claude chats, logged-in pages, or local URLs — paste that text manually instead.",
              "import-url-hint",
            )}
          </p>
          <label className="memory-field">
            <span>URL</span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              data-testid="import-url-input"
            />
          </label>
          <label className="memory-field">
            <span>Optional note or question</span>
            <IivoPlaceholderField
              show={!note.trim()}
              before="What should "
              after=" focus on from this page?"
              variant="memory"
            >
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder=""
                aria-label="What should IIVO focus on from this page?"
              />
            </IivoPlaceholderField>
          </label>
          {error && (
            <p className="context-bridge-error" data-testid="import-url-error">
              {error}
            </p>
          )}
        </div>
        <div className="memory-modal-footer context-bridge-modal-footer">
          <button type="button" className="btn ghost small" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn ghost small"
            disabled={!url.trim() || busy !== null}
            data-testid="import-url-btn"
            onClick={() => void runImport(false)}
          >
            {busy === "import" ? "Importing…" : "Import"}
          </button>
          <button
            type="button"
            className="btn primary small"
            disabled={!url.trim() || busy !== null}
            data-testid="import-url-ask-btn"
            onClick={() => void runImport(true)}
          >
            {busy === "ask" ? "Importing…" : withIivoWordmark("Import and Ask IIVO", "import-ask")}
          </button>
        </div>
      </div>
    </div>
  );
}
