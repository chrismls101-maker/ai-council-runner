import { useEffect, useState } from "react";
import "./GlassQaModeNotification.css";

const CHECKLIST = [
  { icon: "✓", text: "Typecheck" },
  { icon: "✓", text: "Tests" },
  { icon: "✓", text: "Lint" },
  { icon: "✓", text: "Preview smoke — console error scan" },
  { icon: "◎", text: "Two-pass AI review", sub: ["Correctness", "Production readiness"] },
] as const;

interface GlassQaModeNotificationProps {
  visible: boolean;
  onDismiss: () => void;
  onLearnMore?: () => void;
}

export function GlassQaModeNotification({
  visible,
  onDismiss,
  onLearnMore,
}: GlassQaModeNotificationProps): JSX.Element | null {
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  if (!mounted) return null;

  return (
    <div
      className={`gqa-notification${visible ? " gqa-notification--visible" : ""}`}
      data-testid="glass-qa-mode-notification"
      role="dialog"
      aria-labelledby="gqa-notification-title"
    >
      <div className="gqa-notification__icon" aria-hidden="true">◈</div>
      <h2 id="gqa-notification-title" className="gqa-notification__title">
        QA Mode: local shipping gate
      </h2>
      <p className="gqa-notification__body">
        After Glass edits code, QA Mode runs local checks, runtime smoke, and two AI reviews
        before marking the run complete. Skipped checks are always disclosed.
      </p>
      <ul className="gqa-notification__list">
        {CHECKLIST.map((item, i) => (
          <li
            key={item.text}
            className="gqa-notification__item"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <span className="gqa-notification__item-icon">{item.icon}</span>
            <span>
              {item.text}
              {"sub" in item && item.sub ? (
                <span className="gqa-notification__sub">
                  {item.sub.map((line) => (
                    <span key={line} className="gqa-notification__sub-line">{line}</span>
                  ))}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <div className="gqa-notification__actions">
        <button
          type="button"
          className="gqa-notification__btn gqa-notification__btn--primary"
          onClick={onDismiss}
        >
          Turn on for this session
        </button>
        <button
          type="button"
          className="gqa-notification__btn"
          onClick={onDismiss}
        >
          Not now
        </button>
        {onLearnMore ? (
          <button
            type="button"
            className="gqa-notification__btn gqa-notification__btn--link"
            onClick={onLearnMore}
          >
            Learn what runs
          </button>
        ) : null}
      </div>
    </div>
  );
}
