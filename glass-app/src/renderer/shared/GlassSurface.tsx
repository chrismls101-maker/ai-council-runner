import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";
import "./glassSurface.css";

/**
 * The single Glass intelligence accent — "Aletheia is indicating something".
 * Never used for chrome or non-AI UI.
 */
export const GLASS_ACCENT_RGB = "167, 139, 250";
export const glassAccent = (alpha: number): string => `rgba(${GLASS_ACCENT_RGB}, ${alpha})`;

/** Arrival grammar: every surface is born from a point, never appears at full size. */
export const GLASS_ARRIVAL_EASING = "cubic-bezier(0.34, 1.56, 0.64, 1)";
export const GLASS_ARRIVAL_MS = 180;

export type GlassSurfaceProps = HTMLAttributes<HTMLDivElement> & {
  /** Dominant hue sampled from the app behind the surface (12% tint on border + pills). */
  appTint?: { h: number; s: number; l: number };
  /** Light frosted variant — never a black slab over a white document. */
  lightMode?: boolean;
  radius?: number;
  /** transform-origin ("x y") — the point this surface is born from. */
  origin?: string;
  children?: ReactNode;
};

/**
 * Shared frosted material for Glass This cards, Rewrite annotation cards, and
 * Guide caption surfaces. Tinted by the app beneath it.
 */
export const GlassSurface = forwardRef<HTMLDivElement, GlassSurfaceProps>(
  function GlassSurface(
    { appTint, lightMode, radius = 14, origin, className, style, children, ...rest },
    ref,
  ): JSX.Element {
    const tint = appTint
      ? `hsla(${appTint.h}, ${appTint.s}%, ${appTint.l}%, 0.12)`
      : "transparent";
    const surfaceStyle: CSSProperties = {
      ...style,
      borderRadius: radius,
      transformOrigin: origin,
      // Custom props consumed by glassSurface.css
      ["--glass-surface-tint" as string]: tint,
    };
    return (
      <div
        ref={ref}
        className={`glass-surface${lightMode ? " glass-surface--light" : ""}${className ? ` ${className}` : ""}`}
        style={surfaceStyle}
        {...rest}
      >
        {children}
      </div>
    );
  },
);
