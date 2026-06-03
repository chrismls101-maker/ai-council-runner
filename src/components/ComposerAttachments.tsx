import type { ComposerAttachment } from "../types/attachments";
import { formatAttachmentSize } from "../utils/composerAttachments";

interface ComposerAttachmentsProps {
  attachments: ComposerAttachment[];
  onRemove: (id: string) => void;
  disabled?: boolean;
}

function fileIcon(kind: ComposerAttachment["kind"]): string {
  if (kind === "image") return "🖼";
  if (kind === "text") return "📄";
  return "📎";
}

export default function ComposerAttachments({
  attachments,
  onRemove,
  disabled = false,
}: ComposerAttachmentsProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="composer-attachments" aria-label="Attached files">
      {attachments.map((attachment) => (
        <div key={attachment.id} className={`composer-attachment composer-attachment-${attachment.kind}`}>
          {attachment.kind === "image" && attachment.previewUrl ? (
            <img
              src={attachment.previewUrl}
              alt={attachment.name}
              className="composer-attachment-thumb"
            />
          ) : (
            <span className="composer-attachment-icon" aria-hidden="true">
              {fileIcon(attachment.kind)}
            </span>
          )}
          <div className="composer-attachment-meta">
            <span className="composer-attachment-name" title={attachment.name}>
              {attachment.name}
            </span>
            <span className="composer-attachment-size">{formatAttachmentSize(attachment.size)}</span>
          </div>
          {!disabled && (
            <button
              type="button"
              className="composer-attachment-remove"
              onClick={() => onRemove(attachment.id)}
              aria-label={`Remove ${attachment.name}`}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
