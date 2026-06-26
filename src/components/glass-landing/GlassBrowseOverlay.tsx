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
import {
  detectGlassBrowseMobilePlatform,
  isGlassBrowseMobile,
  type GlassBrowseMobilePlatform,
} from "./glassBrowseDevice";
import {
  formatGlassBrowseSocialProof,
  useGlassBrowseSocialProof,
} from "../../hooks/useGlassBrowseSocialProof";

const TRY_COMMANDS = ["agents", "privacy", "memory"] as const;

const BUILDER_LEFT = [
  { icon: "▦", label: "Dashboard", kind: "dashboard" },
  { icon: "⌥", label: "Prompts", kind: "prompts" },
  { icon: "⚡", label: "Prompt Gen", kind: "power-prompt" },
  { icon: "🗝", label: "API Keys", kind: "keys" },
  { icon: "💸", label: "Spend", kind: "spend" },
  { icon: "⬡", label: "Extract", kind: "extract" },
  { icon: ">_", label: "Terminal", kind: "terminal" },
] as const;

const BUILDER_RIGHT = [
  { label: "Aletheia", kind: "aletheia" },
  { icon: "◈", label: "Agents", kind: "agents" },
  { label: "Powers Menu", kind: "powers" },
  { label: "Command Palette", kind: "palette" },
] as const;

const RAIL_ACTIONS = [
  { icon: "◫", label: "Workspace" },
  { icon: "▷", label: "Listen" },
  { icon: ">_", label: "Terminal" },
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
  const inputRef = useRef<HTMLInputElement>(null);
  const { entered: socialEntered } = useGlassBrowseSocialProof();
  const socialLabel = formatGlassBrowseSocialProof(socialEntered);

  useEffect(() => {
    if (!active) {
      setInput("");
      setListening(true);
      clearDemoResponse();
    }
  }, [active, clearDemoResponse]);

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

  if (!active) return null;

  const isMobile = isGlassBrowseMobile(deviceProfile);
  const mobilePlatform = detectGlassBrowseMobilePlatform();

  return (
    <div
      className={`glass-browse glass-browse--${deviceProfile}`}
      data-testid="glass-browse-overlay"
      data-device-profile={deviceProfile}
      aria-hidden={false}
    >
      {isMobile ? (
        <MobileChrome
          profile={deviceProfile === "tablet" ? "tablet" : "phone"}
          platform={mobilePlatform}
        />
      ) : (
        <div className="glass-browse__desktop-chrome" aria-hidden="true">
          <div className="glass-browse__menubar">
            <span className="glass-browse__menubar-app">Safari</span>
            <span>File</span>
            <span>Edit</span>
            <span>View</span>
            <span className="glass-browse__menubar-time">9:41 AM</span>
          </div>
          <div className="glass-browse__mac-dock">
            {["finder", "safari", "mail", "messages", "photos", "music", "notes"].map((tone) => (
              <span key={tone} className={`glass-browse__dock-icon glass-browse__dock-icon--${tone}`} />
            ))}
          </div>
        </div>
      )}

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
          ? <>Live overlay · <strong>{socialLabel}</strong></>
          : "Live overlay — interactive HTML, not a video"}
      </p>

      <aside className="glass-browse__hint gl-surface" aria-live="polite">
        <span className="glass-browse__hint-kicker">{hint.title}</span>
        <p className="glass-browse__hint-body">{hint.body}</p>
      </aside>

      <nav className="glass-browse__rail" aria-label="Glass dock rail">
        <div className="glass-browse__rail-chrome">
          <span className="glass-browse__rail-ring">G</span>
          {RAIL_ACTIONS.map((action) => (
            <button key={action.label} type="button" className="glass-browse__rail-btn" title={action.label}>
              {action.icon}
            </button>
          ))}
          <span className="glass-browse__rail-led" />
        </div>
      </nav>

      {agentsPanelOpen ? (
        <div className="glass-browse__agent-panel" data-testid="glass-browse-agent-panel">
          <div className="glass-browse__agent-panel-head">
            <span className="glass-browse__agent-panel-dot" />
            <span>Glass Agents</span>
            <button type="button" className="glass-browse__agent-panel-close" onClick={() => setAgentsPanelOpen(false)}>
              Hide
            </button>
          </div>
          <p className="glass-browse__agent-panel-copy">
            Here's what I see on this page: hero, pillars, trust copy. On your Mac I'd open Agents,
            read <strong>iivo.ai</strong> as context, and ship files without leaving this tab.
          </p>
          <div className="glass-browse__agent-panel-lines">
            <span /><span /><span className="glass-browse__agent-panel-lines--short" />
          </div>
        </div>
      ) : null}

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

      <div className="glass-browse__command-host">
        {!demoResponse ? (
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
        <form className="glass-browse__command command-bar--listening" onSubmit={onFormSubmit}>
          <div className="glass-browse__command-row">
            <button
              type="button"
              className={`glass-browse__mic${listening ? " glass-browse__mic--live" : ""}`}
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
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder={listening ? "Ask IIVO about this page…" : "Ask IIVO while you work…"}
              data-testid="glass-browse-command-input"
            />
            <div className="glass-browse__trailing">
              <button type="submit" className="glass-browse__send" aria-label="Send to IIVO" disabled={!input.trim()}>
                <SendIcon />
              </button>
            </div>
          </div>
          <span className="glass-browse__command-led" aria-hidden="true" />
        </form>
      </div>

      <div className="glass-browse__strip" data-testid="glass-browse-builder-strip">
        <div className="glass-browse__strip-group glass-browse__strip-group--left">
          {BUILDER_LEFT.map((tab) => (
            <button
              key={tab.label}
              type="button"
              className={`glass-browse__strip-tab glass-browse__strip-tab--${tab.kind}`}
            >
              <span className="glass-browse__strip-icon">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
        <span className="glass-browse__strip-divider" aria-hidden="true" />
        <div className="glass-browse__strip-group glass-browse__strip-group--right">
          {BUILDER_RIGHT.map((tab) => (
            <button
              key={tab.label}
              type="button"
              className={`glass-browse__strip-tab glass-browse__strip-tab--${tab.kind}${tab.kind === "agents" && agentsPanelOpen ? " glass-browse__strip-tab--active" : ""}`}
              onClick={tab.kind === "agents" ? () => setAgentsPanelOpen(!agentsPanelOpen) : undefined}
            >
              {"icon" in tab ? <span className="glass-browse__strip-icon">{tab.icon}</span> : null}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
