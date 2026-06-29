import { useCallback, useState } from "react";
import { FileUp, FolderOpen, Trash2, Upload } from "lucide-react";
import type { GlassStorageFileRecord } from "../../shared/glassStorageFileTypes.ts";
import { formatGlassStorageFileSize } from "../../shared/glassStorageFileTypes.ts";
import { prepareGlassTextPointerDown } from "../glassTextInteraction.ts";
import "./GlassStorageFilesTab.css";

interface GlassStorageFilesTabProps {
  files: GlassStorageFileRecord[];
  onRefresh: () => void;
}

function filePathsFromDataTransfer(dataTransfer: DataTransfer): string[] {
  const paths: string[] = [];
  if (dataTransfer.files?.length) {
    for (const file of Array.from(dataTransfer.files)) {
      const withPath = file as File & { path?: string };
      if (withPath.path) paths.push(withPath.path);
    }
  }
  return paths;
}

export function GlassStorageFilesTab({
  files,
  onRefresh,
}: GlassStorageFilesTabProps): JSX.Element {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runImport = useCallback(async (paths: string[]): Promise<void> => {
    if (!paths.length) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.glass.importGlassStorageFiles(paths);
      if (!result.ok) {
        setError(result.error ?? "Upload failed");
        return;
      }
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }, [onRefresh]);

  const handlePickFiles = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.glass.pickAndImportGlassStorageFiles();
      if (!result.ok && result.error) {
        setError(result.error);
      }
      if (result.imported > 0) onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open file picker");
    } finally {
      setBusy(false);
    }
  }, [onRefresh]);

  const handleDrop = useCallback(
    (event: React.DragEvent): void => {
      event.preventDefault();
      setDragOver(false);
      void runImport(filePathsFromDataTransfer(event.dataTransfer));
    },
    [runImport],
  );

  const handleDelete = useCallback(
    async (fileId: string): Promise<void> => {
      setBusy(true);
      setError(null);
      try {
        const result = await window.glass.deleteGlassStorageFile(fileId);
        if (!result.ok) {
          setError(result.error ?? "Delete failed");
          return;
        }
        onRefresh();
      } finally {
        setBusy(false);
      }
    },
    [onRefresh],
  );

  return (
    <div className="glass-storage-files" data-testid="glass-storage-files-tab">
      <div className="glass-storage-files__center">
        <div
          className={`glass-storage-files__dropzone${dragOver ? " glass-storage-files__dropzone--over" : ""}${busy ? " glass-storage-files__dropzone--busy" : ""}`}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          data-testid="glass-storage-files-dropzone"
        >
          <div className="glass-storage-files__drop-icon" aria-hidden="true">
            <Upload size={32} strokeWidth={1.5} />
          </div>
          <h2 className="glass-storage-files__drop-title">Upload files</h2>
          <p className="glass-storage-files__drop-desc">
            Drop files here or choose from your Mac. Stored locally in Glass Storage.
          </p>
          <button
            type="button"
            className="glass-storage-files__choose"
            disabled={busy}
            onPointerDown={prepareGlassTextPointerDown}
            onClick={() => void handlePickFiles()}
            data-testid="glass-storage-files-choose"
          >
            <FileUp size={16} strokeWidth={1.75} aria-hidden="true" />
            Choose files
          </button>
        </div>

        {error ? (
          <p className="glass-storage-files__error" role="alert">
            {error}
          </p>
        ) : null}

        {files.length > 0 ? (
          <div className="glass-storage-files__list" data-testid="glass-storage-files-list">
            <p className="glass-storage-files__list-label">Uploaded</p>
            <ul>
              {files.map((file) => (
                <li key={file.id} className="glass-storage-files__row">
                  <span className="glass-storage-files__row-name">{file.name}</span>
                  <span className="glass-storage-files__row-meta">
                    {formatGlassStorageFileSize(file.sizeBytes)}
                  </span>
                  <div className="glass-storage-files__row-actions">
                    <button
                      type="button"
                      className="glass-storage-files__row-btn"
                      aria-label={`Reveal ${file.name} in Finder`}
                      onClick={() => void window.glass.revealGlassStorageFile(file.id)}
                    >
                      <FolderOpen size={14} strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      className="glass-storage-files__row-btn glass-storage-files__row-btn--danger"
                      aria-label={`Delete ${file.name}`}
                      disabled={busy}
                      onClick={() => void handleDelete(file.id)}
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
