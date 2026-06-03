import {
  CONTEXT_EPHEMERAL_REMINDER,
  CONTEXT_TRUNCATION_NOTE,
  contextScreenshotUrl,
  contextTypeLabel,
  isScreenshotContextItem,
  sourceConfidenceDetail,
  sourceConfidenceFromType,
  sourceConfidenceLabel,
  type AttachedContextItem,
} from "../types/contextBridge";

interface ContextAttachmentChipsProps {
  items: AttachedContextItem[];
  onRemove: (id: string) => void;
  onPreview?: (item: AttachedContextItem) => void;
  disabled?: boolean;
  visionConfigured?: boolean;
}

export default function ContextAttachmentChips({
  items,
  onRemove,
  onPreview,
  disabled = false,
  visionConfigured = false,
}: ContextAttachmentChipsProps) {
  if (items.length === 0) return null;

  const hasEphemeral = items.some((item) => item.ephemeral !== false && !item.savedId);
  const hasTruncation = items.some((item) => item.willTruncate);
  const hasScreenshot = items.some((item) => isScreenshotContextItem(item));

  return (
    <div className="context-attachment-bar" data-testid="context-attachment-bar">
      <div className="context-attachment-bar-header">
        <span className="context-attachment-label">Context attached</span>
        {hasEphemeral && (
          <span className="context-attachment-reminder muted" data-testid="context-ephemeral-reminder">
            {CONTEXT_EPHEMERAL_REMINDER}
          </span>
        )}
      </div>
      {hasTruncation && (
        <p className="context-truncation-warning" data-testid="context-truncation-warning">
          {CONTEXT_TRUNCATION_NOTE}
        </p>
      )}
      {hasScreenshot && (
        <p className="context-screenshot-vision-note muted" data-testid="context-screenshot-vision-note">
          Screenshot attached ·{" "}
          {visionConfigured ? "Vision analysis available" : "Visual analysis not configured"}
        </p>
      )}
      <div className="context-attachment-chips">
        {items.map((item) => {
          const confidence = sourceConfidenceFromType(item.type);
          const screenshotItem = isScreenshotContextItem(item);
          const screenshotUrl = screenshotItem
            ? contextScreenshotUrl(item.savedId ?? item.id)
            : null;
          return (
            <div
              key={item.id}
              className={`context-attachment-chip${screenshotItem ? " context-attachment-chip-screenshot" : ""}`}
              data-testid="context-attachment-chip"
              data-confidence={confidence}
              data-truncated={item.willTruncate ? "true" : "false"}
            >
              {screenshotUrl && (
                <a
                  href={screenshotUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="context-chip-screenshot-preview"
                  data-testid="context-chip-screenshot-preview"
                  onClick={(e) => e.stopPropagation()}
                >
                  <img src={screenshotUrl} alt={item.title} />
                </a>
              )}
              <button
                type="button"
                className="context-chip-main"
                disabled={disabled}
                onClick={() => onPreview?.(item)}
                title={item.contentText.slice(0, 500)}
              >
                <span className="context-chip-row">
                  <span className="context-chip-title">{item.title}</span>
                  <span className="context-chip-meta">
                    · {contextTypeLabel(item.type)} · Source: {sourceConfidenceLabel(confidence)}
                  </span>
                </span>
                {screenshotItem && (
                  <span className="context-chip-screenshot-badge" data-testid="context-screenshot-badge">
                    Screenshot attached
                  </span>
                )}
                <span className="context-chip-confidence muted">
                  Confidence: {sourceConfidenceDetail(confidence)}
                </span>
                {item.willTruncate && (
                  <span className="context-chip-truncate muted">May truncate for run</span>
                )}
              </button>
              <button
                type="button"
                className="context-chip-remove"
                aria-label={`Remove ${item.title}`}
                disabled={disabled}
                data-testid="context-chip-remove"
                onClick={() => onRemove(item.id)}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
