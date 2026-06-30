import type { CSSProperties, JSX } from "react";

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

function LiveWritingMock(): JSX.Element {
  return (
    <div className="gl-body-lwi-mock" aria-hidden="true">
      <div className="gl-body-lwi-mock__app">
        <div className="gl-body-lwi-mock__app-chrome">
          <span />
          <span />
          <span />
          <em>Notes — Launch brief</em>
        </div>
        <div className="gl-body-lwi-mock__field">
          <p className="gl-body-lwi-mock__draft">
            we need to ship glass before the demo and make sure aletheia voice feels incredible
          </p>
          <span className="gl-body-lwi-mock__caret" />
        </div>
      </div>

      <div className="gl-body-lwi-mock__card">
        <div className="gl-body-lwi-mock__card-head">
          <span className="gl-body-lwi-mock__pill">
            <span className="gl-body-lwi-mock__pill-dot" />
            Live Writing Intelligence
          </span>
          <span className="gl-body-lwi-mock__meta">18 → 24 words</span>
        </div>
        <p className="gl-body-lwi-mock__rewrite">
          We need to ship Glass before the demo — and make sure Aletheia&apos;s voice feels incredible.
        </p>
        <div className="gl-body-lwi-mock__actions">
          <span className="gl-body-lwi-mock__action gl-body-lwi-mock__action--primary">Accept</span>
          <span className="gl-body-lwi-mock__action">Dismiss</span>
        </div>
      </div>
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
