import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useTranscription, type TranscriptionController } from "./useTranscription.ts";

const TranscriptionContext = createContext<TranscriptionController | null>(null);

const PANEL_ONLY_TRANSCRIPTION_COMMANDS = new Set([
  "start",
  "stop",
  "probe-microphone",
  "probe-virtual-audio-devices",
  "connect-system-audio",
  "test-system-audio",
  "test-blackhole",
  "startup-audio-restore",
]);

function isPanelTranscriptionOwner(): boolean {
  return /panel\.html$/i.test(window.location.pathname);
}

export function TranscriptionProvider({ children }: { children: ReactNode }): JSX.Element {
  const tx = useTranscription();
  const panelOwner = isPanelTranscriptionOwner();

  useEffect(() => {
    const unsubscribe = window.glass.onTranscriptionControl((command) => {
      if (PANEL_ONLY_TRANSCRIPTION_COMMANDS.has(command.type) && !panelOwner) {
        return;
      }
      if (command.type === "start") {
        tx.beginListeningCapture(command.mode);
      } else if (command.type === "stop") {
        tx.stopListeningLocal();
      } else if (command.type === "probe-microphone") {
        void tx.probeMicrophone();
      } else if (command.type === "probe-virtual-audio-devices") {
        void tx.probeVirtualAudioDevices();
      } else if (command.type === "test-system-audio") {
        void tx.testSystemAudio();
      } else if (command.type === "connect-system-audio") {
        void tx.connectSystemAudio();
      } else if (command.type === "test-blackhole") {
        void tx.testBlackHole();
      } else if (command.type === "startup-audio-restore") {
        void tx.restoreStartupAudio();
      } else if (command.type === "deepgram-whisper-fallback") {
        tx.activateWhisperFallback(command.scope);
      }
    });
    return unsubscribe;
  }, [tx, panelOwner]);

  return <TranscriptionContext.Provider value={tx}>{children}</TranscriptionContext.Provider>;
}

export function useTranscriptionContext(): TranscriptionController {
  const ctx = useContext(TranscriptionContext);
  if (!ctx) {
    throw new Error("useTranscriptionContext must be used within TranscriptionProvider");
  }
  return ctx;
}
