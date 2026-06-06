import { useState } from "react";
import { send } from "../useGlassState.ts";
import {
  LIVE_TRANSLATE_LANGUAGE_LABELS,
  type LiveTranslateDisplayMode,
  type LiveTranslateSource,
  type LiveTranslateTargetLanguage,
} from "../../shared/liveTranslateTypes.ts";
import { translateSourceStatusLabel } from "../../shared/liveTranslateState.ts";
import type { GlassState } from "../../shared/ipc.ts";

const TARGETS: LiveTranslateTargetLanguage[] = ["en", "es", "pt", "fr", "de", "it"];

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
  const [target, setTarget] = useState<LiveTranslateTargetLanguage>(
    runtime?.config.targetLanguage ?? "es",
  );
  const [source, setSource] = useState<LiveTranslateSource>("system_audio");
  const [displayMode, setDisplayMode] = useState<LiveTranslateDisplayMode>("translation_only");
  const [micEnabled, setMicEnabled] = useState(false);

  const start = () => {
    send({
      type: "translate-set-config",
      patch: {
        enabled: true,
        source,
        targetLanguage: target,
        displayMode,
        captionPosition: "bottom_center",
        saveMode: source === "system_audio" ? "save_transcript" : "private_no_save",
        sourceLanguage: "auto",
      },
    });
    if (source === "microphone" || source === "both") {
      send({ type: "translate-enable-microphone", enabled: micEnabled });
    }
    send({ type: "translate-start", targetLanguage: target });
    onStartListening(source);
  };

  return (
    <div className="mode-panel__choice" data-testid="glass-translate-setup">
      <span>Translate live captions</span>
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
        <p className="mode-panel__hint">Mic stays off for computer-audio translation.</p>
      )}
      {!systemAudioReady && source !== "microphone" ? (
        <p className="mode-panel__warn">System audio setup needed for media translation.</p>
      ) : null}
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
        <strong>{labels.translationActive}</strong> · {labels.source} · {labels.mic}
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

/** Compact toggle for Listen mode — enables captions without leaving Listen. */
export function ListenTranslateToggle({ state }: { state: GlassState }): JSX.Element | null {
  const active = state.liveTranslate?.active && state.liveTranslate.config.enabled;
  return (
    <div className="live-notes__translate-toggle" data-testid="glass-listen-translate-toggle">
      <button
        type="button"
        className={`gbtn gbtn--ghost${active ? " gbtn--active" : ""}`}
        data-testid="glass-listen-translate-captions"
        onClick={() => {
          if (active) {
            send({ type: "translate-stop" });
            return;
          }
          send({
            type: "translate-set-config",
            patch: {
              enabled: true,
              source: "system_audio",
              sourceLanguage: "auto",
              targetLanguage: "es",
              displayMode: "translation_only",
              captionPosition: "bottom_center",
              saveMode: "save_transcript",
            },
          });
          send({ type: "translate-start", targetLanguage: "es" });
        }}
      >
        {active ? "Translate captions on" : "Translate captions"}
      </button>
    </div>
  );
}
