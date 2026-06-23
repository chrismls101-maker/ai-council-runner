import { useEffect, useState } from "react";
import "./GlassQaModeNotification.css";

const CHECKLIST = [
  { icon: "✓", text: "Types & build" },
  { icon: "✓", text: "Tests" },
  { icon: "✓", text: "Lint" },
  { icon: "✓", text: "Live preview — console error scan" },
  { icon: "◎", text: "Two-pass AI review", sub: ["Pass 1 — correctness", "Pass 2 — what breaks in production"] },
] as const;

interface GlassQaModeNotificationProps {
  visible: boolean;
  onDismiss: () => void;
}

export function GlassQaModeNotification({
  visible,
  onDismiss,
}: GlassQaModeNotificationProps): JSX.Element | null {
  const [progress, setProgress] = useState(100);
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setProgress(100);
    const start = Date.now();
    const duration = 6000;
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining <= 0) {
        window.clearInterval(interval);
        onDismiss();
      }
    }, 50);
    return () => window.clearInterval(interval);
  }, [visible, onDismiss]);

  if (!mounted) return null;

  return (
    <div
      className={`gqa-notification${visible ? " gqa-notification--visible" : ""}`}
      data-testid="glass-qa-mode-notification"
      role="dialog"
      aria-labelledby="gqa-notification-title"
    >
      <div className="gqa-notification__icon" aria-hidden="true">◈</div>
      <h2 id="gqa-notification-title" className="gqa-notification__title">QA Mode</h2>
      <p className="gqa-notification__body">
        Every Coder run now triggers a full quality pipeline before anything ships:
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
      <p className="gqa-notification__footer">
        Nothing leaves this session with a known issue.
      </p>
      <button
        type="button"
        className="gqa-notification__btn"
        onClick={onDismiss}
      >
        Got it
      </button>
      <div className="gqa-notification__countdown" aria-hidden="true">
        <div
          className="gqa-notification__countdown-bar"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
