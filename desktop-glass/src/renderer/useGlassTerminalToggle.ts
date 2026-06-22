import { useCallback } from "react";
import { resolveTerminalLabel } from "./dock/dockLabels.ts";
import { send, useGlassState } from "./useGlassState.ts";

/** Shared dock + builder-strip terminal open/close — same commands either way. */
export function useGlassTerminalToggle(): {
  terminalOpen: boolean;
  terminalActive: boolean;
  label: string;
  toggle: () => void;
} {
  const state = useGlassState();
  const terminalOpen = state.glassDockTerminalOpen ?? false;
  const terminalActive = !!state.glassDockTerminalId;

  const toggle = useCallback((): void => {
    send(terminalOpen ? { type: "glass-terminal-close" } : { type: "glass-terminal-open" });
  }, [terminalOpen]);

  return {
    terminalOpen,
    terminalActive,
    label: resolveTerminalLabel(terminalOpen),
    toggle,
  };
}
