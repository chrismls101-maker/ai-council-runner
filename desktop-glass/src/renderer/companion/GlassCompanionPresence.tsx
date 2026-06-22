import { useEffect, useMemo, useState } from "react";
import type {
  CompanionGuidancePayload,
  GuidanceManifestation,
  ScreenRect,
} from "../../shared/companionGuidance.ts";
import {
  findUiMark,
  initialManifestations,
  resolveMarkToScreenRect,
} from "../../shared/companionGuidance.ts";
import { send } from "../useGlassState.ts";
import { ArrowLayer } from "./ArrowLayer.tsx";
import { MagnifierLens } from "./MagnifierLens.tsx";
import { PathAnimation } from "./PathAnimation.tsx";
import { SketchLayer } from "./SketchLayer.tsx";
import "./GlassCompanionPresence.css";

interface GlassCompanionPresenceProps {
  presence: CompanionGuidancePayload | null | undefined;
  companionActive: boolean;
  activeManifestations?: GuidanceManifestation[] | null;
}

function GhostCursor({ rect }: { rect: ScreenRect }): JSX.Element {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return (
    <div
      className="companion-presence__ghost-cursor"
      style={{ left: `${cx}px`, top: `${cy}px` }}
      data-testid="companion-ghost-cursor"
      aria-hidden="true"
    />
  );
}

function TraceOutline({ rect }: { rect: ScreenRect }): JSX.Element {
  const pad = 4;
  const x = rect.left - pad;
  const y = rect.top - pad;
  const w = rect.width + pad * 2;
  const h = rect.height + pad * 2;
  const perimeter = 2 * (w + h);
  return (
    <svg
      className="companion-presence__trace"
      style={{ left: 0, top: 0, width: "100%", height: "100%" }}
      aria-hidden="true"
    >
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={8}
        className="companion-presence__trace-rect"
        strokeDasharray={perimeter}
        strokeDashoffset={perimeter}
      />
    </svg>
  );
}

function resolveMarkRect(
  presence: CompanionGuidancePayload,
  markId: string | undefined,
  viewport: { width: number; height: number },
): ScreenRect | null {
  if (!markId) return null;
  const mark = findUiMark(presence.uiMap, markId);
  if (!mark) return null;
  return resolveMarkToScreenRect(mark, viewport);
}

function ManifestationLayer({
  manifestation,
  presence,
  viewport,
}: {
  manifestation: GuidanceManifestation;
  presence: CompanionGuidancePayload;
  viewport: { width: number; height: number };
}): JSX.Element | null {
  if (manifestation.type === "sketch") {
    if (!manifestation.sketchPaths?.length) return null;
    return <SketchLayer paths={manifestation.sketchPaths} />;
  }

  if (manifestation.type === "path") {
    const from = resolveMarkRect(presence, manifestation.pathFromMarkId, viewport);
    const to = resolveMarkRect(presence, manifestation.pathToMarkId, viewport);
    if (!from || !to) return null;
    return <PathAnimation from={from} to={to} />;
  }

  const rect = resolveMarkRect(presence, manifestation.targetMarkId, viewport);
  if (!rect) return null;

  if (manifestation.type === "cursor") return <GhostCursor rect={rect} />;
  if (manifestation.type === "trace") return <TraceOutline rect={rect} />;

  if (manifestation.type === "arrow") {
    const fromMarkId = manifestation.pathFromMarkId;
    const from =
      resolveMarkRect(presence, fromMarkId, viewport) ??
      ({
        left: Math.max(0, rect.left - 80),
        top: rect.top + rect.height / 2,
        width: 40,
        height: 20,
      } satisfies ScreenRect);
    return <ArrowLayer from={from} to={rect} />;
  }

  if (manifestation.type === "magnifier") {
    const crop = manifestation.targetMarkId
      ? presence.captureCrops?.[manifestation.targetMarkId]
      : undefined;
    return <MagnifierLens rect={rect} cropDataUrl={crop} />;
  }

  const style = {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${Math.max(rect.width, 24)}px`,
    height: `${Math.max(rect.height, 20)}px`,
  };

  if (manifestation.type === "spotlight") {
    return (
      <div
        className="companion-presence__spotlight-hole"
        style={style}
        data-testid={`companion-spotlight-${manifestation.targetMarkId}`}
      />
    );
  }

  const mark = manifestation.targetMarkId
    ? findUiMark(presence.uiMap, manifestation.targetMarkId)
    : undefined;
  const label = manifestation.label ?? mark?.label;
  return (
    <div
      className={`companion-presence__mark companion-presence__mark--${manifestation.type}`}
      style={style}
      data-testid={`companion-mark-${manifestation.targetMarkId ?? manifestation.type}`}
    >
      {label && manifestation.type === "callout" ? (
        <span className="companion-presence__callout">{label}</span>
      ) : null}
    </div>
  );
}

export function GlassCompanionPresence({
  presence,
  companionActive,
  activeManifestations,
}: GlassCompanionPresenceProps): JSX.Element | null {
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [crossfade, setCrossfade] = useState(false);

  useEffect(() => {
    const onResize = (): void => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!presence) return;
    setCrossfade(true);
    const timer = window.setTimeout(() => setCrossfade(false), 500);
    return () => window.clearTimeout(timer);
  }, [
    presence?.guidancePlan.captureId,
    activeManifestations,
    presence?.guidancePlan.manifestations,
  ]);

  const manifestations = useMemo(() => {
    if (!presence) return [];
    if (activeManifestations != null) return activeManifestations;
    return initialManifestations(presence.guidancePlan);
  }, [presence, activeManifestations]);

  if (!companionActive || !presence || manifestations.length === 0) {
    return null;
  }

  return (
    <div
      className={`companion-presence${crossfade ? " companion-presence--crossfade" : ""}`}
      data-testid="glass-companion-presence"
      aria-hidden="true"
    >
      {manifestations.map((m, index) => (
        <ManifestationLayer
          key={`${m.type}-${m.targetMarkId ?? m.pathFromMarkId ?? "sketch"}-${index}`}
          manifestation={m}
          presence={presence}
          viewport={viewport}
        />
      ))}
      <button
        type="button"
        className="companion-presence__dismiss"
        onClick={() => send({ type: "clear-companion-presence" })}
        aria-label="Dismiss Companion highlights"
      >
        ✕
      </button>
    </div>
  );
}
