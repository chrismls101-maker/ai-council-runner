import { useEffect, useMemo, useRef, useState } from "react";
import { CommandTranslateIcon } from "../command/CommandTranslateIcon.tsx";
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
  SESSION_FOCUS_OPTIONS,
  inputSourceToTranscriptionMode,
} from "../../shared/copilotPanelModel.ts";
import {
  GLASS_MODE_ICONS,
  GLASS_MODE_ORDER,
  GLASS_MODE_PRESETS,
  GLASS_QUICK_TOOLS,
  GLASS_QUICK_TOOL_COPY,
  GLASS_QUICK_TOOL_LABELS,
  MODE_PRIVACY_NOTES,
  MODE_STATUS_LABELS,
  getModePreset,
  modePrimaryActionLabel,
  planModeActivation,
  resolveModeStatus,
  type GlassModeId,
  type GlassModePreset,
  type GlassQuickToolId,
} from "../../shared/glassModePresets.ts";
import {
  LISTEN_ATTENTION_LABELS,
  type ListenAttentionLevel,
} from "../../shared/listenMomentTypes.ts";
import { selectedDeviceMayIncludeMicrophone } from "../../shared/virtualAudioDevices.ts";
import {
  TranslateActiveStatus,
  TranslateModeSetup,
  MeetingsTranslateToggle,
} from "./TranslateModeSetup.tsx";
import { MeetingIntelPanel } from "./MeetingIntelPanel.tsx";
import { WingmanPanel } from "./WingmanPanel.tsx";

const COPILOT_MODES: GlassCopilotMode[] = ["off", "passive", "coaching", "diagnostic"];

/** Map a clicked mode preset's copilot mode + focus onto the running session. */
function applyModePreset(preset: GlassModePreset): void {
  send({ type: "session-start" });
  send({ type: "copilot-set-mode", mode: preset.copilotMode });
  send({ type: "copilot-set-config", patch: { sessionType: preset.sessionFocus } });
}

/**
 * Simplified one-click mode panel: Listen / Meetings / Work / Fix cards plus a
 * separate Voice action. Advanced configuration is hidden behind "Advanced".
 *
 * No mode click ever starts mic/system audio/screen capture implicitly — audio
 * starts only when a source is ready and the user confirms.
 */
export function CopilotPanel({ sessionLive }: { sessionLive: boolean }): JSX.Element {
  const state = useGlassState();
  const tx = useTranscriptionContext();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pendingMeetingChoice, setPendingMeetingChoice] = useState(false);
  const [pendingTranslateSetup, setPendingTranslateSetup] = useState(false);
  const [listenNeedsAudio, setListenNeedsAudio] = useState(false);
  const lastTranslateSetupRequest = useRef(0);

  const copilot = state.copilot;
  const config = copilot.config;
  const listening = state.privacy.listening || tx.status === "listening";
  const systemAudioReady = tx.systemAudioStatus === "available";
  // Gate error display on listening being active. The startup setup check broadcasts
  // "connect-system-audio" which probes BlackHole and can dispatch SET_ERROR in the
  // renderer before the user has clicked anything. Without this gate, a restored
  // listen session (copilot.active=true) shows "Error" on the card immediately on
  // open — before the user has interacted with audio at all.
  const hasError = Boolean((state.lastError || tx.lastError) && listening);

  // Derive which simple mode is active from copilot mode + focus.
  const activeMode = useMemo<GlassModeId | null>(() => {
    if (!copilot.active || copilot.mode === "off") return null;
    if (copilot.mode === "diagnostic") return "wingman";
    if (config.sessionType === "meeting_call") return "meetings";
    if (config.sessionType === "video_learning") return "listen";
    return "wingman";
  }, [copilot.active, copilot.mode, config.sessionType]);

  const activeSourceLabel = activeMode === "listen"
    ? "Computer Audio"
    : listening
      ? tx.selectedMode === "system_audio"
        ? "System Audio"
        : "Microphone"
      : "None";

  const listenMicOff = activeMode === "listen" && tx.selectedMode === "system_audio";
  const aggregateMicWarning =
    activeMode === "listen" &&
    selectedDeviceMayIncludeMicrophone(
      state.virtualAudioDevices ?? [],
      state.selectedVirtualAudioDeviceId,
    );

  const onModeClick = (preset: GlassModePreset) => {
    // Clear any stale error from the previous session before activating.
    // Without this, resolveModeStatus sees isActive=true + hasError=true on the
    // very first render after click (copilot goes active before state.lastError
    // drains), flashing "Error" on the card until the next state push clears it.
    send({ type: "clear-last-error" });
    const plan = planModeActivation(preset, { systemAudioReady });
    applyModePreset(preset);
    setPendingMeetingChoice(false);
    setPendingTranslateSetup(false);
    setListenNeedsAudio(false);

    if (preset.id === "listen") {
      send({ type: "capture-media-context" });
      tx.setMode("system_audio");
      if (plan.needsSystemAudioSetup) {
        setListenNeedsAudio(true);
        return;
      }
      if (plan.startListening) {
        queueMicrotask(() => tx.startListening());
      }
      return;
    }

    if (preset.id === "meetings") {
      setPendingMeetingChoice(true);
      return;
    }
    // Work / Fix activate immediately, no audio.
  };

  const chooseMeetingSource = (source: "microphone" | "system_audio") => {
    tx.setMode(inputSourceToTranscriptionMode(source === "microphone" ? "microphone" : "system_audio"));
    setPendingMeetingChoice(false);
    if (source === "system_audio" && !systemAudioReady) {
      setListenNeedsAudio(true);
      return;
    }
    if (tx.canListen) queueMicrotask(() => tx.startListening());
  };

  const openTranslateSetup = () => {
    applyModePreset(getModePreset("translate"));
    setPendingMeetingChoice(false);
    setListenNeedsAudio(false);
    setPendingTranslateSetup(true);
  };

  useEffect(() => {
    const requestId = state.translateSetupRequestId ?? 0;
    if (requestId <= lastTranslateSetupRequest.current) return;
    lastTranslateSetupRequest.current = requestId;
    openTranslateSetup();
  }, [state.translateSetupRequestId]);

  const onQuickToolClick = (tool: GlassQuickToolId) => {
    if (tool === "voice") {
      send({ type: "voice-mode-start" });
      return;
    }
    openTranslateSetup();
  };

  return (
    <section className="mode-panel" data-testid="glass-mode-panel">
      <div className="mode-panel__head">
        <h2 className="mode-panel__title">What do you want IIVO to do?</h2>
      </div>

      <div className="mode-cards" data-testid="glass-mode-cards">
        {GLASS_MODE_ORDER.map((id) => {
          const preset = GLASS_MODE_PRESETS[id];
          const status = resolveModeStatus(preset, {
            activeMode,
            systemAudioReady,
            listening,
            hasError,
          });
          const isActive = activeMode === id;
          return (
            <button
              key={id}
              type="button"
              className={`mode-card mode-card--${id}${isActive ? " mode-card--active" : ""}`}
              data-testid={`glass-mode-card-${id}`}
              data-status={status}
              aria-pressed={isActive}
              onClick={() => onModeClick(preset)}
            >
              <span className="mode-card__icon" aria-hidden="true">{GLASS_MODE_ICONS[id]}</span>
              <div className="mode-card__top">
                <strong className="mode-card__label">[ {preset.label} Mode ]</strong>
                <span className={`mode-card__status mode-card__status--${status}`}>
                  {MODE_STATUS_LABELS[status]}
                </span>
              </div>
              <p className="mode-card__for">
                <span className="mode-card__for-prefix">For </span>
                {preset.forItems.map((item, i) => (
                  <span key={item}>
                    <strong className="mode-card__for-item">{item}</strong>
                    {i < preset.forItems.length - 1 ? ", " : ""}
                  </span>
                ))}
              </p>
              <p className="mode-card__desc">{preset.description}</p>
              <span className="mode-card__action">{modePrimaryActionLabel(preset, status)}</span>
            </button>
          );
        })}
      </div>

      <div className="mode-panel__quick-tools" data-testid="glass-quick-tools">
        <span className="mode-panel__quick-tools-label">Quick Tools</span>
        <div className="mode-panel__quick-tools-row">
          {GLASS_QUICK_TOOLS.map((tool) => (
            <button
              key={tool}
              type="button"
              className={`gbtn gbtn--ghost mode-panel__quick-tool${
                tool === "translate" && state.liveTranslate?.active ? " gbtn--active" : ""
              }`}
              data-testid={tool === "voice" ? "glass-mode-voice" : "glass-quick-tool-translate"}
              title={GLASS_QUICK_TOOL_COPY[tool]}
              onClick={() => onQuickToolClick(tool)}
            >
              {tool === "voice" ? (
                "🎙 "
              ) : (
                <CommandTranslateIcon />
              )}{" "}
              {GLASS_QUICK_TOOL_LABELS[tool]}
            </button>
          ))}
        </div>
      </div>

      {pendingTranslateSetup ? (
        <TranslateModeSetup
          state={state}
          systemAudioReady={systemAudioReady}
          onStartListening={(source) => {
            setPendingTranslateSetup(false);
            if (source === "microphone") {
              tx.setMode("microphone_web_speech");
            } else {
              tx.setMode("system_audio");
            }
            if (tx.canListen || source === "microphone") queueMicrotask(() => tx.startListening());
          }}
        />
      ) : null}

      {pendingMeetingChoice ? (
        <div className="mode-panel__choice" data-testid="glass-meeting-source-choice">
          <span>How should I listen?</span>
          <div className="mode-panel__choice-buttons">
            <button
              type="button"
              className="gbtn gbtn--primary"
              data-testid="glass-meeting-source-mic"
              onClick={() => chooseMeetingSource("microphone")}
            >
              Microphone
            </button>
            <button
              type="button"
              className="gbtn gbtn--primary"
              data-testid="glass-meeting-source-system"
              onClick={() => chooseMeetingSource("system_audio")}
            >
              Computer Audio
            </button>
          </div>
        </div>
      ) : null}

      {listenNeedsAudio ? (
        <div className="mode-panel__setup" data-testid="glass-listen-setup-needed">
          <span>System Audio setup needed — choose System Audio to capture computer playback.</span>
          <button
            type="button"
            className="gbtn"
            data-testid="glass-configure-audio"
            onClick={() => {
              if (!state.panelVisible) send({ type: "toggle-panel" });
              send({ type: "set-tab", tab: "audio" });
              setListenNeedsAudio(false);
            }}
          >
            Configure Audio
          </button>
        </div>
      ) : null}

      {(activeMode || sessionLive) ? (
      <div className="mode-panel__status-row" data-testid="glass-mode-status-row">
        <span>
          {activeMode ? `${GLASS_MODE_ICONS[activeMode]} ${GLASS_MODE_PRESETS[activeMode].label}` : "None"} · {activeSourceLabel}{sessionLive ? " · Session running" : ""}
        </span>
        <button
          type="button"
          className="gbtn gbtn--danger"
          data-testid="glass-mode-stop-everything"
          onClick={() => {
            send({ type: "stop-everything" });
            send({ type: "copilot-set-mode", mode: "off" });
            setPendingMeetingChoice(false);
            setPendingTranslateSetup(false);
            setListenNeedsAudio(false);
          }}
        >
          Stop Everything
        </button>
      </div>
      ) : null}

      {activeMode === "listen" ? (
        <div className="mode-panel__listen-privacy" data-testid="glass-listen-privacy">
          <p>
            <strong>Source:</strong> Computer Audio · <strong>Mic:</strong> Off
          </p>
          <p className="mode-panel__listen-note">Your voice is not being listened to in Listen mode.</p>
          {aggregateMicWarning ? (
            <p className="mode-panel__listen-warn" data-testid="glass-listen-aggregate-warn">
              This audio source may include microphone input.
            </p>
          ) : null}
          {!listenMicOff && listening ? (
            <p className="mode-panel__listen-warn" data-testid="glass-listen-mic-warn">
              Listen mode requires computer audio only — switch back to System Audio.
            </p>
          ) : null}
        </div>
      ) : null}

      {activeMode === "meetings" ? (
        <div className="mode-panel__meetings-translate" data-testid="glass-meetings-translate">
          <MeetingsTranslateToggle state={state} />
        </div>
      ) : null}

      {activeMode === "meetings" && sessionLive && state.meetingIntelligence ? (
        <MeetingIntelPanel intel={state.meetingIntelligence} />
      ) : null}

      {activeMode === "wingman" ? (
        <WingmanPanel
          wingman={state.wingman}
          wingmanMemory={state.wingmanMemory}
          detectedApp={
            state.wingman.session?.appSnapshots.at(-1)?.app ??
            state.windowContext.status === "available" ? (state.windowContext as { status: "available"; app: string }).app : undefined
          }
        />
      ) : null}

      <TranslateActiveStatus state={state} />

      <details className="mode-panel__privacy-disclosure" data-testid="glass-mode-privacy">
        <summary className="mode-panel__privacy-summary">Privacy &amp; data notes</summary>
        <ul className="mode-panel__privacy">
          {MODE_PRIVACY_NOTES.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </details>

      <div className="mode-panel__advanced">
        <button
          type="button"
          className="gbtn gbtn--ghost"
          aria-expanded={advancedOpen}
          data-testid="glass-advanced-toggle"
          onClick={() => setAdvancedOpen((open) => !open)}
        >
          {advancedOpen ? "Hide Advanced" : "Advanced"}
        </button>

        {advancedOpen ? (
          <div className="copilot-config__drawer" data-testid="glass-copilot-drawer">
            <label className="copilot-config__field">
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
            <p className="copilot-config__mode-hint">{COPILOT_MODE_HINTS[config.mode]}</p>
            <p className="copilot-config__mode-hint" data-testid="glass-copilot-trust-boundary">
              Safe by default: no listening on launch. Diagnostic AI runs only after you approve a card.
              Refine session type uses AI on demand, not every transcript tick.
            </p>

            <label className="copilot-config__field">
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

            <label className="copilot-config__field">
              <span>Feedback level (Listen)</span>
              <select
                value={config.listenAttentionLevel}
                data-testid="glass-listen-attention-select"
                onChange={(e) =>
                  send({
                    type: "copilot-set-config",
                    patch: { listenAttentionLevel: e.target.value as ListenAttentionLevel },
                  })
                }
              >
                {(Object.keys(LISTEN_ATTENTION_LABELS) as ListenAttentionLevel[]).map((level) => (
                  <option key={level} value={level}>
                    {LISTEN_ATTENTION_LABELS[level]}
                  </option>
                ))}
              </select>
            </label>

            <label className="copilot-config__field">
              <span>Audio source</span>
              <select
                value={activeMode === "listen" ? "system_audio" : tx.selectedMode}
                disabled={activeMode === "listen"}
                data-testid="glass-copilot-audio-source-select"
                onChange={(e) => tx.setMode(e.target.value as typeof tx.selectedMode)}
              >
                {tx.modeOptions.map((mode) => (
                  <option key={mode} value={mode}>
                    {tx.modeLabels[mode]}
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
              <span>Suggestion frequency</span>
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
    </section>
  );
}
