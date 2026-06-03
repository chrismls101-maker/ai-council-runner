import {
  contextScreenshotUrl,
  contextTypeLabel,
  isScreenshotContextItem,
  type AttachedContextItem,
} from "../types/contextBridge";

interface SubmittedContextItemsProps {
  items: AttachedContextItem[];
}

function screenshotUrlForItem(item: AttachedContextItem): string | null {
  if (!isScreenshotContextItem(item)) return null;
  return contextScreenshotUrl(item.savedId ?? item.id);
}

export default function SubmittedContextItems({ items }: SubmittedContextItemsProps) {
  if (items.length === 0) return null;

  return (
    <div className="submitted-context-items" data-testid="submitted-context-items">
      {items.map((item) => {
        const screenshotUrl = screenshotUrlForItem(item);
        return (
          <div
            key={item.id}
            className="submitted-context-item"
            data-testid="submitted-context-item"
            data-context-type={item.type}
          >
            {screenshotUrl ? (
              <a
                href={screenshotUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="submitted-context-screenshot-link"
                data-testid="submitted-context-screenshot"
              >
                <img
                  src={screenshotUrl}
                  alt={item.title}
                  className="submitted-context-screenshot-image"
                />
                <span className="submitted-context-screenshot-caption">{item.title}</span>
              </a>
            ) : (
              <div className="submitted-context-chip">
                <span className="submitted-context-chip-title">{item.title}</span>
                <span className="submitted-context-chip-meta muted">
                  {contextTypeLabel(item.type)}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
