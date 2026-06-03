import { useState, type ReactNode } from "react";

interface CollapsibleProps {
  title: ReactNode;
  badge?: ReactNode;
  warning?: boolean;
  defaultOpen?: boolean;
  testId?: string;
  children: ReactNode;
}

export default function Collapsible({
  title,
  badge,
  warning,
  defaultOpen = false,
  testId,
  children,
}: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`collapsible ${warning ? "collapsible-warning" : ""}`}>
      <button
        type="button"
        className="collapsible-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid={testId}
      >
        <span className="collapsible-chevron">{open ? "▾" : "▸"}</span>
        <span className="collapsible-title">{title}</span>
        {badge && <span className="collapsible-badge">{badge}</span>}
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  );
}
