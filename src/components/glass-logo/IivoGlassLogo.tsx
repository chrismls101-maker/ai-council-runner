import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import * as THREE from "three";
import { LogoCanvas } from "./LogoScene.tsx";
import type { IivoGlassLogoProps } from "./types.ts";
import { DEFAULT_GLASS_LOGO_PROPS } from "./types.ts";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function detectWebGL(): boolean {
  if (typeof document === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true }) ??
      canvas.getContext("webgl", { failIfMajorPerformanceCaveat: true });
    return !!gl;
  } catch {
    return false;
  }
}

function isMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 768px)").matches;
}

export default function IivoGlassLogo(props: IivoGlassLogoProps) {
  const merged = useMemo(
    () => ({ ...DEFAULT_GLASS_LOGO_PROPS, ...props }),
    [props],
  );
  const {
    backgroundColor,
    className,
    style,
    onFallback,
    logoSize,
    idleFloatEnabled,
    shatterEnabled,
  } = merged;

  const containerRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef(new THREE.Vector2(0, 0));
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [webglSupported, setWebglSupported] = useState(true);
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const ok = detectWebGL();
    const mobile = isMobile();
    const fallback = !ok || (mobile && window.devicePixelRatio > 2);
    setWebglSupported(ok);
    setUseFallback(fallback);
    if (fallback) onFallback?.();
  }, [onFallback]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (reducedMotion) return;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      pointerRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    },
    [reducedMotion],
  );

  const rootStyle: CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    minHeight: 280,
    background: backgroundColor,
    overflow: "hidden",
    touchAction: "none",
    ...style,
  };

  return (
    <div
      ref={containerRef}
      className={["iivo-glass-logo", className].filter(Boolean).join(" ")}
      style={rootStyle}
      onPointerMove={handlePointerMove}
      data-testid="iivo-glass-logo"
      aria-label="IIVO glass logo"
      role="img"
    >
      {useFallback ? (
        <div className="iivo-glass-logo__fallback" aria-hidden="true">
          <img src="/iivo-glass-logo-fallback.png" alt="" draggable={false} />
          <span className="iivo-glass-logo__fallback-text">IIVO</span>
        </div>
      ) : (
        <LogoCanvas
          {...merged}
          pointerRef={pointerRef}
          reducedMotion={reducedMotion}
          webglSupported={webglSupported}
        />
      )}

      {!reducedMotion && shatterEnabled && !useFallback ? (
        <p className="iivo-glass-logo__hint">Click to shatter · moves with cursor</p>
      ) : null}

      {/* Hidden props consumed by parent hero layouts */}
      <span hidden data-logo-size={logoSize} data-idle-float={idleFloatEnabled} />
    </div>
  );
}

export { DEFAULT_GLASS_LOGO_PROPS };
export type { IivoGlassLogoProps };
