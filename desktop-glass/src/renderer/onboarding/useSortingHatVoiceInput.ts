import { useEffect, useRef, useState } from "react";
import { speechRecognitionLang, type GlassUiLocale } from "../../shared/glassLocale.ts";
import type { GlassSpeechRecognition } from "../speech.d.ts";

type SpeechRecognitionCtor = new () => GlassSpeechRecognition;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const VOICE_INPUT_PHASES = new Set([
  "waiting-name",
  "waiting-answer-1",
  "waiting-answer-2",
  "qa",
]);

export interface SortingHatVoiceInput {
  listening: boolean;
  supported: boolean;
  interimText: string;
}

/**
 * Auto-starts Web Speech when onboarding prompts for input.
 * Final transcripts fill the draft; optional auto-submit after a short pause.
 */
export function useSortingHatVoiceInput(options: {
  locale: GlassUiLocale;
  phase: string;
  enabled: boolean;
  onDraft: (text: string) => void;
  onAutoSubmit: (text: string) => void;
}): SortingHatVoiceInput {
  const { locale, phase, enabled, onDraft, onAutoSubmit } = options;
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const supported = getSpeechRecognition() != null;

  const recognitionRef = useRef<GlassSpeechRecognition | null>(null);
  const submitTimerRef = useRef<number | null>(null);
  const onDraftRef = useRef(onDraft);
  const onAutoSubmitRef = useRef(onAutoSubmit);
  onDraftRef.current = onDraft;
  onAutoSubmitRef.current = onAutoSubmit;

  const shouldListen = enabled && supported && VOICE_INPUT_PHASES.has(phase);

  useEffect(() => {
    if (!shouldListen) {
      if (submitTimerRef.current) {
        window.clearTimeout(submitTimerRef.current);
        submitTimerRef.current = null;
      }
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setListening(false);
      setInterimText("");
      return;
    }

    const Ctor = getSpeechRecognition();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = speechRecognitionLang(locale);
    const activeRef = { current: true };

    recognition.onresult = (event) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const part = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) finalText += part;
        else interim += part;
      }
      setInterimText(interim.trim());
      if (finalText.trim()) {
        setInterimText("");
        onDraftRef.current(finalText.trim());
        if (submitTimerRef.current) window.clearTimeout(submitTimerRef.current);
        submitTimerRef.current = window.setTimeout(() => {
          submitTimerRef.current = null;
          onAutoSubmitRef.current(finalText.trim());
        }, 900);
      }
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      if (!activeRef.current) return;
      try {
        recognition.start();
      } catch {
        setListening(false);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
    }

    return () => {
      activeRef.current = false;
      if (submitTimerRef.current) {
        window.clearTimeout(submitTimerRef.current);
        submitTimerRef.current = null;
      }
      recognitionRef.current = null;
      recognition.stop();
      setListening(false);
      setInterimText("");
    };
  }, [shouldListen, locale]);

  return { listening, supported, interimText };
}
