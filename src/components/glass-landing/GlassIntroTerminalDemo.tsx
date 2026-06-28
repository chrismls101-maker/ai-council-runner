import { useEffect, useState, type JSX } from "react";
import type { GlassIntroPhase } from "./glassCinematicIntro";
import {
  INTRO_TERMINAL_RUN_STEPS,
  INTRO_TERMINAL_SHELL_CMD,
  INTRO_TERMINAL_VOICE_TRANSCRIPT,
} from "./glassIntroTerminalScript";

type TerminalBeat = "reveal" | "voice" | "demo" | "close";
type VoiceUiPhase = "recording" | "transcript" | "converting" | "ready" | "running";

const WELCOME_SHORTCUTS = [
  { keys: ["⌃", "Space"], label: "Natural language" },
  { keys: ["⌘", "⇧", "V"], label: "Voice command" },
  { keys: ["⌘", "E"], label: "Explain error" },
] as const;

function beatFromPhase(phase: GlassIntroPhase): TerminalBeat {
  if (phase === "open-terminal") return "reveal";
  if (phase === "terminal-voice") return "voice";
  if (phase === "terminal-demo") return "demo";
  return "close";
}

function MicIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" />
      <path d="M19 11v1a7 7 0 0 1-14 0v-1" />
      <path d="M12 18v3" />
    </svg>
  );
}

function ChevronDownIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

/** Glass Terminal voice → NL → shell — stays in Glass UI, never becomes a raw shell. */
export default function GlassIntroTerminalDemo({ phase }: { phase: GlassIntroPhase }): JSX.Element {
  const beat = beatFromPhase(phase);
  const [revealed, setRevealed] = useState(false);
  const [voiceUi, setVoiceUi] = useState<VoiceUiPhase>("recording");
  const [transcript, setTranscript] = useState("");
  const [runSteps, setRunSteps] = useState<string[]>([]);

  useEffect(() => {
    if (beat === "reveal") {
      setRevealed(false);
      setVoiceUi("recording");
      setTranscript("");
      setRunSteps([]);
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setRevealed(true));
      });
      return () => cancelAnimationFrame(frame);
    }
    if (beat === "close") {
      setRevealed(false);
    }
    return undefined;
  }, [beat]);

  useEffect(() => {
    if (beat !== "voice") return;

    setVoiceUi("recording");
    setTranscript("");
    const timers: number[] = [];
    let typeInterval = 0;

    let started = false;

    const startTranscriptTyping = (): void => {
      if (started) return;
      started = true;
      setVoiceUi("transcript");
      let index = 0;
      const full = INTRO_TERMINAL_VOICE_TRANSCRIPT;
      const msPerChar = 52;
      typeInterval = window.setInterval(() => {
        index += 1;
        setTranscript(full.slice(0, index));
        if (index >= full.length) window.clearInterval(typeInterval);
      }, msPerChar);
    };

    const onSpeechStart = (): void => {
      timers.push(window.setTimeout(startTranscriptTyping, 280));
    };

    if (document.documentElement.classList.contains("glass-intro-aletheia-speaking")) {
      onSpeechStart();
    } else {
      const observer = new MutationObserver(() => {
        if (!document.documentElement.classList.contains("glass-intro-aletheia-speaking")) return;
        observer.disconnect();
        onSpeechStart();
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      timers.push(
        window.setTimeout(() => {
          observer.disconnect();
          if (!started) startTranscriptTyping();
        }, 1400),
      );
    }

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      if (typeInterval) window.clearInterval(typeInterval);
    };
  }, [beat]);

  useEffect(() => {
    if (beat !== "demo") return;

    setVoiceUi("converting");
    setRunSteps([]);
    const timers: number[] = [];

    timers.push(window.setTimeout(() => setVoiceUi("ready"), 900));
    timers.push(window.setTimeout(() => setVoiceUi("running"), 2400));

    INTRO_TERMINAL_RUN_STEPS.forEach((step, i) => {
      timers.push(
        window.setTimeout(() => {
          setRunSteps((prev) => [...prev, step]);
        }, 2600 + i * 480),
      );
    });

    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [beat]);

  const open = revealed && beat !== "close";
  const voiceReady = voiceUi === "ready" || voiceUi === "running";
  const showVoiceBar = beat === "voice" || beat === "demo";
  const showWelcome = beat === "reveal";

  return (
    <div
      className={`glass-intro-terminal-reveal${open ? " glass-intro-terminal-reveal--open" : ""}${beat === "close" ? " glass-intro-terminal-reveal--close" : ""}`}
      data-testid="glass-intro-terminal-reveal"
    >
      <div className="glass-intro-terminal-reveal__inner">
        <div className="glass-intro-terminal-demo landing-terminal-mock glass-terminal-panel">
          <div className="glass-terminal-header landing-terminal-mock__header">
            <span className="glass-terminal-header__status glass-terminal-header__status--live" aria-hidden="true" />
            <div className="landing-terminal-mock__tabs" aria-hidden="true">
              <span className="landing-terminal-mock__tab landing-terminal-mock__tab--active">
                <span className="landing-terminal-mock__tab-title">zsh</span>
              </span>
              <span className="landing-terminal-mock__tab landing-terminal-mock__tab--new">+</span>
            </div>
            <div className="glass-terminal-header__controls">
              <span className="glass-terminal-ctrl-btn glass-terminal-ctrl-btn--hide landing-terminal-mock__hide">
                <ChevronDownIcon />
                <span>Hide</span>
              </span>
            </div>
          </div>

          <div className="landing-terminal-mock__viewport glass-terminal-viewport glass-intro-terminal-demo__viewport">
            {showWelcome ? (
            <div className="glass-terminal-welcome glass-terminal-welcome--visible landing-terminal-mock__welcome glass-intro-terminal-demo__welcome">
              <div className="gtw-inner landing-terminal-mock__welcome-inner">
                <div className="gtw-brand landing-terminal-mock__brand">
                  <div className="gtw-swarm-wrap landing-terminal-mock__swarm-wrap">
                    <div className="landing-terminal-mock__swarm" aria-hidden="true">
                      <span className="landing-terminal-mock__swarm-core" />
                      <span className="landing-terminal-mock__swarm-particle landing-terminal-mock__swarm-particle--a" />
                      <span className="landing-terminal-mock__swarm-particle landing-terminal-mock__swarm-particle--b" />
                      <span className="landing-terminal-mock__swarm-particle landing-terminal-mock__swarm-particle--c" />
                      <span className="landing-terminal-mock__swarm-ring landing-terminal-mock__swarm-ring--a" />
                      <span className="landing-terminal-mock__swarm-ring landing-terminal-mock__swarm-ring--b" />
                    </div>
                  </div>
                  <div className="gtw-brand-text landing-terminal-mock__brand-text">
                    <span className="gtw-logo-text landing-terminal-mock__logo-text">IIVO Glass</span>
                    <p className="gtw-tagline landing-terminal-mock__tagline">Voice → shell from the intelligence layer</p>
                  </div>
                </div>

                <p className="gtw-section-label landing-terminal-mock__section-label">Shortcuts</p>
                <div className="gtw-features landing-terminal-mock__shortcuts">
                  {WELCOME_SHORTCUTS.map(({ keys, label }) => (
                    <div key={label} className="gtw-row landing-terminal-mock__shortcut-row">
                      <span className="gtw-label landing-terminal-mock__shortcut-label">{label}</span>
                      <div className="gtw-keys landing-terminal-mock__keys" aria-hidden="true">
                        {keys.map((k) => (
                          <kbd key={k} className="gtw-kbd landing-terminal-mock__kbd">
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {runSteps.length > 0 ? (
                  <div className="glass-intro-terminal-demo__steps" aria-live="polite">
                    {runSteps.map((step) => (
                      <p key={step} className="glass-intro-terminal-demo__step">
                        {step}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            ) : (
              <div className="glass-intro-terminal-demo__shell-ready" aria-hidden="true">
                <p className="glass-intro-terminal-demo__shell-prompt">
                  <span className="glass-intro-terminal-demo__shell-user">you@glass</span>
                  <span className="glass-intro-terminal-demo__shell-path"> ~/Projects/iivo-glass</span>
                  <span className="glass-intro-terminal-demo__shell-caret"> %</span>
                </p>
                {runSteps.length > 0 ? (
                  <div className="glass-intro-terminal-demo__steps glass-intro-terminal-demo__steps--shell" aria-live="polite">
                    {runSteps.map((step) => (
                      <p key={step} className="glass-intro-terminal-demo__step">
                        {step}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div
            className={`gtp-nl-bar landing-terminal-mock__nl glass-intro-terminal-demo__nl${showVoiceBar ? " glass-intro-terminal-demo__nl--voice" : ""}`}
            role="region"
            aria-label="Voice to shell command"
          >
            <div className="gtp-nl-label landing-terminal-mock__nl-label">
              <div className="gtp-nl-label-main landing-terminal-mock__nl-label-main">
                <span className="gtp-nl-label-icon landing-terminal-mock__nl-icon">⌃</span>
                <span className="gtp-nl-label-arrow landing-terminal-mock__nl-arrow">→</span>
                <span>{showVoiceBar ? "Voice → Shell" : "Shell"}</span>
              </div>
              <span className="gtp-nl-label-hint landing-terminal-mock__nl-hint">
                {showVoiceBar
                  ? "Aletheia listens — Enter runs the converted command"
                  : "Describe what you want — Enter converts it to a shell command"}
              </span>
            </div>

            {showVoiceBar ? (
              <div
                className={`gtp-voice-bar gtp-voice-bar--embedded glass-intro-terminal-demo__voice${voiceReady ? " gtp-voice-bar--ready" : ""}`}
              >
                {voiceUi === "recording" ? (
                  <div className="gtp-voice-header gtp-voice-header--embedded">
                    <span className="gtp-voice-recording-dot" />
                    <span className="gtp-voice-label">Listening…</span>
                    <span className="gtp-voice-timer">0:01</span>
                  </div>
                ) : null}

                {(voiceUi === "transcript" || voiceReady) && transcript ? (
                  <div className="gtp-voice-transcript">“{transcript}”</div>
                ) : null}

                {voiceUi === "converting" ? (
                  <div className="gtp-voice-status">
                    <span className="gte-spinner" />
                    <span>Converting to shell command…</span>
                  </div>
                ) : null}

                {voiceReady ? (
                  <>
                    <div className="gtp-voice-preview">
                      <code className="gtp-voice-preview-cmd">{INTRO_TERMINAL_SHELL_CMD}</code>
                    </div>
                    <div className="gtp-voice-actions">
                      <button
                        type="button"
                        className={`gtp-voice-btn gtp-voice-btn--run${voiceUi === "running" ? " glass-intro-terminal-demo__run--active" : ""}`}
                        tabIndex={-1}
                        aria-hidden="true"
                      >
                        {voiceUi === "running" ? "Running…" : "↵ Run"}
                      </button>
                      <button type="button" className="gtp-voice-btn" tabIndex={-1} aria-hidden="true">
                        Copy
                      </button>
                    </div>
                  </>
                ) : null}

                {beat === "voice" && voiceUi === "transcript" && !transcript ? (
                  <div className="gtp-voice-status">
                    <span className="gtp-voice-recording-dot" />
                    <div className="gtp-voice-waveform" aria-hidden="true">
                      <span /><span /><span /><span /><span />
                    </div>
                    <span>Speak your command…</span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="gtp-nl-input-row landing-terminal-mock__nl-row">
                <button
                  type="button"
                  className="gtp-nl-mic-btn landing-terminal-mock__nl-mic gtp-nl-mic-btn--active"
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <MicIcon />
                </button>
                <div className="gtp-nl-input-wrap landing-terminal-mock__nl-input-wrap">
                  <span className="landing-terminal-mock__nl-placeholder">
                    e.g. find what&apos;s using port 3000 and restart dev
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
