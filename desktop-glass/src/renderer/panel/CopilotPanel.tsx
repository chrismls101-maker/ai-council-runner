import { useMemo, useState } from "react";
import { send, useGlassState } from "../useGlassState.ts";
import { useTranscriptionContext } from "../TranscriptionProvider.tsx";
import {
  COPILOT_INTERVAL_OPTIONS,
  COPILOT_MODE_HINTS,
  COPILOT_MODE_LABELS,
  type GlassCopilotMode,
  type GlassCopilotReportStyle,
} from "../../shared/copilotTypes.ts";
import {
  SESSION_TYPE_LABELS,
  type GlassCopilotSessionTypeSetting,
} from "../../shared/copilotSessionType.ts";
import {
  INPUT_SOURCE_OPTIONS,
  SESSION_FOCUS_OPTIONS,
  inputSourceStatusLabel,
  inputSourceToTranscriptionMode,
  resolveInputSource,
  sessionFocusLabel,
  type CopilotInputSource,
} from "../../shared/copilotPanelModel.ts";

const COPILOT_MODES: GlassCopilotMode[] = ["off", "passive", "coaching", "diagnostic"];

/**
 * Consolidated Session Copilot control surface — mode, session focus, input
 * source, primary actions, and advanced settings behind Configure.
 *
 * Voice Mode stays on the command bar (separate interaction loop).
 */
export function CopilotPanel({ sessionLive }: { sessionLive: boolean }): JSX.Element {
  const state = useGlassState();
  const tx = useTranscriptionContext();
  const [expanded, setExpanded] = useState(false);
  const copilot = state.copilot;
  const config = copilot.config;

  const inputSource = useMemo(
    () =>
      resolveInputSource({
        transcriptionMode: tx.selectedMode,
        listening: state.privacy.listening || tx.status === "listening",
        capturing: state.privacy.capturing,
        hasSessionContext: Boolean(state.session && state.session.events.length > 0),
      }),
    [tx.selectedMode, tx.status, state.privacy.listening, state.privacy.capturing, state.session],
  );

  const statusLabel =
    copilot.debriefReady && copilot.mode !== "off"
      ? "Debrief ready"
      : COPILOT_MODE_LABELS[copilot.mode];

  const focusLabel =
    config.sessionType === "auto"
      ? copilot.active
        ? `Auto → ${SESSION_TYPE_LABELS[copilot.sessionType]}`
        : "Auto"
      : sessionFocusLabel(config.sessionType);

  const sourceStatus = inputSourceStatusLabel(inputSource, state.privacy.listening || tx.status === "listening");

  const canStartListening =
    inputSource === "microphone" || inputSource === "system_audio" ? tx.canListen : false;
  const listening = state.privacy.listening || tx.status === "listening";

  const setInputSource = (source: CopilotInputSource) => {
    if (source === "screen" || source === "mixed") return;
    if (source === "microphone") {
      const micMode =
        tx.modeOptions.find(
          (m) => m === "microphone_web_speech" || m === "microphone_media_recorder",
        ) ?? "manual";
      tx.setMode(micMode);
      return;
    }
    tx.setMode(inputSourceToTranscriptionMode(source));
  };

  return (
    <section className="copilot-panel" data-testid="glass-copilot-panel">
      <div className="copilot-panel__head">
        <div className="copilot-panel__title-row">
          <span className={`copilot-config__dot copilot-config__dot--${copilot.active ? "on" : "off"}`} />
          <div>
            <strong className="copilot-panel__title">Session Copilot</strong>
            <p className="copilot-panel__subtitle">
              {statusLabel} · Focus: {focusLabel} · {sourceStatus}
              {copilot.active ? ` · ${copilot.insightCount} insight${copilot.insightCount === 1 ? "" : "s"}` : ""}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="gbtn gbtn--ghost"
          aria-expanded={expanded}
          data-testid="glass-copilot-configure-toggle"
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? "Hide" : "Configure"}
        </button>
      </div>

      {!sessionLive ? (
        <p className="copilot-config__hint">
          Start a session to enable Session Copilot. Mic, system audio, and screen capture never start on launch.
        </p>
      ) : null}

      <div className="copilot-panel__controls">
        <label className="copilot-panel__field">
          <span>Copilot mode</span>
          <select
            value={config.mode}
            disabled={!sessionLive}
            data-testid="glass-copilot-mode-select"
            onChange={(e) => send({ type: "copilot-set-mode", mode: e.target.value as GlassCopilotMode })}
          >
            {COPILOT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {COPILOT_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>

        <label className="copilot-panel__field">
          <span>Session focus</span>
          <select
            value={config.sessionType}
            data-testid="glass-copilot-focus-select"
            onChange={(e) =>
              send({
                type: "copilot-set-config",
                patch: { sessionType: e.target.value as GlassCopilotSessionTypeSetting },
              })
            }
          >
            {SESSION_FOCUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="copilot-panel__field">
          <span>Input source</span>
          <select
            value={inputSource === "mixed" ? "mixed" : inputSource}
            data-testid="glass-copilot-input-source-select"
            onChange={(e) => setInputSource(e.target.value as CopilotInputSource)}
          >
            {INPUT_SOURCE_OPTIONS.filter((o) => o.value !== "mixed").map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
            {inputSource === "mixed" ? (
              <option value="mixed">Mixed context</option>
            ) : null}
          </select>
        </label>
      </div>

      <p className="copilot-panel__source-hint">
        {INPUT_SOURCE_OPTIONS.find((o) => o.value === inputSource)?.hint ??
          INPUT_SOURCE_OPTIONS[0].hint}
      </p>

      <div className="copilot-panel__actions">
        {!sessionLive ? (
          <button
            type="button"
            className="gbtn gbtn--primary"
            data-testid="glass-copilot-start-session"
            onClick={() => send({ type: "session-start" })}
          >
            Start Session
          </button>
        ) : null}
        {sessionLive && canStartListening && !listening ? (
          <button
            type="button"
            className="gbtn gbtn--primary"
            data-testid="glass-copilot-start-listening"
            disabled={!canStartListening}
            onClick={() => tx.startListening()}
          >
            Start Listening
          </button>
        ) : null}
        {listening ? (
          <button type="button" className="gbtn" onClick={() => send({ type: "pause" })}>
            Stop Listening
          </button>
        ) : null}
        {sessionLive && copilot.mode !== "off" ? (
          <button
            type="button"
            className="gbtn"
            data-testid="glass-copilot-debrief-now"
            onClick={() => send({ type: "copilot-generate-debrief" })}
          >
            Generate Debrief
          </button>
        ) : null}
        <button
          type="button"
          className="gbtn gbtn--danger"
          data-testid="glass-copilot-stop-everything"
          onClick={() => send({ type: "stop-everything" })}
        >
          Stop Everything
        </button>
      </div>

      {expanded ? (
        <div className="copilot-config__drawer" data-testid="glass-copilot-drawer">
          <p className="copilot-config__mode-hint">{COPILOT_MODE_HINTS[config.mode]}</p>
          <p className="copilot-config__mode-hint" data-testid="glass-copilot-trust-boundary">
            Safe by default: no listening on launch. Diagnostic AI runs only after you approve a card.
            Refine session type uses AI on demand, not every transcript tick.
          </p>

          {copilot.sessionTypeRefineAvailable && config.sessionType === "auto" ? (
            <div className="copilot-config__field" data-testid="glass-copilot-session-refine">
              <span>{copilot.sessionTypeRefineLabel ?? "Refine session type?"}</span>
              <button
                type="button"
                className="gbtn gbtn--ghost"
                disabled={!sessionLive || copilot.sessionTypeRefining}
                onClick={() => send({ type: "copilot-refine-session-type" })}
              >
                {copilot.sessionTypeRefining ? "Refining…" : "Refine session type"}
              </button>
            </div>
          ) : null}

          {copilot.semanticSessionType ? (
            <p className="copilot-config__mode-hint">
              Refined: {SESSION_TYPE_LABELS[copilot.semanticSessionType.primaryType]}
              {copilot.semanticSessionType.secondaryType
                ? ` + ${SESSION_TYPE_LABELS[copilot.semanticSessionType.secondaryType]}`
                : ""}
              {" · "}
              {copilot.semanticSessionType.reason}
            </p>
          ) : null}

          <label className="copilot-config__field">
            <span>Insight interval</span>
            <select
              value={config.intervalSec}
              onChange={(e) =>
                send({ type: "copilot-set-config", patch: { intervalSec: Number(e.target.value) as 60 | 90 | 120 } })
              }
            >
              {COPILOT_INTERVAL_OPTIONS.map((sec) => (
                <option key={sec} value={sec}>
                  {sec} seconds
                </option>
              ))}
            </select>
          </label>

          <label className="copilot-config__row-check">
            <input
              type="checkbox"
              checked={config.showOverlaySuggestions}
              onChange={(e) =>
                send({ type: "copilot-set-config", patch: { showOverlaySuggestions: e.target.checked } })
              }
            />
            <span>Show overlay suggestions</span>
          </label>

          <label className="copilot-config__row-check">
            <input
              type="checkbox"
              checked={config.autoDebriefOnEnd}
              onChange={(e) =>
                send({ type: "copilot-set-config", patch: { autoDebriefOnEnd: e.target.checked } })
              }
            />
            <span>Auto-debrief when session ends</span>
          </label>

          <label className="copilot-config__row-check">
            <input
              type="checkbox"
              checked={config.muteSuggestions}
              onChange={(e) => send({ type: "copilot-set-muted", muted: e.target.checked })}
            />
            <span>Mute suggestions</span>
          </label>

          <label className="copilot-config__field">
            <span>Silence timeout (min)</span>
            <input
              type="number"
              min={1}
              max={60}
              value={config.silenceTimeoutMin}
              onChange={(e) =>
                send({ type: "copilot-set-config", patch: { silenceTimeoutMin: Number(e.target.value) } })
              }
            />
          </label>

          <label className="copilot-config__field">
            <span>Max listening (min)</span>
            <select
              value={config.maxListeningMin === 0 ? "off" : String(config.maxListeningMin)}
              onChange={(e) => {
                const raw = e.target.value;
                send({
                  type: "copilot-set-config",
                  patch: { maxListeningMin: raw === "off" ? 0 : Number(raw) },
                });
              }}
            >
              <option value="off">Off (no limit)</option>
              <option value="30">30</option>
              <option value="60">60</option>
              <option value="90">90</option>
              <option value="120">120</option>
              <option value="180">180</option>
              <option value="240">240</option>
              <option value="480">480</option>
            </select>
          </label>

          <label className="copilot-config__field">
            <span>Report style</span>
            <select
              value={config.reportStyle}
              onChange={(e) =>
                send({
                  type: "copilot-set-config",
                  patch: { reportStyle: e.target.value as GlassCopilotReportStyle },
                })
              }
            >
              <option value="concise">Concise</option>
              <option value="detailed">Detailed</option>
            </select>
          </label>
        </div>
      ) : null}
    </section>
  );
}
