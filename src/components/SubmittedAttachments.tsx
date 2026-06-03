import type { ComposerAttachment } from "../types/attachments";
import { formatAttachmentSize } from "../utils/composerAttachments";

interface SubmittedAttachmentsProps {
  attachments: ComposerAttachment[];
}

function fileIcon(kind: ComposerAttachment["kind"]): string {
  if (kind === "image") return "🖼";
  if (kind === "text") return "📄";
  return "📎";
}

export default function SubmittedAttachments({ attachments }: SubmittedAttachmentsProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="submitted-attachments">
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className={`submitted-attachment submitted-attachment-${attachment.kind}`}
        >
          {attachment.kind === "image" && attachment.previewUrl ? (
            <a
              href={attachment.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="submitted-attachment-image-link"
            >
              <img
                src={attachment.previewUrl}
                alt={attachment.name}
                className="submitted-attachment-image"
              />
            </a>
          ) : (
            <div className="submitted-attachment-file">
              <span className="submitted-attachment-icon" aria-hidden="true">
                {fileIcon(attachment.kind)}
              </span>
              <span className="submitted-attachment-name">{attachment.name}</span>
              <span className="submitted-attachment-size">
                {formatAttachmentSize(attachment.size)}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
