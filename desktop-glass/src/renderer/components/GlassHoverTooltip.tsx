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
const TOOLTIP_ESTIMATED_HEIGHT_PX = 34;
const VIEWPORT_MARGIN_PX = 8;

function resolvePlacement(
  rect: DOMRect,
  placement: TooltipPlacement,
  gap: number,
  tipHeight: number,
): "top" | "bottom" {
  if (placement === "top") return "top";
  if (placement === "bottom") return "bottom";
  const viewportH = window.innerHeight ?? 900;
  const spaceAbove = rect.top - gap;
  const spaceBelow = viewportH - rect.bottom - gap;
  const height = Math.max(tipHeight, TOOLTIP_ESTIMATED_HEIGHT_PX);
  if (rect.top < TOOLTIP_FLIP_THRESHOLD_PX) return "bottom";
  if (rect.bottom > viewportH - TOOLTIP_FLIP_THRESHOLD_PX) return "top";
  if (spaceBelow < height && spaceAbove >= height) return "top";
  if (spaceAbove < height && spaceBelow >= height) return "bottom";
  return spaceBelow >= spaceAbove ? "bottom" : "top";
}

function clampHorizontal(centerX: number, tipWidth: number): number {
  const halfW = tipWidth / 2;
  const min = VIEWPORT_MARGIN_PX + halfW;
  const max = window.innerWidth - VIEWPORT_MARGIN_PX - halfW;
  if (min > max) return window.innerWidth / 2;
  return Math.min(max, Math.max(min, centerX));
}

/** Split trailing shortcut (e.g. " · ⌘⇧G") onto its own line. */
function parseTooltipLabel(label: string): { body: string; shortcut?: string } {
  const dotIdx = label.lastIndexOf(" · ");
  if (dotIdx >= 0) {
    return {
      body: label.slice(0, dotIdx).trim(),
      shortcut: label.slice(dotIdx + 3).trim(),
    };
  }
  return { body: label };
}

export function GlassHoverTooltip({
  label,
  children,
  gap = 10,
  placement = "auto",
}: GlassHoverTooltipProps): JSX.Element {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [resolvedPlacement, setResolvedPlacement] = useState<"top" | "bottom">("top");
  const { body, shortcut } = parseTooltipLabel(label);
  const useWideLayout = body.length > 42 || Boolean(shortcut);

  const updatePosition = useCallback((): void => {
    const el = wrapRef.current;
    const tip = tooltipRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const tipRect = tip?.getBoundingClientRect();
    const tipWidth = tipRect?.width ?? 0;
    const tipHeight = tipRect?.height ?? TOOLTIP_ESTIMATED_HEIGHT_PX;

    let side = resolvePlacement(rect, placement, gap, tipHeight);

    // If measured, verify top placement fits; flip or clamp when clipped.
    if (tipRect && side === "top") {
      const visualTop = rect.top - gap - tipHeight;
      if (visualTop < VIEWPORT_MARGIN_PX) {
        const fitsBelow =
          rect.bottom + gap + tipHeight <= window.innerHeight - VIEWPORT_MARGIN_PX;
        side = fitsBelow ? "bottom" : "top";
      }
    }

    setResolvedPlacement(side);
    setCoords({
      top: side === "bottom" ? rect.bottom + gap : rect.top - gap,
      left: clampHorizontal(rect.left + rect.width / 2, tipWidth || 120),
    });
  }, [gap, placement]);

  const show = useCallback((): void => {
    setVisible(true);
  }, []);

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
  }, [visible, updatePosition, label]);

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
              ref={tooltipRef}
              className={[
                "glass-hover-tooltip",
                resolvedPlacement === "bottom" ? "glass-hover-tooltip--below" : "",
                useWideLayout ? "glass-hover-tooltip--wide" : "",
              ]
                .filter(Boolean)
                .join(" ")}
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
              <span className="glass-hover-tooltip__body">{body}</span>
              {shortcut ? (
                <span className="glass-hover-tooltip__shortcut">{shortcut}</span>
              ) : null}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
