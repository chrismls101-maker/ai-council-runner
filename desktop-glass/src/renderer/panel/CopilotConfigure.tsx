import { useState } from "react";
import { send, useGlassState } from "../useGlassState.ts";
import {
  COPILOT_INTERVAL_OPTIONS,
  COPILOT_MODE_HINTS,
  COPILOT_MODE_LABELS,
  type GlassCopilotMode,
  type GlassCopilotReportStyle,
} from "../../shared/copilotTypes.ts";
import {
  SESSION_TYPE_LABELS,
  SESSION_TYPE_SETTING_LABELS,
  type GlassCopilotSessionTypeSetting,
} from "../../shared/copilotSessionType.ts";

const MODES: GlassCopilotMode[] = ["off", "passive", "coaching", "diagnostic"];

const SESSION_TYPE_SETTINGS: GlassCopilotSessionTypeSetting[] = [
  "auto",
  "video_learning",
  "meeting_call",
  "research",
  "coding_building",
  "business_strategy",
  "general_workflow",
];

/**
 * Compact Session Copilot row + Configure drawer. Only meaningful while a
 * session is active — the row explains this when no session is live.
 */
export function CopilotConfigure({ sessionLive }: { sessionLive: boolean }): JSX.Element {
  const state = useGlassState();
  const [expanded, setExpanded] = useState(false);
  const copilot = state.copilot;
  const config = copilot.config;
  const statusLabel =
    copilot.debriefReady && copilot.mode !== "off"
      ? "Debrief Ready"
      : COPILOT_MODE_LABELS[copilot.mode];

  return (
    <div className="copilot-config" data-testid="glass-copilot-config">
      <div className="copilot-config__status-row">
        <span className={`copilot-config__dot copilot-config__dot--${copilot.active ? "on" : "off"}`} />
        <div className="copilot-config__summary">
          <strong>Session Copilot</strong>
          <span className="copilot-config__state">
            Status: {statusLabel}
            {copilot.active ? ` · ${SESSION_TYPE_LABELS[copilot.sessionType]}` : ""}
            {copilot.active ? ` · ${copilot.insightCount} insight${copilot.insightCount === 1 ? "" : "s"}` : ""}
          </span>
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
          Start a session to enable Session Copilot. It never listens on launch.
        </p>
      ) : null}

      {expanded ? (
        <div className="copilot-config__drawer" data-testid="glass-copilot-drawer">
          <label className="copilot-config__field">
            <span>Mode</span>
            <select
              value={config.mode}
              disabled={!sessionLive}
              onChange={(e) => send({ type: "copilot-set-mode", mode: e.target.value as GlassCopilotMode })}
            >
              {MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {COPILOT_MODE_LABELS[mode]}
                </option>
              ))}
            </select>
          </label>
          <p className="copilot-config__mode-hint">{COPILOT_MODE_HINTS[config.mode]}</p>
          <p className="copilot-config__mode-hint" data-testid="glass-copilot-trust-boundary">
            Safe by default: no listening on launch. Ask before diagnosis — AI analysis runs only after you
            approve a diagnostic card. Refine session type uses AI on demand, not every transcript tick.
          </p>

          <label className="copilot-config__field">
            <span>Session type</span>
            <select
              value={config.sessionType}
              onChange={(e) =>
                send({
                  type: "copilot-set-config",
                  patch: { sessionType: e.target.value as GlassCopilotSessionTypeSetting },
                })
              }
            >
              {SESSION_TYPE_SETTINGS.map((type) => (
                <option key={type} value={type}>
                  {SESSION_TYPE_SETTING_LABELS[type]}
                </option>
              ))}
            </select>
          </label>

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

          {copilot.active ? (
            <button
              type="button"
              className="gbtn"
              data-testid="glass-copilot-debrief-now"
              onClick={() => send({ type: "copilot-generate-debrief" })}
            >
              Generate debrief now
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
