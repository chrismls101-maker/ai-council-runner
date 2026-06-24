import { useCallback, useEffect, useRef, useState } from "react";
import SwarmScene from "../onboarding/swarm/SwarmScene.tsx";
import { ModeController } from "../onboarding/swarm/ModeController.ts";
import { VoiceController } from "../onboarding/swarm/VoiceController.ts";
import { PresenceStateMachine } from "../onboarding/swarm/PresenceStateMachine.ts";
import { MODES } from "../onboarding/swarm/manifestations.ts";
import { ACTIVATION_KEY_WAIT } from "../../shared/activationCopy.ts";
import { useActivationTts } from "./useActivationTts.ts";
import "./activationKeyWait.css";

function useKeyWaitControllers() {
  const controllerRef = useRef<ModeController | null>(null);
  const voiceRef = useRef<VoiceController | null>(null);
  const presenceRef = useRef<PresenceStateMachine | null>(null);

  if (!controllerRef.current) controllerRef.current = new ModeController(MODES.waveform);
  if (!voiceRef.current) voiceRef.current = new VoiceController();
  if (!presenceRef.current) presenceRef.current = new PresenceStateMachine();

  return {
    controller: controllerRef.current,
    voice: voiceRef.current,
    presence: presenceRef.current,
  };
}

export interface ActivationKeyWaitProps {
  onReady: () => void | Promise<void>;
}

export function ActivationKeyWait({ onReady }: ActivationKeyWaitProps): JSX.Element {
  const { controller, voice, presence } = useKeyWaitControllers();
  const { speak, stop } = useActivationTts(voice);

  const [visibleLine, setVisibleLine] = useState("");
  const [textVisible, setTextVisible] = useState(false);
  const [helpDraft, setHelpDraft] = useState("");
  const [helpAnswer, setHelpAnswer] = useState<string | null>(null);
  const [helpLoading, setHelpLoading] = useState(false);
  const [readyPending, setReadyPending] = useState(false);

  const mountedRef = useRef(true);
  const spokeIntroRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    void voice.resumeContext();
    controller.setModeInstant(MODES.waveform);
    presence.set("listening");

    const run = async (): Promise<void> => {
      void window.glass.activationOpenKeysUrl();
      if (spokeIntroRef.current) return;
      spokeIntroRef.current = true;
      presence.set("speaking");
      await speak(ACTIVATION_KEY_WAIT.voiceLine, () => {
        setVisibleLine(ACTIVATION_KEY_WAIT.visibleLine);
        setTextVisible(false);
        window.requestAnimationFrame(() => setTextVisible(true));
      });
      if (!mountedRef.current) return;
      presence.set("listening");
    };

    void run();

    return () => {
      mountedRef.current = false;
      stop();
    };
  }, [controller, presence, speak, stop, voice]);

  const askHelp = useCallback(async (): Promise<void> => {
    const question = helpDraft.trim();
    if (!question || helpLoading || readyPending) return;
    setHelpLoading(true);
    setHelpAnswer(null);
    try {
      const res = await window.glass.activationAskHelp(question);
      if (!res.ok) return;
      setHelpAnswer(res.answer);
      setHelpDraft("");
      presence.set("speaking");
      await speak(res.answer, () => {
        setVisibleLine(res.answer);
        setTextVisible(false);
        window.requestAnimationFrame(() => setTextVisible(true));
      });
      if (!mountedRef.current) return;
      presence.set("listening");
    } finally {
      setHelpLoading(false);
    }
  }, [helpDraft, helpLoading, presence, readyPending, speak]);

  const handleReady = useCallback(async (): Promise<void> => {
    if (readyPending) return;
    setReadyPending(true);
    presence.set("speaking");
    await speak(ACTIVATION_KEY_WAIT.returnVoiceLine);
    if (!mountedRef.current) return;
    await onReady();
  }, [onReady, readyPending, presence, speak]);

  return (
    <div className="activation-key-wait" data-testid="activation-key-wait">
      <div className="activation-key-wait__swarm" aria-hidden="true">
        <SwarmScene
          controller={controller}
          voice={voice}
          presence={presence}
          transparentOverlay
          layout="activation"
          atomTint="sapphire"
        />
      </div>

      <div className="activation-key-wait__body">
        <p
          className={`activation-key-wait__line${textVisible && visibleLine ? " activation-key-wait__line--visible" : ""}`}
          aria-live="polite"
        >
          {visibleLine}
        </p>

        <div className="activation-key-wait__help">
          <form
            className="activation-key-wait__help-form"
            onSubmit={(e) => {
              e.preventDefault();
              void askHelp();
            }}
          >
            <input
              type="text"
              className="activation-key-wait__help-input"
              placeholder={ACTIVATION_KEY_WAIT.questionPlaceholder}
              aria-label={ACTIVATION_KEY_WAIT.questionAriaLabel}
              value={helpDraft}
              disabled={helpLoading || readyPending}
              onChange={(e) => setHelpDraft(e.target.value)}
            />
            <button
              type="submit"
              className="activation-key-wait__help-submit"
              disabled={!helpDraft.trim() || helpLoading || readyPending}
            >
              {ACTIVATION_KEY_WAIT.questionSubmitLabel}
            </button>
          </form>
          {helpAnswer ? (
            <p className="activation-key-wait__help-answer" aria-live="polite">
              {helpAnswer}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          className="activation-key-wait__ready"
          disabled={readyPending}
          onClick={() => void handleReady()}
        >
          {readyPending ? "One moment…" : ACTIVATION_KEY_WAIT.imReadyLabel}
        </button>
      </div>
    </div>
  );
}
