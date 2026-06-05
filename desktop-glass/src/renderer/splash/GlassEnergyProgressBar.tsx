import { useEffect, useState, type CSSProperties } from "react";
import { GLASS_BOOT_DURATION_MS } from "../../shared/bootTiming.ts";
import "./glassEnergyProgressBar.css";

export const DEFAULT_GLASS_ENERGY_DURATION_MS = GLASS_BOOT_DURATION_MS;
export const DEFAULT_GLASS_ENERGY_TARGET_PERCENT = 100;

function bootPercentForElapsed(t: number): number {
  if (t <= 0) return 1;
  if (t >= 1) return 100;
  return Math.min(100, Math.max(1, Math.round(t * 99) + 1));
}

export type GlassEnergyProgressBarProps = {
  /** Boot animation length; fill keyframes use this via CSS variable. */
  durationMs?: number;
  /** Percent shown at end of boot animation (before splash finish). */
  targetPercent?: number;
  showPercentage?: boolean;
  className?: string;
  "aria-label"?: string;
};

/**
 * IIVO Glass HUD energy beam — thin glass rail, plasma fill, lens-flare head.
 */
export function GlassEnergyProgressBar({
  durationMs = DEFAULT_GLASS_ENERGY_DURATION_MS,
  targetPercent = DEFAULT_GLASS_ENERGY_TARGET_PERCENT,
  showPercentage = true,
  className,
  "aria-label": ariaLabel = "Loading",
}: GlassEnergyProgressBarProps): JSX.Element {
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    const start = performance.now();
    let frame = 0;
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / durationMs);
      const pct = bootPercentForElapsed(t);
      setProgress(targetPercent < 100 ? Math.round((pct / 100) * targetPercent) : pct);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [durationMs, targetPercent]);

  const style = {
    "--glass-energy-duration": `${durationMs}ms`,
    "--glass-energy-target": `${targetPercent}%`,
  } as CSSProperties;

  return (
    <div
      className={["glass-energy-progress", className].filter(Boolean).join(" ")}
      style={style}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="glass-energy-progress__rail-wrap">
        <div className="glass-energy-progress__track" aria-hidden="true" />
        <div className="glass-energy-progress__fill">
          <span className="glass-energy-progress__bloom" aria-hidden="true" />
          <span className="glass-energy-progress__beam" aria-hidden="true" />
          <span className="glass-energy-progress__flare-trail" aria-hidden="true" />
          <span className="glass-energy-progress__flare" aria-hidden="true">
            <span className="glass-energy-progress__flare-streak glass-energy-progress__flare-streak--h" />
            <span className="glass-energy-progress__flare-streak glass-energy-progress__flare-streak--v" />
            <span className="glass-energy-progress__flare-core" />
          </span>
        </div>
      </div>
      {showPercentage ? (
        <span className="glass-energy-progress__pct">{progress}%</span>
      ) : null}
    </div>
  );
}
