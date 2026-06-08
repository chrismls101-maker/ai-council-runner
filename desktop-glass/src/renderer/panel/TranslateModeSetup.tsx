import { useState } from "react";
import { send } from "../useGlassState.ts";
import {
  LIVE_TRANSLATE_LANGUAGE_LABELS,
  type LiveTranslateDisplayMode,
  type LiveTranslateSaveMode,
  type LiveTranslateSource,
  type LiveTranslateTargetLanguage,
  type LiveTranslateWorkflowMode,
} from "../../shared/liveTranslateTypes.ts";
import { configDefaultsForMode, saveModeStatusLabel, buildTranslateStartPatch } from "../../shared/liveTranslateConfig.ts";
import { translateSourceStatusLabel } from "../../shared/liveTranslateState.ts";
import type { GlassState } from "../../shared/ipc.ts";

const TARGETS: LiveTranslateTargetLanguage[] = ["en", "es", "pt", "fr", "de", "it"];

function startTranslateConfig(
  mode: LiveTranslateWorkflowMode,
  source: LiveTranslateSource,
  target: LiveTranslateTargetLanguage,
  displayMode: LiveTranslateDisplayMode,
  saveMode: LiveTranslateSaveMode,
): void {
  send({
    type: "translate-set-config",
    patch: { ...buildTranslateStartPatch(mode, target, saveMode), source, displayMode },
  });
}

export function TranslateModeSetup({
  state,
  systemAudioReady,
  onStartListening,
}: {
  state: GlassState;
  systemAudioReady: boolean;
  onStartListening: (source: LiveTranslateSource) => void;
}): JSX.Element {
  const runtime = state.liveTranslate;
  const [workflowMode, setWorkflowMode] = useState<LiveTranslateWorkflowMode>(
    runtime?.config.mode ?? "media",
  );
  const modeDefaults = configDefaultsForMode(workflowMode);
  const [target, setTarget] = useState<LiveTranslateTargetLanguage>(
    runtime?.config.targetLanguage ?? "es",
  );
  const [source, setSource] = useState<LiveTranslateSource>(modeDefaults.source ?? "system_audio");
  const [displayMode, setDisplayMode] = useState<LiveTranslateDisplayMode>(
    modeDefaults.displayMode ?? "translation_only",
  );
  const [saveMode, setSaveMode] = useState<LiveTranslateSaveMode>("private_no_save");
  const [micEnabled, setMicEnabled] = useState(false);

  const onModeChange = (mode: LiveTranslateWorkflowMode) => {
    setWorkflowMode(mode);
    const defaults = configDefaultsForMode(mode);
    if (defaults.displayMode) setDisplayMode(defaults.displayMode);
    if (defaults.source) setSource(defaults.source);
    setSaveMode("private_no_save");
  };

  const start = () => {
    startTranslateConfig(workflowMode, source, target, displayMode, saveMode);
    if (source === "microphone" || source === "both") {
      send({ type: "translate-enable-microphone", enabled: micEnabled });
    }
    send({ type: "translate-start", targetLanguage: target });
    onStartListening(source);
  };

  return (
    <div className="mode-panel__choice" data-testid="glass-translate-setup">
      <span>Live Translate</span>
      <div className="mode-panel__choice-buttons">
        <button
          type="button"
          className="gbtn gbtn--primary"
          data-testid="glass-translate-mode-media"
          onClick={() => onModeChange("media")}
          aria-pressed={workflowMode === "media"}
        >
          Media Captions
        </button>
        <button
          type="button"
          className="gbtn gbtn--primary"
          data-testid="glass-translate-mode-conversation"
          onClick={() => onModeChange("conversation")}
          aria-pressed={workflowMode === "conversation"}
        >
          Conversation Captions
        </button>
      </div>
      <label className="mode-panel__field">
        Target language
        <select
          data-testid="glass-translate-target-language"
          value={target}
          onChange={(e) => setTarget(e.target.value as LiveTranslateTargetLanguage)}
        >
          {TARGETS.map((code) => (
            <option key={code} value={code}>
              {LIVE_TRANSLATE_LANGUAGE_LABELS[code]}
            </option>
          ))}
        </select>
      </label>
      <label className="mode-panel__field">
        Display
        <select
          data-testid="glass-translate-display-mode"
          value={displayMode}
          onChange={(e) => setDisplayMode(e.target.value as LiveTranslateDisplayMode)}
        >
          <option value="translation_only">Translation only</option>
          <option value="original_and_translation">Original + translation</option>
        </select>
      </label>
      <label className="mode-panel__field">
        Save captions
        <select
          data-testid="glass-translate-save-mode"
          value={saveMode}
          onChange={(e) => setSaveMode(e.target.value as LiveTranslateSaveMode)}
        >
          <option value="private_no_save">Off — private, no save</option>
          <option value="save_translation">Save translation only</option>
          <option value="save_original_and_translation">Save original + translation</option>
        </select>
      </label>
      <div className="mode-panel__choice-buttons">
        <button
          type="button"
          className="gbtn gbtn--primary"
          data-testid="glass-translate-source-system"
          onClick={() => setSource("system_audio")}
          aria-pressed={source === "system_audio"}
        >
          Computer Audio
        </button>
        <button
          type="button"
          className="gbtn"
          data-testid="glass-translate-source-mic"
          onClick={() => {
            setSource("microphone");
            setMicEnabled(true);
          }}
          aria-pressed={source === "microphone"}
        >
          Microphone
        </button>
      </div>
      {source === "microphone" ? (
        <p className="mode-panel__warn" data-testid="glass-translate-mic-warning">
          Microphone translation active — enable only for conversations you choose to capture.
        </p>
      ) : (
        <p className="mode-panel__hint" data-testid="glass-translate-mic-off-hint">
          Mic stays off for computer-audio translation.
        </p>
      )}
      {!systemAudioReady && source !== "microphone" ? (
        <p className="mode-panel__warn">System audio setup needed for media translation.</p>
      ) : null}
      <p className="mode-panel__hint" data-testid="glass-translate-privacy-hint">
        {saveModeStatusLabel(saveMode)} · Source: Computer Audio · Mic: Off until enabled
      </p>
      <button
        type="button"
        className="gbtn gbtn--primary"
        data-testid="glass-translate-start"
        onClick={start}
      >
        Start Translate
      </button>
    </div>
  );
}

export function TranslateActiveStatus({ state }: { state: GlassState }): JSX.Element | null {
  const runtime = state.liveTranslate;
  if (!runtime?.active) return null;
  const micOn =
    state.privacy.listening &&
    (state.transcriptionMode === "microphone_web_speech" ||
      state.transcriptionMode === "microphone_media_recorder");
  const labels = translateSourceStatusLabel(runtime, micOn);
  return (
    <div className="mode-panel__translate-status" data-testid="glass-translate-status">
      <p>
        <strong>{labels.translationActive}</strong> · {labels.source} · {labels.mic} · {labels.save}
      </p>
      <div className="mode-panel__choice-buttons">
        <button
          type="button"
          className="gbtn"
          data-testid="glass-translate-show-captions"
          onClick={() => send({ type: "translate-set-captions-visible", visible: true })}
        >
          Show Captions
        </button>
        <button
          type="button"
          className="gbtn gbtn--danger"
          data-testid="glass-translate-stop"
          onClick={() => send({ type: "translate-stop" })}
        >
          Stop Translation
        </button>
      </div>
    </div>
  );
}

/** Shared toggle — Listen and Meetings can enable translated captions in parallel. */
export function ShowTranslatedCaptionsToggle({
  state,
  mode,
  testId,
}: {
  state: GlassState;
  mode: LiveTranslateWorkflowMode;
  testId: string;
}): JSX.Element {
  const active = state.liveTranslate?.active && state.liveTranslate.config.enabled;
  const defaults = configDefaultsForMode(mode);
  const targetLanguage = state.liveTranslate?.config.targetLanguage ?? "es";

  return (
    <div className="live-notes__translate-toggle" data-testid={testId}>
      <button
        type="button"
        className={`gbtn gbtn--ghost${active ? " gbtn--active" : ""}`}
        data-testid={`${testId}-button`}
        onClick={() => {
          if (active) {
            send({ type: "translate-stop" });
            return;
          }
          startTranslateConfig(
            mode,
            defaults.source ?? "system_audio",
            targetLanguage,
            defaults.displayMode ?? "translation_only",
            "private_no_save",
          );
          send({ type: "translate-start", targetLanguage });
        }}
      >
        {active ? "Show translated captions (on)" : "Show translated captions"}
      </button>
    </div>
  );
}

/** Compact toggle for Listen mode — enables captions without leaving Listen. */
export function ListenTranslateToggle({ state }: { state: GlassState }): JSX.Element {
  return <ShowTranslatedCaptionsToggle state={state} mode="media" testId="glass-listen-translate-toggle" />;
}

/** Compact toggle for Meetings mode. */
export function MeetingsTranslateToggle({ state }: { state: GlassState }): JSX.Element {
  return (
    <ShowTranslatedCaptionsToggle state={state} mode="conversation" testId="glass-meetings-translate-toggle" />
  );
}
