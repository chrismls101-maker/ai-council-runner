// PowerStackTab
// -------------
// Builder-only panel tab. Full-frame video loop (Builder white.mp4) with the
// five active node orbs overlaid at the same positions used in the reveal screen.
// Video is 5s; we seek back to 0 at 4s so it loops on the punchy part.

import { useEffect, useRef } from "react";
import builderVideo from "../assets/builder-power-stack.mp4";

// ─── Orb overlay positions (% of panel container) ────────────────────────────
// Mirrors the palette screen layout scaled into the panel frame.

interface OrbDef {
  icon: string;
  label: string;
  left?: string;
  right?: string;
  top: string;
  locked?: boolean;
}

const ORBS: OrbDef[] = [
  // Left column
  { icon: "⌨", label: "Terminal Feed",      left: "10%",  top: "22%" },
  { icon: "</>",label: "Code Intelligence", left: "6%",   top: "44%" },
  { icon: "◎",  label: "Debug Radar",       left: "10%",  top: "66%" },
  // Right column
  { icon: "🌐", label: "Browser Context",   right: "10%", top: "22%" },
  { icon: "⚙",  label: "System Memory",     right: "6%",  top: "44%" },
  // Locked bottom — side by side centered
  { icon: "🔒", label: "Meeting Intel",     left: "32%",  top: "78%", locked: true },
  { icon: "🔒", label: "Deploy Ops",        right: "32%", top: "78%", locked: true },
];

export function PowerStackTab(): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Loop video at 4 seconds (not 5)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      if (v.currentTime >= 4) {
        v.currentTime = 0;
      }
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, []);

  return (
    <div style={{
      position: "relative",
      width: "100%",
      height: "100%",
      overflow: "hidden",
      background: "#000",
    }}>
      {/* Full-frame looping video */}
      <video
        ref={videoRef}
        src={builderVideo}
        autoPlay
        loop
        muted
        playsInline
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />

      {/* Slight dark vignette so orbs read cleanly */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 70% 70% at 50% 50%, rgba(0,0,0,0.05), rgba(0,0,0,0.38))",
      }} />

      {/* Orb overlays */}
      {ORBS.map(({ icon, label, left, right, top, locked }) => (
        <div
          key={label}
          style={{
            position: "absolute",
            left, right, top,
            transform: "translate(0, -50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 5,
            pointerEvents: "none",
            opacity: locked ? 0.38 : 1,
          }}
        >
          {/* Orb — command bar inner: rgba(2,8,22,0.62) + rgba(56,225,255,0.3) */}
          <div style={{
            width: "clamp(36px,10%,48px)",
            height: "clamp(36px,10%,48px)",
            borderRadius: "50%",
            background: "rgba(2,8,22,0.62)",
            border: "1px solid rgba(56,225,255,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: locked
              ? "0 5px 18px rgba(0,0,0,0.45), inset 0 0 16px rgba(56,225,255,0.06)"
              : "0 0 0 1px rgba(56,225,255,0.1), 0 0 22px rgba(18,65,200,0.28), inset 0 0 22px rgba(56,225,255,0.08), inset 0 1px 0 rgba(188,230,255,0.12)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}>
            <span style={{
              fontSize: "clamp(13px,3.5%,17px)",
              color: locked ? "rgba(255,255,255,0.28)" : "rgba(168,212,255,0.95)",
              textShadow: locked ? "none" : "0 0 10px rgba(100,180,255,0.7)",
            }}>
              {icon}
            </span>
          </div>
          {/* Label */}
          <span style={{
            fontSize: "clamp(6px,1.8%,8px)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: locked ? "rgba(255,255,255,0.18)" : "rgba(210,230,255,0.8)",
            fontFamily: "'Inter', system-ui, sans-serif",
            fontWeight: 500,
            textAlign: "center",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
          }}>
            {label}
          </span>
        </div>
      ))}

      {/* POWER STACK label — top of panel */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "10px 0 8px",
        background: "linear-gradient(to bottom, rgba(2,8,22,0.72), transparent)",
        pointerEvents: "none",
      }}>
        <span style={{
          fontSize: "clamp(7px,1.9%,9px)",
          letterSpacing: "0.36em", textIndent: "0.36em",
          color: "rgba(56,225,255,0.65)",
          fontFamily: "'Inter', system-ui, sans-serif",
          fontWeight: 500,
          textTransform: "uppercase",
        }}>
          POWER STACK
        </span>
      </div>
    </div>
  );
}
