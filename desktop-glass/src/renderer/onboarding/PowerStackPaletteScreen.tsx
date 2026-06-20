// PowerStackPaletteScreen
// -----------------------
// Full-screen reveal shown after Builder persona is confirmed.
// Renders over the Builder.png background with the real Glass overlay
// frame (boot screen corner pips + inset border). The ENTER GLASS
// button completes onboarding — streams dissolve, app launches.

import { useCallback, useEffect, useRef, useState } from "react";
import builderBg from "../assets/builder-bg.png";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";
import { OverlayGlassFrame } from "../shared/OverlayGlassFrame.tsx";
import type { SortingHatCopy } from "../../shared/sortingHatCopy.ts";
import "./PowerStackPaletteScreen.css";

interface PowerStackPaletteProps {
  onEnterGlass: () => void;
  copy: Pick<
    SortingHatCopy,
    | "paletteSubtitle"
    | "paletteTitle"
    | "paletteRevealTitle"
    | "paletteRevealTagline"
    | "paletteEnterGlass"
    | "paletteComingSoon"
  >;
  revealTitle?: string;
  revealTagline?: string;
}

export function PowerStackPaletteScreen({
  onEnterGlass,
  copy,
  revealTitle,
  revealTagline,
}: PowerStackPaletteProps): JSX.Element {
  const [opacity, setOpacity] = useState(0);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Fade in on mount
  useEffect(() => {
    timerRef.current = window.setTimeout(() => setOpacity(1), 40);
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, []);

  const handleEnter = useCallback(() => {
    if (exiting) return;
    setExiting(true);
    setOpacity(0);
    window.setTimeout(onEnterGlass, 900);
  }, [exiting, onEnterGlass]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Enter" || exiting) return;
      event.preventDefault();
      handleEnter();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exiting, handleEnter]);

  useEffect(() => {
    window.glass?.setIgnoreMouse?.(false);
    return () => window.glass?.setIgnoreMouse?.(true);
  }, []);

  return (
    <div
      className="power-stack-palette"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        opacity,
        transition: "opacity 0.85s cubic-bezier(0.2,0.8,0.2,1)",
        pointerEvents: exiting ? "none" : "auto",
      }}
    >
      {/* Builder.png background */}
      <div style={{
        position: "absolute", inset: 0,
        background: `url(${builderBg}) center/cover no-repeat`,
      }} />
      <div style={{
        position: "absolute", inset: 0,
        background: "rgba(1,4,12,0.28)",
      }} />

      <OverlayGlassFrame />

      {/* LEFT PANELS */}
      <PanelStack side="left" />

      {/* RIGHT PANELS */}
      <PanelStack side="right" />

      {/* HEADER */}
      <div style={{
        position: "absolute", top: "2.8vh", left: 0, right: 0,
        zIndex: 15, textAlign: "center", pointerEvents: "none",
        fontFamily: "'Inter', system-ui, sans-serif",
        WebkitFontSmoothing: "antialiased",
      }}>
        <div style={{ fontSize: "clamp(11px,0.95vw,14px)", letterSpacing: "0.44em", textIndent: "0.44em", color: "rgba(210,230,255,0.82)", fontWeight: 300, marginBottom: 4, textShadow: "0 0 30px rgba(56,225,255,0.35)" }}>
          {copy.paletteSubtitle}
        </div>
        <div style={{ fontSize: "clamp(8px,0.65vw,10px)", letterSpacing: "0.24em", textIndent: "0.24em", color: "rgba(56,225,255,0.78)", fontWeight: 400, textTransform: "uppercase", marginBottom: 7, textShadow: "0 0 20px rgba(56,225,255,0.45)" }}>
          {copy.paletteTitle}
        </div>
        <div style={{ fontSize: "clamp(34px,4.8vw,72px)", fontWeight: 200, color: "#eef3ff", letterSpacing: "-0.02em", lineHeight: 1.05, marginBottom: 8, textShadow: "0 0 80px rgba(80,140,255,0.5), 0 0 140px rgba(56,120,255,0.2), 0 2px 40px rgba(0,0,0,0.7)" }}>
          {revealTitle ?? copy.paletteRevealTitle}
        </div>
        <div style={{ fontSize: "clamp(12px,1vw,15px)", fontWeight: 300, color: "rgba(165,205,255,0.72)", letterSpacing: "0.06em", textShadow: "0 0 40px rgba(56,160,255,0.25)" }}>
          {revealTagline ?? copy.paletteRevealTagline}
        </div>
      </div>

      {/* NODES */}
      <Nodes comingSoonLabel={copy.paletteComingSoon} />

      {/* CTA */}
      <div style={{ position: "absolute", bottom: "4vh", left: "50%", transform: "translateX(-50%)", zIndex: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
        <EnterButton onClick={handleEnter} label={copy.paletteEnterGlass} />
        <div style={{ fontSize: 11, color: "rgba(56,225,255,0.36)", fontWeight: 200 }}>∨</div>
      </div>
    </div>
  );
}

// ─── Panel Stack ─────────────────────────────────────────────────────────────

function PanelStack({ side }: { side: "left" | "right" }): JSX.Element {
  const isLeft = side === "left";
  const style: React.CSSProperties = {
    position: "absolute",
    zIndex: 4,
    display: "flex",
    flexDirection: "column",
    gap: "clamp(6px,0.6vh,10px)",
    top: "13vh",
    ...(isLeft
      ? { left: "3.5vw", transform: "perspective(1100px) rotateY(20deg)", transformOrigin: "left center" }
      : { right: "3.5vw", transform: "perspective(1100px) rotateY(-20deg)", transformOrigin: "right center" }),
  };

  return (
    <div style={style}>
      {isLeft ? (
        <>
          <CodePanel />
          <TerminalPanel />
        </>
      ) : (
        <>
          <ArchPanel />
          <NotesPanel />
        </>
      )}
    </div>
  );
}

const panelBase: React.CSSProperties = {
  background: "rgba(2,8,22,0.62)",
  border: "1px solid rgba(56,225,255,0.3)",
  borderRadius: 4,
  overflow: "hidden",
  boxShadow: "0 8px 48px rgba(0,0,0,0.7), 0 0 0 0.5px rgba(56,225,255,0.1), inset 0 1px 0 rgba(56,225,255,0.12)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
};

function PanelTitleBar({ color = "#ff5f57", name }: { color?: string; name: string }): JSX.Element {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 5,
      padding: "clamp(5px,0.55vw,8px) clamp(8px,0.85vw,12px)",
      background: "rgba(2,8,22,0.52)",
      borderBottom: "1px solid rgba(56,225,255,0.18)",
    }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: color, boxShadow: `0 0 4px ${color}80` }} />
      <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: "#ffbd2e", opacity: 0.6 }} />
      <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: "#28c840", opacity: 0.6 }} />
      <span style={{ fontSize: "clamp(7px,0.58vw,9px)", letterSpacing: "0.1em", color: "rgba(140,180,240,0.6)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 300, marginLeft: 4 }}>
        {name}
      </span>
      <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
        {["─", "×"].map(ch => (
          <span key={ch} style={{ width: 12, height: 12, border: "1px solid rgba(56,180,255,0.18)", borderRadius: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, color: "rgba(56,180,255,0.4)" }}>{ch}</span>
        ))}
      </span>
    </div>
  );
}

const CODE_LINES = [
  ["", ""],
  ["class ", "GlassEngine", " {"],
  ["  ", "constructor", "(", "config", ") {"],
  ["    this.", "context", " = new ", "ContextEngine", "(config);"],
  ["    this.", "memory", " = new ", "MemoryLayer", "();"],
  ["    this.", "router", " = new ", "ModelRouter", "();"],
  ["    this.", "output", " = new ", "OutputLayer", "();"],
  ["  }"],
  ["  async ", "run", "(", "input", ") {"],
  ["    const ", "ctx", " = await this.context.", "build", "(input);"],
  ["    const ", "mem", " = await this.memory.", "retrieve", "(ctx);"],
  ["    const ", "route", " = this.router.", "select", "(ctx, mem);"],
  ["    const ", "result", " = await route.", "generate", "(ctx);"],
  ["    return this.output.", "format", "(result, ctx);"],
  ["  }"],
  ["}"],
  [""],
  ["class ", "ContextEngine", " {"],
  ["  async ", "build", "(", "input", ") {"],
  ["    // Aggregate signals, history,"],
  ["    // and intent into unified context"],
  ["    return { input, signals: [], intent: null };"],
  ["  }"],
  ["}"],
  [""],
  ["export default ", "GlassEngine", ";"],
];

function CodePanel(): JSX.Element {
  const kw = "rgba(200,130,255,0.78)";
  const ty = "rgba(80,195,255,0.78)";
  const cm = "rgba(120,140,160,0.5)";
  const vr = "rgba(255,255,255,0.52)";

  return (
    <div style={{ ...panelBase, width: "clamp(240px,21vw,300px)" }}>
      <PanelTitleBar name="glass.core" color="#ff5f57" />
      <div style={{ padding: "clamp(7px,0.75vw,11px) clamp(9px,0.9vw,13px)", fontFamily: "'JetBrains Mono', monospace", fontSize: "clamp(6.5px,0.58vw,9px)", lineHeight: 1.72, color: "rgba(255,255,255,0.52)" }}>
        {CODE_LINES.map((parts, i) => {
          const lineNum = String(i + 1).padStart(2, "0");
          let text = parts.join("");
          const isComment = text.trimStart().startsWith("//");
          const isKw = text.startsWith("class ") || text.startsWith("export");
          return (
            <div key={i} style={{ display: "flex" }}>
              <span style={{ width: "clamp(16px,1.5vw,22px)", color: "rgba(255,255,255,0.14)", textAlign: "right", marginRight: "clamp(8px,0.8vw,12px)", userSelect: "none", flexShrink: 0 }}>{lineNum}</span>
              <span style={{ color: isComment ? cm : isKw ? kw : vr }}>
                {text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const TERM_LINES = [
  { ts: "[00:00:000]", msg: "Glass v2.7.1 initializing...", ok: false },
  { ts: "[00:00:043]", msg: "Core system check ... ", ok: true },
  { ts: "[00:00:117]", msg: "Loading Context Engine ... ", ok: true },
  { ts: "[00:00:201]", msg: "Initializing Memory Layer ... ", ok: true },
  { ts: "[00:00:289]", msg: "Starting Model Router ... ", ok: true },
  { ts: "[00:00:341]", msg: "Starting Output Layer ... ", ok: true },
  { ts: "[00:00:412]", msg: "Connectivity matrix online", ok: false },
  { ts: "[00:00:487]", msg: "Neural fabric synced", ok: false },
  { ts: "[00:00:578]", msg: "Knowledge graph attached", ok: false },
  { ts: "[00:00:643]", msg: "Safety protocols active", ok: false },
  { ts: "[00:00:701]", msg: "System ready.", ok: true },
];

function TerminalPanel(): JSX.Element {
  return (
    <div style={{ ...panelBase, width: "clamp(220px,19vw,275px)" }}>
      <PanelTitleBar name="glass.terminal" color="rgba(0,210,90,0.8)" />
      <div style={{ padding: "clamp(7px,0.75vw,11px) clamp(9px,0.9vw,13px)", fontFamily: "'JetBrains Mono', monospace", fontSize: "clamp(6px,0.55vw,8.5px)", lineHeight: 1.8 }}>
        {TERM_LINES.map(({ ts, msg, ok }, i) => (
          <div key={i}>
            <span style={{ color: "rgba(255,255,255,0.22)" }}>{ts}</span>
            {" "}
            <span style={{ color: ok && i === TERM_LINES.length - 1 ? "rgba(0,210,110,0.7)" : "rgba(255,255,255,0.38)" }}>
              {msg}
            </span>
            {ok && i < TERM_LINES.length - 1 && <span style={{ color: "rgba(0,210,110,0.7)" }}>OK</span>}
          </div>
        ))}
        <div style={{ color: "rgba(0,210,110,0.55)", marginTop: 4 }}>
          glass@core:~$ <span style={{ animation: "psp-blink 1.1s step-end infinite" }}>▋</span>
        </div>
      </div>
    </div>
  );
}

function ArchPanel(): JSX.Element {
  const box: React.CSSProperties = {
    flex: 1, padding: "clamp(4px,0.4vw,6px)",
    background: "rgba(2,8,22,0.55)", border: "1px solid rgba(56,225,255,0.2)", borderRadius: 2,
  };
  const boxName: React.CSSProperties = { fontSize: "clamp(5.5px,0.5vw,7.5px)", letterSpacing: "0.1em", color: "rgba(56,180,255,0.75)", textTransform: "uppercase", fontWeight: 500, marginBottom: 2 };
  const boxSub: React.CSSProperties = { fontSize: "clamp(5px,0.44vw,7px)", color: "rgba(255,255,255,0.28)", lineHeight: 1.4 };
  const arrow: React.CSSProperties = { textAlign: "center", color: "rgba(56,180,255,0.3)", fontSize: "clamp(8px,0.7vw,11px)", margin: "clamp(1px,0.15vw,2px) 0" };

  return (
    <div style={{ ...panelBase, width: "clamp(240px,21vw,300px)" }}>
      <PanelTitleBar name="glass.architecture" color="#ff5f57" />
      <div style={{ padding: "clamp(7px,0.75vw,11px) clamp(9px,0.9vw,13px)", fontSize: "clamp(6px,0.56vw,8.5px)" }}>
        <div style={{ fontSize: "clamp(6px,0.5vw,8px)", letterSpacing: "0.16em", color: "rgba(56,180,255,0.5)", textAlign: "center", marginBottom: "clamp(5px,0.5vw,8px)", textTransform: "uppercase" }}>Input Interface</div>
        <div style={{ display: "flex", gap: "clamp(4px,0.4vw,6px)", marginBottom: "clamp(3px,0.35vw,5px)" }}>
          {["💬","📄","🖼","🎙"].map(ic => (
            <div key={ic} style={{ flex: 1, padding: 3, background: "rgba(2,8,22,0.55)", border: "1px solid rgba(56,225,255,0.2)", borderRadius: 2, textAlign: "center", fontSize: "clamp(8px,0.7vw,11px)" }}>{ic}</div>
          ))}
        </div>
        <div style={arrow}>↓</div>
        <div style={{ display: "flex", gap: "clamp(4px,0.4vw,6px)", marginBottom: "clamp(3px,0.35vw,5px)" }}>
          <div style={box}><div style={boxName}>Context Engine</div><div style={boxSub}>Understand · Normalize · Enrich</div></div>
          <div style={box}><div style={boxName}>Memory Layer</div><div style={boxSub}>Vector DB<br/>Graph Store</div></div>
        </div>
        <div style={arrow}>↓</div>
        <div style={{ display: "flex", gap: "clamp(4px,0.4vw,6px)", marginBottom: "clamp(3px,0.35vw,5px)" }}>
          <div style={{ ...box, flex: 1 }}><div style={boxName}>Model Router</div><div style={boxSub}>Select · Rank · Orchestrate</div></div>
        </div>
        <div style={arrow}>↓</div>
        <div style={{ display: "flex", gap: "clamp(4px,0.4vw,6px)", marginBottom: "clamp(3px,0.35vw,5px)" }}>
          <div style={{ ...box, flex: 1 }}><div style={boxName}>Output Layer</div><div style={boxSub}>Format · Adapt · Deliver</div></div>
        </div>
        <div style={arrow}>↓</div>
        <div style={{ display: "flex" }}>
          <div style={{ ...box, flex: 1, background: "rgba(2,8,22,0.72)", borderColor: "rgba(56,225,255,0.3)" }}>
            <div style={{ ...boxName, color: "rgba(56,180,255,0.85)" }}>Tools &amp; Integrations</div>
            <div style={boxSub}>APIs · Plugins · Data Sources</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const NOTES = [
  { title: "Context is everything", body: "Multi-signal fusion creates aligned, actionable understanding." },
  { title: "Memory is infinite", body: "Persistent, updatable, and semantically linked across time." },
  { title: "Routing is dynamic", body: "Models selected in real-time based on fit, cost, performance." },
  { title: "Output is adaptive", body: "Structured, concise, tailored to the user and channel." },
  { title: "System is self-optimizing", body: "Continuous evaluation and feedback improve every response." },
];

function NotesPanel(): JSX.Element {
  return (
    <div style={{ ...panelBase, width: "clamp(220px,19vw,275px)" }}>
      <PanelTitleBar name="glass.notes" color="rgba(185,100,255,0.8)" />
      <div style={{ padding: "clamp(7px,0.75vw,11px) clamp(9px,0.9vw,13px)", fontSize: "clamp(6px,0.56vw,8.5px)" }}>
        {NOTES.map(({ title, body }) => (
          <div key={title} style={{ marginBottom: "clamp(4px,0.4vw,6px)" }}>
            <span style={{ color: "rgba(56,180,255,0.55)", marginRight: 4 }}>•</span>
            <span style={{ color: "rgba(200,220,255,0.7)", fontWeight: 400 }}>{title}</span>
            <div style={{ color: "rgba(180,200,240,0.32)", lineHeight: 1.5, fontWeight: 300, marginTop: 1 }}>{body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Nodes ───────────────────────────────────────────────────────────────────

const orbBase: React.CSSProperties = {
  flexShrink: 0,
  borderRadius: "50%",
  background: "rgba(2,8,22,0.62)",
  border: "1px solid rgba(56,225,255,0.3)",
  display: "flex", alignItems: "center", justifyContent: "center",
  position: "relative",
  boxShadow: "0 0 0 1px rgba(56,225,255,0.1), 0 0 22px rgba(18,65,200,0.28), 0 0 50px rgba(18,65,200,0.1), 0 10px 28px rgba(0,0,0,0.55), inset 0 0 22px rgba(56,225,255,0.08), inset 0 1px 0 rgba(188,230,255,0.12)",
};
const orbSize = "clamp(52px,5.6vw,82px)";

function Orb({ icon, locked = false }: { icon: string; locked?: boolean }): JSX.Element {
  return (
    <div style={{
      ...orbBase,
      width: locked ? "clamp(44px,4.8vw,68px)" : orbSize,
      height: locked ? "clamp(44px,4.8vw,68px)" : orbSize,
      ...(locked ? { borderColor: "rgba(56,225,255,0.3)", background: "rgba(2,8,22,0.62)", boxShadow: "0 5px 18px rgba(0,0,0,0.45), inset 0 0 16px rgba(56,225,255,0.06)" } : {}),
    }}>
      <span style={{ fontSize: locked ? "clamp(15px,1.6vw,22px)" : "clamp(18px,1.9vw,27px)", color: locked ? "rgba(255,255,255,0.28)" : "rgba(168,212,255,0.95)", textShadow: locked ? "none" : "0 0 14px rgba(100,180,255,0.7)" }}>
        {icon}
      </span>
    </div>
  );
}

const DOT_COLORS: Record<string, string> = { green: "#00dc6e", blue: "#30c0ff", purple: "#b662ff" };

function StatusDot({ color }: { color: string }): JSX.Element {
  const c = DOT_COLORS[color];
  return <span style={{ width: 5, height: 5, borderRadius: "50%", flexShrink: 0, background: c, boxShadow: `0 0 7px ${c}` }} />;
}

function NodeLabel({ name, desc, status, statusColor, reverse = false }: {
  name: string; desc: string; status: string; statusColor: string; reverse?: boolean;
}): JSX.Element {
  return (
    <div style={{ textAlign: reverse ? "right" : "left", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ fontSize: "clamp(8.5px,0.74vw,11px)", letterSpacing: "0.16em", color: "rgba(218,232,255,0.95)", fontWeight: 500, textTransform: "uppercase", lineHeight: 1.2 }}>{name}</div>
      <div style={{ fontSize: "clamp(7.5px,0.63vw,10px)", color: "rgba(148,176,228,0.42)", lineHeight: 1.5, margin: "3px 0 4px", fontWeight: 300 }}>{desc}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: reverse ? "flex-end" : "flex-start" }}>
        <StatusDot color={statusColor} />
        <span style={{ fontSize: "clamp(7.5px,0.6vw,9.5px)", fontWeight: 300, color: DOT_COLORS[statusColor] + "d0" }}>{status}</span>
      </div>
    </div>
  );
}

function Nodes({ comingSoonLabel }: { comingSoonLabel: string }): JSX.Element {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 10, pointerEvents: "none" }}>
      {/* LEFT */}
      {[
        { left: "21vw", top: "26vh", icon: "⌨", name: "Terminal Feed", desc: "Live system output", status: "Streaming", color: "green" },
        { left: "18vw", top: "46vh", icon: "</>", name: "Code Intelligence", desc: "Understand. Predict. Elevate.", status: "Active", color: "green" },
        { left: "21vw", top: "64vh", icon: "◎", name: "Debug Radar", desc: "Find issues before they surface.", status: "Monitoring", color: "green" },
      ].map(({ left, top, icon, name, desc, status, color }) => (
        <div key={name} style={{ position: "absolute", left, top, display: "flex", alignItems: "center", gap: "clamp(10px,1vw,15px)" }}>
          <Orb icon={icon} />
          <NodeLabel name={name} desc={desc} status={status} statusColor={color} />
        </div>
      ))}

      {/* RIGHT */}
      {[
        { right: "21vw", top: "26vh", icon: "🌐", name: "Browser Context", desc: "Live context across tabs and docs.", status: "Synced", color: "blue" },
        { right: "18vw", top: "46vh", icon: "⚙", name: "System Memory", desc: "Recall. Reference. Respond.", status: "Indexed", color: "purple" },
      ].map(({ right, top, icon, name, desc, status, color }) => (
        <div key={name} style={{ position: "absolute", right, top, display: "flex", flexDirection: "row-reverse", alignItems: "center", gap: "clamp(10px,1vw,15px)" }}>
          <Orb icon={icon} />
          <NodeLabel name={name} desc={desc} status={status} statusColor={color} reverse />
        </div>
      ))}

      {/* LOCKED — bottom, vertical stacks side by side */}
      <div style={{ position: "absolute", right: "22vw", top: "67vh", display: "flex", gap: "clamp(16px,2vw,30px)" }}>
        {[
          { icon: "🔒", name: "Meeting Intelligence", opacity: 0.70 },
          { icon: "🔒", name: "Deployment Ops", opacity: 0.62 },
        ].map(({ icon, name, opacity }) => (
          <div key={name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, opacity }}>
            <Orb icon={icon} locked />
            <div style={{ textAlign: "center", fontFamily: "'Inter', system-ui, sans-serif" }}>
              <div style={{ fontSize: "clamp(7px,0.62vw,9.5px)", letterSpacing: "0.16em", color: "rgba(255,255,255,0.2)", fontWeight: 500, textTransform: "uppercase" }}>{name}</div>
              <div style={{ fontSize: "clamp(6.5px,0.55vw,8.5px)", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.16)", marginTop: 2 }}>{comingSoonLabel}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Enter Glass Button ───────────────────────────────────────────────────────

function EnterButton({ onClick, label }: { onClick: () => void; label: string }): JSX.Element {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      data-onboarding-interactive=""
      onClick={onClick}
      onPointerDown={ensureOverlayInteractive}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: "clamp(210px,18.5vw,285px)", height: "clamp(40px,3.3vw,52px)",
        background: hover
          ? "rgba(56,225,255,0.06)"
          : "rgba(5,12,28,0.22)",
        border: `1px solid ${hover ? "rgba(56,225,255,0.65)" : "rgba(56,225,255,0.38)"}`,
        color: hover ? "rgba(220,245,255,1)" : "rgba(188,230,255,0.9)",
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: "clamp(8.5px,0.7vw,10.5px)", letterSpacing: "0.38em", textIndent: "0.38em",
        fontWeight: 300, textTransform: "uppercase", cursor: "pointer",
        backdropFilter: "blur(24px) saturate(160%)",
        WebkitBackdropFilter: "blur(24px) saturate(160%)",
        transition: "background 0.22s, border-color 0.22s, color 0.22s, box-shadow 0.22s",
        borderRadius: 0,
        boxShadow: hover
          ? "0 0 28px rgba(56,225,255,0.18), inset 0 1px 0 rgba(255,255,255,0.1)"
          : "0 0 16px rgba(56,225,255,0.08), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      {/* bracket corners */}
      {[
        { top: -1, left: -1, borderWidth: "2px 0 0 2px" },
        { top: -1, right: -1, borderWidth: "2px 2px 0 0" },
        { bottom: -1, left: -1, borderWidth: "0 0 2px 2px" },
        { bottom: -1, right: -1, borderWidth: "0 2px 2px 0" },
      ].map((s, i) => (
        <span key={i} className="psp-enter-bracket" style={s} />
      ))}
      {label}
    </button>
  );
}
