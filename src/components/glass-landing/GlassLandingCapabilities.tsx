import { useCallback, useEffect, useRef, useState, type CSSProperties, type JSX } from "react";
import { useScrollReveal } from "./useScrollReveal";

const CAPABILITIES = [
  {
    id: "lens",
    label: "Lens",
    title: "Reads every window",
    copy: "Fused context from Safari, Notion, Terminal, and Figma — without copy-paste or tab switching.",
    tone: "lens",
  },
  {
    id: "aletheia",
    label: "Aletheia",
    title: "Voice across your Mac",
    copy: "Speak once. Glass routes intent through the right agent, app, and terminal — hands on keyboard optional.",
    tone: "voice",
  },
  {
    id: "council",
    label: "Council",
    title: "Agents orchestrated",
    copy: "Coder, researcher, and operator agents reason together above your desktop — not in a single chat thread.",
    tone: "council",
  },
  {
    id: "memory",
    label: "Memory",
    title: "Intelligence that compounds",
    copy: "Session context, notes, and decisions carry forward across apps. Yours to keep — or delete completely.",
    tone: "memory",
  },
  {
    id: "listen",
    label: "Listen",
    title: "Meetings & video",
    copy: "Capture what you allow. Speaker labels, action items, and follow-ups — surfaced while you stay in flow.",
    tone: "listen",
  },
] as const;

const LWI_DRAFT =
  "hey quick update for the board — we kinda need glass out before thurs demo and the aletheia voice has to feel amazing or nobody gets it. also can someone fix the pricing slide??";

const LWI_REWRITE =
  "Board update: ship Glass before Thursday's demo. Aletheia's voice is the moment people understand the product — prioritize polish there. Please refresh the pricing slide before we send.";

const LWI_TYPE_MS = 24;
const LWI_PAUSE_MS = 880;

type LwiPhase = "idle" | "typing" | "pause" | "rewrite" | "done";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function LiveWritingMock(): JSX.Element {
  const { ref, visible } = useScrollReveal<HTMLDivElement>({ threshold: 0.32, rootMargin: "-4% 0px" });
  const [run, setRun] = useState(0);
  const [phase, setPhase] = useState<LwiPhase>("idle");
  const [draft, setDraft] = useState("");
  const timersRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  }, []);

  const startRun = useCallback(() => {
    clearTimers();
    if (prefersReducedMotion()) {
      setDraft(LWI_DRAFT);
      setPhase("done");
      return;
    }

    setDraft("");
    setPhase("typing");
    let index = 0;

    const typeStep = () => {
      index += 1;
      setDraft(LWI_DRAFT.slice(0, index));
      if (index >= LWI_DRAFT.length) {
        setPhase("pause");
        schedule(() => {
          setPhase("rewrite");
          schedule(() => setPhase("done"), 520);
        }, LWI_PAUSE_MS);
        return;
      }
      schedule(typeStep, LWI_TYPE_MS);
    };

    schedule(typeStep, LWI_TYPE_MS);
  }, [clearTimers, schedule]);

  useEffect(() => {
    if (!visible) return;
    startRun();
    return clearTimers;
  }, [visible, run, startRun, clearTimers]);

  const replay = useCallback(() => {
    setRun((value) => value + 1);
  }, []);

  const showCard = phase === "rewrite" || phase === "done";
  const showCaret = phase === "typing" || phase === "pause";
  const isTyping = phase === "typing";
  const isPause = phase === "pause";

  return (
    <div
      ref={ref}
      className={[
        "gl-body-lwi-mock",
        isTyping ? "gl-body-lwi-mock--typing" : "",
        isPause ? "gl-body-lwi-mock--pause" : "",
        showCard ? "gl-body-lwi-mock--card-visible" : "",
        phase === "done" ? "gl-body-lwi-mock--done" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-lwi-phase={phase}
    >
      <div className="gl-body-lwi-mock__app">
        <div className="gl-body-lwi-mock__app-chrome">
          <span />
          <span />
          <span />
          <em>Notes — Launch brief</em>
          {isPause ? (
            <span className="gl-body-lwi-mock__chrome-status">Glass noticed a pause</span>
          ) : null}
        </div>
        <div className="gl-body-lwi-mock__field">
          <span className="gl-body-lwi-mock__field-label">Your draft</span>
          <p className="gl-body-lwi-mock__draft">
            {draft}
            {showCaret ? <span className="gl-body-lwi-mock__caret" aria-hidden="true" /> : null}
          </p>
        </div>
      </div>

      <div className="gl-body-lwi-mock__card" aria-hidden={!showCard}>
        <div className="gl-body-lwi-mock__card-head">
          <span className="gl-body-lwi-mock__pill">
            <span className="gl-body-lwi-mock__pill-dot" />
            Suggested rewrite
          </span>
          <span className="gl-body-lwi-mock__meta">41 → 28 words</span>
        </div>
        <p className="gl-body-lwi-mock__rewrite">{LWI_REWRITE}</p>
        <div className="gl-body-lwi-mock__actions">
          <span className="gl-body-lwi-mock__action gl-body-lwi-mock__action--primary">Accept</span>
          <span className="gl-body-lwi-mock__action">Dismiss</span>
        </div>
      </div>

      {phase === "done" ? (
        <button type="button" className="gl-body-lwi-mock__replay" onClick={replay}>
          Replay demo
        </button>
      ) : null}
    </div>
  );
}

export default function GlassLandingCapabilities(): JSX.Element {
  return (
    <div className="gl-body-capabilities">
      <article className="gl-body-spotlight gl-reveal-child">
        <div className="gl-body-spotlight__copy">
          <span className="gl-body-spotlight__badge">
            <span className="gl-body-spotlight__badge-dot" />
            New
          </span>
          <h3 className="gl-body-spotlight__title">Live Writing Intelligence</h3>
          <p className="gl-body-spotlight__lead">
            Glass watches the field you&apos;re typing in — Mail, Slack, Notion, any app — and surfaces a
            sharper rewrite the moment you pause. No sidebar. No paste. Intelligence at the cursor.
          </p>
          <ul className="gl-body-spotlight__points">
            <li>Detects email, messages, and AI prompts by context</li>
            <li>Rewrite card floats above your text — accept or dismiss in one tap</li>
            <li>You enable it. Glass never writes without your permission.</li>
          </ul>
        </div>
        <div className="gl-body-spotlight__visual">
          <LiveWritingMock />
        </div>
        <span className="gl-body-spotlight__glow" aria-hidden="true" />
      </article>

      <div className="gl-body-cap-grid">
        {CAPABILITIES.map((cap, i) => (
          <article
            key={cap.id}
            className={`gl-body-cap-card gl-body-cap-card--${cap.tone} gl-reveal-child`}
            style={{ "--stagger": i + 1 } as CSSProperties}
          >
            <span className="gl-body-cap-card__glyph" aria-hidden="true" />
            <span className="gl-body-cap-card__label">{cap.label}</span>
            <h4 className="gl-body-cap-card__title">{cap.title}</h4>
            <p className="gl-body-cap-card__copy">{cap.copy}</p>
            <span className="gl-body-cap-card__rim" aria-hidden="true" />
          </article>
        ))}
      </div>
    </div>
  );
}
