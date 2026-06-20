import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type TooltipPlacement = "top" | "bottom" | "auto";

type GlassHoverTooltipProps = {
  label: string;
  children: ReactNode;
  /** Gap between anchor and tooltip in px */
  gap?: number;
  /** Prefer below the anchor — use for controls near the top of a clipped window. */
  placement?: TooltipPlacement;
};

const TOOLTIP_FLIP_THRESHOLD_PX = 48;

function resolvePlacement(rect: DOMRect, placement: TooltipPlacement): "top" | "bottom" {
  if (placement === "top") return "top";
  if (placement === "bottom") return "bottom";
  return rect.top < TOOLTIP_FLIP_THRESHOLD_PX ? "bottom" : "top";
}

export function GlassHoverTooltip({
  label,
  children,
  gap = 10,
  placement = "auto",
}: GlassHoverTooltipProps): JSX.Element {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [resolvedPlacement, setResolvedPlacement] = useState<"top" | "bottom">("top");

  const updatePosition = useCallback((): void => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const side = resolvePlacement(rect, placement);
    setResolvedPlacement(side);
    setCoords({
      top: side === "bottom" ? rect.bottom + gap : rect.top - gap,
      left: rect.left + rect.width / 2,
    });
  }, [gap, placement]);

  const show = useCallback((): void => {
    updatePosition();
    setVisible(true);
  }, [updatePosition]);

  const hide = useCallback((): void => {
    setVisible(false);
  }, []);

  useLayoutEffect(() => {
    if (!visible) return;
    updatePosition();
    const onReflow = (): void => updatePosition();
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [visible, updatePosition]);

  return (
    <>
      <span
        ref={wrapRef}
        className="glass-hover-tooltip-wrap"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {visible
        ? createPortal(
            <span
              className={`glass-hover-tooltip${resolvedPlacement === "bottom" ? " glass-hover-tooltip--below" : ""}`}
              role="tooltip"
              style={{
                top: coords.top,
                left: coords.left,
                transform:
                  resolvedPlacement === "bottom"
                    ? "translate(-50%, 0)"
                    : "translate(-50%, -100%)",
              }}
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
