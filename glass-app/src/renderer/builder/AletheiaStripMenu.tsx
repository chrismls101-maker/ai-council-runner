import { useEffect, useRef } from "react";
import "./AletheiaStripMenu.css";

interface AletheiaStripMenuProps {
  open: boolean;
  companionActive: boolean;
  dashboardActive: boolean;
  onClose: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onDashboard: () => void;
}

export function AletheiaStripMenu({
  open,
  companionActive,
  dashboardActive,
  onClose,
  onActivate,
  onDeactivate,
  onDashboard,
}: AletheiaStripMenuProps): JSX.Element | null {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (menuRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-testid='glass-companion-toggle']")) {
        return;
      }
      onClose();
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={menuRef}
      className="aletheia-strip-menu"
      role="menu"
      aria-label="Aletheia actions"
      data-testid="aletheia-strip-menu"
    >
      <button
        type="button"
        className="aletheia-strip-menu__item"
        role="menuitem"
        data-testid="aletheia-strip-menu-activate"
        disabled={companionActive}
        onClick={onActivate}
      >
        <span className="aletheia-strip-menu__label">Activate</span>
        <span className="aletheia-strip-menu__hint">
          {companionActive ? "Aletheia is on" : "Start Aletheia"}
        </span>
      </button>
      <button
        type="button"
        className="aletheia-strip-menu__item aletheia-strip-menu__item--deactivate"
        role="menuitem"
        data-testid="aletheia-strip-menu-deactivate"
        disabled={!companionActive}
        onClick={onDeactivate}
      >
        <span className="aletheia-strip-menu__label">Deactivate</span>
        <span className="aletheia-strip-menu__hint">
          {companionActive ? "Stop Aletheia" : "Aletheia is off"}
        </span>
      </button>
      <button
        type="button"
        className={`aletheia-strip-menu__item${dashboardActive ? " aletheia-strip-menu__item--active" : ""}`}
        role="menuitem"
        data-testid="aletheia-strip-menu-dashboard"
        onClick={onDashboard}
      >
        <span className="aletheia-strip-menu__label">Dashboard</span>
        <span className="aletheia-strip-menu__hint">
          {dashboardActive ? "Close dashboard" : "Open Aletheia dashboard"}
        </span>
      </button>
    </div>
  );
}
