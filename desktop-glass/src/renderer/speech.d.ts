/** Minimal Web Speech API types for Electron renderer (not in default TS lib). */

interface GlassSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: GlassSpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

interface GlassSpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface GlassSpeechRecognitionConstructor {
  new (): GlassSpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: GlassSpeechRecognitionConstructor;
    webkitSpeechRecognition?: GlassSpeechRecognitionConstructor;
  }
}

export type { GlassSpeechRecognition, GlassSpeechRecognitionEvent };
