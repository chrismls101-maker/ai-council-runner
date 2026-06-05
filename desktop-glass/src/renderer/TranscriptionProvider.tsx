import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useTranscription, type TranscriptionController } from "./useTranscription.ts";

const TranscriptionContext = createContext<TranscriptionController | null>(null);

export function TranscriptionProvider({ children }: { children: ReactNode }): JSX.Element {
  const tx = useTranscription();

  useEffect(() => {
    const unsubscribe = window.glass.onTranscriptionControl((command) => {
      if (command.type === "start") {
        tx.startListening();
      } else if (command.type === "stop") {
        tx.stopListeningLocal();
      } else if (command.type === "probe-microphone") {
        void tx.probeMicrophone();
      } else if (command.type === "probe-virtual-audio-devices") {
        void tx.probeVirtualAudioDevices();
      } else if (command.type === "test-system-audio") {
        void tx.testSystemAudio();
      } else if (command.type === "test-blackhole") {
        void tx.testBlackHole();
      }
    });
    return unsubscribe;
  }, [tx]);

  return <TranscriptionContext.Provider value={tx}>{children}</TranscriptionContext.Provider>;
}

export function useTranscriptionContext(): TranscriptionController {
  const ctx = useContext(TranscriptionContext);
  if (!ctx) {
    throw new Error("useTranscriptionContext must be used within TranscriptionProvider");
  }
  return ctx;
}
