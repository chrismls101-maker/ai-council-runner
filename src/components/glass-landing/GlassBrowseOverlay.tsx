import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type JSX,
  type KeyboardEvent,
} from "react";
import { useGlassBrowse } from "./glassBrowseMode";
import GlassIntroAgentsPanel from "./GlassIntroAgentsPanel";
import GlassIntroIdeMock from "./GlassIntroIdeMock";
import { INTRO_COMMAND_DEMO, INTRO_COMMAND_RESPONSE, useGlassCinematicIntro } from "./glassCinematicIntro";
import {
  detectGlassBrowseMobilePlatform,
  isGlassBrowseMobile,
  type GlassBrowseMobilePlatform,
} from "./glassBrowseDevice";
import {
  formatGlassBrowseSocialProof,
  useGlassBrowseSocialProof,
} from "../../hooks/useGlassBrowseSocialProof";

const TRY_COMMANDS = ["agents", "cross-app", "memory"] as const;

const STRIP_LEFT = [
  { icon: "◈", label: "Agents", kind: "agents" },
  { icon: "▦", label: "Storage", kind: "storage" },
] as const;

const RAIL_ACTIONS = [
  { icon: "◫", label: "Agents", active: false },
  { icon: "▦", label: "Storage", active: false },
  { icon: "◎", label: "Memory", active: false },
] as const;

function MicIcon(): JSX.Element {
  return (
    <svg className="glass-browse__mic-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"
      />
    </svg>
  );
}

function SendIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 4l7 7-7 7v-4H5v-6h7V4z" />
    </svg>
  );
}

function MobileStatusIcons(): JSX.Element {
  return (
    <span className="glass-browse__mobile-status-icons" aria-hidden="true">
      <span className="glass-browse__mobile-signal">
        <i /><i /><i /><i />
      </span>
      <span className="glass-browse__mobile-wifi" />
      <span className="glass-browse__mobile-battery" />
    </span>
  );
}

function MobileChrome({
  profile,
  platform,
}: {
  profile: "phone" | "tablet";
  platform: GlassBrowseMobilePlatform;
}): JSX.Element {
  return (
    <div className={`glass-browse__mobile-chrome glass-browse__mobile-chrome--${platform}`} aria-hidden="true">
      <div className={`glass-browse__mobile-status glass-browse__mobile-status--${profile}`}>
        <span className="glass-browse__mobile-time">9:41</span>
        {profile === "phone" ? <span className="glass-browse__mobile-island" /> : null}
        <MobileStatusIcons />
      </div>
      <div className="glass-browse__mobile-home-indicator" />
    </div>
  );
}

export default function GlassBrowseOverlay(): JSX.Element | null {
  const {
    active,
    exiting,
    deviceProfile,
    hint,
    agentsPanelOpen,
    demoResponse,
    exit,
    setAgentsPanelOpen,
    submitDemoAsk,
    clearDemoResponse,
  } = useGlassBrowse();

  const [input, setInput] = useState("");
  const [listening, setListening] = useState(true);
  const [choreoReady, setChoreoReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { entered: socialEntered } = useGlassBrowseSocialProof();
  const socialLabel = formatGlassBrowseSocialProof(socialEntered);
  const intro = useGlassCinematicIntro();
  const introCommandTyping = intro.enabled && !intro.complete && intro.phase === "command-demo";
  const introCommandResponse = intro.enabled && !intro.complete && intro.phase === "command-response";
  const introCommandActive = introCommandTyping || introCommandResponse;
  const introAgentsStripActive =
    intro.enabled &&
    !intro.complete &&
    (intro.phase === "open-agents" ||
      intro.phase === "cursor-coder" ||
      intro.phase === "coder-click" ||
      intro.phase === "open-ide");
  const introAgentsPhases =
    intro.enabled &&
    !intro.complete &&
    (intro.phase === "open-agents" || intro.phase === "cursor-coder" || intro.phase === "coder-click");
  const commandInputValue = introCommandTyping
    ? intro.introCommandText
    : introCommandResponse && intro.introCommandText
      ? intro.introCommandText
      : introCommandResponse
        ? INTRO_COMMAND_DEMO
        : input;

  const overlayMounted = active || exiting;

  useEffect(() => {
    if (!active || exiting) {
      setChoreoReady(false);
      return;
    }
    setChoreoReady(false);
    let innerRaf = 0;
    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(() => setChoreoReady(true));
    });
    return () => {
      cancelAnimationFrame(outerRaf);
      if (innerRaf) cancelAnimationFrame(innerRaf);
    };
  }, [active, exiting]);

  useEffect(() => {
    if (!overlayMounted) {
      setInput("");
      setListening(true);
      clearDemoResponse();
    }
  }, [overlayMounted, clearDemoResponse]);

  const handleSubmit = useCallback((): void => {
    submitDemoAsk(input);
    setInput("");
  }, [input, submitDemoAsk]);

  const onFormSubmit = (event: FormEvent): void => {
    event.preventDefault();
    handleSubmit();
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSubmit();
    }
  };

  if (!overlayMounted) return null;

  const isMobile = isGlassBrowseMobile(deviceProfile);
  const mobilePlatform = detectGlassBrowseMobilePlatform();
  const choreoPhase = exiting ? "exiting" : choreoReady ? "ready" : "booting";

  return (
    <div
      className={[
        "glass-browse",
        `glass-browse--${deviceProfile}`,
        `glass-browse--${choreoPhase}`,
      ].join(" ")}
      data-testid="glass-browse-overlay"
      data-device-profile={deviceProfile}
      data-choreo-phase={choreoPhase}
      aria-hidden={false}
    >
      {isMobile ? (
        <MobileChrome
          profile={deviceProfile === "tablet" ? "tablet" : "phone"}
          platform={mobilePlatform}
        />
      ) : null}

      <div className="glass-browse__frame" aria-hidden="true">
        <span className="glass-browse__corner glass-browse__corner--tl" />
        <span className="glass-browse__corner glass-browse__corner--tr" />
        <span className="glass-browse__corner glass-browse__corner--bl" />
        <span className="glass-browse__corner glass-browse__corner--br" />
      </div>

      <div className="glass-browse__vignette" aria-hidden="true" />

      <button
        type="button"
        className="glass-browse__exit"
        onClick={() => exit("manual_button")}
        data-testid="glass-browse-exit"
      >
        Exit Glass view
        {!isMobile ? <span className="glass-browse__exit-kbd">Esc</span> : null}
      </button>

      <p className="glass-browse__live-badge" data-testid="glass-browse-live-badge">
        <span className="glass-browse__live-dot" aria-hidden="true" />
        {socialLabel
          ? <>Intelligent layer · <strong>{socialLabel}</strong></>
          : "Intelligent glass — live overlay, not a video"}
      </p>

      <aside className="glass-browse__hint gl-surface" aria-live="polite" data-hint-id={hint.id}>
        <span className="glass-browse__hint-kicker">{hint.title}</span>
        <p className="glass-browse__hint-body">{hint.body}</p>
      </aside>

      <nav className="glass-browse__rail" aria-label="Glass dock rail">
        <div className="glass-browse__rail-chrome">
          <span className="glass-browse__rail-ring glass-browse__rail-ring--active">G</span>
          {RAIL_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              className="glass-browse__rail-btn"
              title={action.label}
            >
              {action.icon}
            </button>
          ))}
        </div>
      </nav>

      {agentsPanelOpen && !introAgentsPhases ? (
        <div className="glass-browse__agent-panel" data-testid="glass-browse-agent-panel">
          <div className="glass-browse__agent-panel-head">
            <span className="glass-browse__agent-panel-dot" />
            <span>Glass Agents</span>
            <button type="button" className="glass-browse__agent-panel-close" onClick={() => setAgentsPanelOpen(false)}>
              Hide
            </button>
          </div>
          <p className="glass-browse__agent-panel-copy">
            I see this landing page — hero, layer stack, pillars, trust. On your Mac I&apos;d fuse it with
            whatever else is open and ship from the builder strip — without leaving the app you&apos;re in.
          </p>
          <div className="glass-browse__agent-panel-lines">
            <span /><span /><span className="glass-browse__agent-panel-lines--short" />
          </div>
        </div>
      ) : null}

      {intro.enabled && !intro.complete ? (
        <>
          <GlassIntroAgentsPanel phase={intro.phase} />
          <GlassIntroIdeMock phase={intro.phase} />
        </>
      ) : null}

      {introCommandActive ? (
        <div className="glass-browse__intro-command-stack" data-testid="glass-browse-intro-command-stack">
          <div
            className={[
              "glass-browse__response-slot",
              introCommandResponse ? " glass-browse__response-slot--live" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-hidden={!introCommandResponse}
          >
            {introCommandResponse ? (
              <div
                className={[
                  "glass-browse__response",
                  "glass-browse__response--intro-demo",
                  intro.introResponseText.length < INTRO_COMMAND_RESPONSE.length
                    ? " glass-browse__response--streaming"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                role="status"
              >
                <div className="glass-browse__response-head">
                  <span className="glass-browse__response-dot" />
                  Aletheia
                </div>
                <p>{intro.introResponseText}</p>
              </div>
            ) : null}
          </div>

          <div className="glass-browse__command-host glass-browse__command-host--intro-demo">
            <form
              className={[
                "glass-browse__command",
                "command-bar--listening",
                choreoReady && !exiting ? " glass-browse__command--armed" : "",
                introCommandTyping ? " glass-browse__command--intro-typing" : "",
                introCommandResponse ? " glass-browse__command--intro-sent" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onSubmit={onFormSubmit}
            >
              <div className="glass-browse__command-row">
                <button
                  type="button"
                  className={`glass-browse__mic${listening || introCommandActive ? " glass-browse__mic--live" : ""}`}
                  aria-label={listening ? "Stop listening" : "Start listening"}
                  aria-pressed={listening}
                  onClick={() => setListening((on) => !on)}
                >
                  <MicIcon />
                </button>
                <input
                  ref={inputRef}
                  className="glass-browse__input"
                  type="text"
                  value={commandInputValue}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={onInputKeyDown}
                  readOnly={introCommandActive}
                  placeholder={
                    introCommandActive
                      ? "Ask across every window on your screen…"
                      : listening
                        ? "Ask IIVO — Lens sees what's beneath the glass…"
                        : "Command the layer while you work…"
                  }
                  data-testid="glass-browse-command-input"
                />
                <div className="glass-browse__trailing">
                  <button
                    type="submit"
                    className={`glass-browse__send${introCommandResponse ? " glass-browse__send--sent" : ""}`}
                    aria-label="Send to IIVO"
                    disabled={!introCommandResponse && !input.trim() && !introCommandTyping}
                  >
                    <SendIcon />
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : (
        <>
      {demoResponse ? (
        <div className="glass-browse__response" role="status">
          <div className="glass-browse__response-head">
            <span className="glass-browse__response-dot" />
            Aletheia
          </div>
          <p>{demoResponse}</p>
          <button type="button" className="glass-browse__response-dismiss" onClick={clearDemoResponse}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className={`glass-browse__command-host${introCommandActive ? " glass-browse__command-host--intro-demo" : ""}`}>
        {!demoResponse && !introCommandActive ? (
          <div className="glass-browse__try-row" data-testid="glass-browse-try-hints">
            <span className="glass-browse__try-label">Try:</span>
            {TRY_COMMANDS.map((cmd) => (
              <button
                key={cmd}
                type="button"
                className="glass-browse__try-chip"
                onClick={() => submitDemoAsk(cmd)}
              >
                {cmd}
              </button>
            ))}
          </div>
        ) : null}
        <form
          className={[
            "glass-browse__command",
            "command-bar--listening",
            choreoReady && !exiting ? " glass-browse__command--armed" : "",
            introCommandTyping ? " glass-browse__command--intro-typing" : "",
            introCommandResponse ? " glass-browse__command--intro-sent" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onSubmit={onFormSubmit}
        >
          <div className="glass-browse__command-row">
            <button
              type="button"
              className={`glass-browse__mic${listening || introCommandActive ? " glass-browse__mic--live" : ""}`}
              aria-label={listening ? "Stop listening" : "Start listening"}
              aria-pressed={listening}
              onClick={() => setListening((on) => !on)}
            >
              <MicIcon />
            </button>
            <input
              ref={inputRef}
              className="glass-browse__input"
              type="text"
              value={commandInputValue}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onInputKeyDown}
              readOnly={introCommandActive}
              placeholder={introCommandActive ? "Ask across every window on your screen…" : listening ? "Ask IIVO — Lens sees what's beneath the glass…" : "Command the layer while you work…"}
              data-testid="glass-browse-command-input"
            />
            <div className="glass-browse__trailing">
              <button
                type="submit"
                className={`glass-browse__send${introCommandResponse ? " glass-browse__send--sent" : ""}`}
                aria-label="Send to IIVO"
                disabled={!introCommandResponse && !input.trim() && !introCommandTyping}
              >
                <SendIcon />
              </button>
            </div>
          </div>
          <span className="glass-browse__command-led" aria-hidden="true" />
        </form>
      </div>
        </>
      )}

      <div className="glass-browse__strip glass-browse__strip--aletheia-core" data-testid="glass-browse-builder-strip">
        <div className="glass-browse__strip-group glass-browse__strip-group--left">
          {STRIP_LEFT.map((tab) => (
            <button
              key={tab.label}
              type="button"
              data-strip-target={tab.kind}
              className={`glass-browse__strip-tab glass-browse__strip-tab--${tab.kind}${tab.kind === "agents" && (introAgentsStripActive || (agentsPanelOpen && !introAgentsPhases)) ? " glass-browse__strip-tab--active" : ""}`}
              onClick={tab.kind === "agents" ? () => setAgentsPanelOpen(!agentsPanelOpen) : undefined}
            >
              <span className="glass-browse__strip-icon">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
        <div className="glass-browse__strip-group glass-browse__strip-group--center">
          <button
            type="button"
            className={`glass-browse__strip-tab glass-browse__strip-tab--aletheia${introAgentsStripActive ? " glass-browse__strip-tab--active" : ""}`}
            data-strip-target="aletheia"
          >
            <span className="glass-browse__strip-aletheia-dot" aria-hidden="true" />
            <span>Aletheia</span>
          </button>
        </div>
        <div className="glass-browse__strip-group glass-browse__strip-group--right">
          <button type="button" className="glass-browse__strip-tab glass-browse__strip-tab--quit" data-strip-target="quit">
            <span>Quit</span>
          </button>
        </div>
      </div>
    </div>
  );
}
