import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { LayoutDashboard, Monitor, Power, PowerOff, ScanEye } from "lucide-react";
import { armBuilderStripInteractive, syncAletheiaStripMenuOpen } from "./useBuilderStripClickThrough.ts";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";
import "./AletheiaStripMenu.css";

const MENU_GAP_PX = 10;

interface AletheiaStripMenuProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  companionActive: boolean;
  dashboardActive: boolean;
  useComputerActive: boolean;
  onClose: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onDashboard: () => void;
  onUseComputer: () => void;
}

export function AletheiaStripMenu({
  open,
  anchorRef,
  companionActive,
  dashboardActive,
  useComputerActive,
  onClose,
  onActivate,
  onDeactivate,
  onDashboard,
  onUseComputer,
}: AletheiaStripMenuProps): JSX.Element | null {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ left: number; bottom: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setCoords({
      left: rect.left + rect.width / 2,
      bottom: window.innerHeight - rect.top + MENU_GAP_PX,
    });
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;

    let armed = false;
    const armTimer = requestAnimationFrame(() => {
      armed = true;
    });

    const onPointerDown = (event: PointerEvent): void => {
      if (!armed) return;
      const target = event.target as Node | null;
      if (menuRef.current?.contains(target)) return;
      if (target instanceof Element) {
        if (target.closest("[data-testid='glass-companion-toggle']")) return;
        if (target.closest(".builder-strip__aletheia-wrap")) return;
      }
      onClose();
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(armTimer);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open || !coords) return null;

  const armMenuPointer = (): void => {
    armBuilderStripInteractive();
    syncAletheiaStripMenuOpen(true);
    ensureOverlayInteractive();
  };

  return createPortal(
    <div
      ref={menuRef}
      className="aletheia-strip-menu"
      role="menu"
      aria-label="Aletheia actions"
      data-testid="aletheia-strip-menu"
      style={{
        position: "fixed",
        left: coords.left,
        bottom: coords.bottom,
        transform: "translate(-50%, 0)",
      }}
      onPointerDownCapture={armMenuPointer}
      onPointerEnter={armMenuPointer}
    >
      <header className="aletheia-strip-menu__header">
        <span className="aletheia-strip-menu__header-icon" aria-hidden="true">
          <ScanEye size={16} strokeWidth={1.85} />
        </span>
        <div className="aletheia-strip-menu__header-text">
          <span className="aletheia-strip-menu__header-title">Aletheia</span>
          <span className="aletheia-strip-menu__header-sub">Truth engine · voice presence</span>
        </div>
      </header>

      <div className="aletheia-strip-menu__section">
        <button
          type="button"
          className={`aletheia-strip-menu__item${companionActive ? " aletheia-strip-menu__item--activate-on" : ""}`}
          role="menuitem"
          data-testid="aletheia-strip-menu-activate"
          disabled={companionActive}
          onClick={onActivate}
        >
          <span className="aletheia-strip-menu__item-icon" aria-hidden="true">
            <Power size={15} strokeWidth={2} />
          </span>
          <span className="aletheia-strip-menu__item-body">
            <span className="aletheia-strip-menu__label">Activate</span>
            <span className="aletheia-strip-menu__hint">
              {companionActive ? "Aletheia is on" : "Start listening & presence"}
            </span>
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
          <span className="aletheia-strip-menu__item-icon" aria-hidden="true">
            <PowerOff size={15} strokeWidth={2} />
          </span>
          <span className="aletheia-strip-menu__item-body">
            <span className="aletheia-strip-menu__label">Deactivate</span>
            <span className="aletheia-strip-menu__hint">
              {companionActive ? "Stop Aletheia" : "Aletheia is off"}
            </span>
          </span>
        </button>
      </div>

      <div className="aletheia-strip-menu__divider" aria-hidden="true" />

      <div className="aletheia-strip-menu__section">
        <button
          type="button"
          className={`aletheia-strip-menu__item${useComputerActive ? " aletheia-strip-menu__item--active" : ""}`}
          role="menuitem"
          data-testid="aletheia-strip-menu-use-computer"
          onClick={onUseComputer}
        >
          <span className="aletheia-strip-menu__item-icon" aria-hidden="true">
            <Monitor size={15} strokeWidth={2} />
          </span>
          <span className="aletheia-strip-menu__item-body">
            <span className="aletheia-strip-menu__label">Use computer for this task</span>
            <span className="aletheia-strip-menu__hint">
              {useComputerActive
                ? "Hint on — ask Aletheia in the command bar"
                : "Focus command bar with computer hint"}
            </span>
          </span>
        </button>
        <button
          type="button"
          className={`aletheia-strip-menu__item aletheia-strip-menu__item--dashboard${dashboardActive ? " aletheia-strip-menu__item--active" : ""}`}
          role="menuitem"
          data-testid="aletheia-strip-menu-dashboard"
          onClick={onDashboard}
        >
          <span className="aletheia-strip-menu__item-icon" aria-hidden="true">
            <LayoutDashboard size={15} strokeWidth={2} />
          </span>
          <span className="aletheia-strip-menu__item-body">
            <span className="aletheia-strip-menu__label">Dashboard</span>
            <span className="aletheia-strip-menu__hint">
              {dashboardActive ? "Close command surface" : "Open Aletheia dashboard"}
            </span>
          </span>
        </button>
      </div>
    </div>,
    document.body,
  );
}
