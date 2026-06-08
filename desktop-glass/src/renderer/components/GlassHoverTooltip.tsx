import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type GlassHoverTooltipProps = {
  label: string;
  children: ReactNode;
  /** Gap between anchor and tooltip in px */
  gap?: number;
};

export function GlassHoverTooltip({
  label,
  children,
  gap = 10,
}: GlassHoverTooltipProps): JSX.Element {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({
      top: rect.top - gap,
      left: rect.left + rect.width / 2,
    });
  }, [gap]);

  const show = useCallback(() => {
    updatePosition();
    setVisible(true);
  }, [updatePosition]);

  const hide = useCallback(() => {
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
              className="glass-hover-tooltip"
              role="tooltip"
              style={{
                top: coords.top,
                left: coords.left,
                transform: "translate(-50%, -100%)",
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
