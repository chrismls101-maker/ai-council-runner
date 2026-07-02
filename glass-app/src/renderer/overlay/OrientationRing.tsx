import { useEffect, useRef, useState } from "react";
import {
  fractionBoundsToScreenPx,
  type OrientationRegion,
} from "../../shared/liveOrientationTypes.ts";
import "./OrientationRing.css";

/** Ring travel duration between regions (matches CSS). */
export const RING_TRAVEL_MS = 500;

/**
 * A single persistent ring that *travels* between regions — the eye follows
 * continuous motion; it never blinks out and reappears. A stroked rounded
 * rect traces itself in on arrival, then settles into a slow, quiet pulse.
 * An attention scrim (with a cut-out at the ring) directs the eye without
 * dimming the app; the scrim is off while the ring is in transit.
 */
export function OrientationRing({
  region,
  visible,
  fadingOut,
  viewportWidth,
  viewportHeight,
}: {
  region: OrientationRegion;
  visible: boolean;
  fadingOut: boolean;
  viewportWidth: number;
  viewportHeight: number;
}): JSX.Element | null {
  const [traveling, setTraveling] = useState(false);
  const lastRegionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastRegionIdRef.current != null && lastRegionIdRef.current !== region.id) {
      setTraveling(true);
      const t = setTimeout(() => setTraveling(false), RING_TRAVEL_MS);
      lastRegionIdRef.current = region.id;
      return () => clearTimeout(t);
    }
    lastRegionIdRef.current = region.id;
  }, [region.id]);

  if (!visible) return null;

  const display = { x: 0, y: 0, width: viewportWidth, height: viewportHeight };
  const px = fractionBoundsToScreenPx(region.bounds, display);
  const bounds = {
    left: px.x,
    top: px.y,
    width: Math.max(8, px.width),
    height: Math.max(8, px.height),
  };

  return (
    <>
      <div
        className={`orientation-scrim${
          !traveling && !fadingOut ? " orientation-scrim--on" : ""
        }`}
        style={bounds}
        aria-hidden="true"
      />
      <div
        className={`orientation-ring${fadingOut ? " orientation-ring--fade-out" : ""}${
          traveling ? " orientation-ring--traveling" : ""
        }`}
        style={bounds}
        data-testid="glass-orientation-ring"
        aria-hidden="true"
      >
        <svg className="orientation-ring__svg" width="100%" height="100%" aria-hidden="true">
          <rect
            key={region.id}
            className="orientation-ring__rect"
            rx="8"
            pathLength={100}
          />
        </svg>
      </div>
    </>
  );
}
