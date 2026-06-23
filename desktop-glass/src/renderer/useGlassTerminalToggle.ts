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
  const ideActive = state.glassIdeActive === true;
  const terminalOpen = ideActive
    ? (state.glassIdeTerminalExpanded ?? false)
    : (state.glassDockTerminalOpen ?? false);
  const terminalActive = !!state.glassDockTerminalId;

  const toggle = useCallback((): void => {
    if (ideActive) {
      send({
        type: "glass-ide-terminal-set-expanded",
        expanded: !terminalOpen,
        manual: true,
      });
      return;
    }
    send(terminalOpen ? { type: "glass-terminal-close" } : { type: "glass-terminal-open" });
  }, [ideActive, terminalOpen]);

  return {
    terminalOpen,
    terminalActive,
    label: resolveTerminalLabel(terminalOpen),
    toggle,
  };
}
