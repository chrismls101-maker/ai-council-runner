/** Compact dock labels when stacked vertically (narrow pill). */

export type DockActionLabels = {
  startSession: string;
  capture: string;
  pause: string;
  resume: string;
  end: string;
  stopListening: string;
  overlayToggle: string;
  panelToggle: string;
  stopEverything: string;
};

export function dockActionLabels(
  vertical: boolean,
  opts: { overlayVisible: boolean; panelVisible: boolean },
): DockActionLabels {
  if (!vertical) {
    return {
      startSession: "Start Session",
      capture: "Capture",
      pause: "Pause",
      resume: "Resume",
      end: "End",
      stopListening: "Stop Listening",
      overlayToggle: opts.overlayVisible ? "Hide Overlay" : "Show Overlay",
      panelToggle: opts.panelVisible ? "Close Panel" : "Open Panel",
      stopEverything: "Stop Everything",
    };
  }

  return {
    startSession: "Start",
    capture: "Capture",
    pause: "Pause",
    resume: "Resume",
    end: "End",
    stopListening: "Stop Mic",
    overlayToggle: opts.overlayVisible ? "Hide" : "Show",
    panelToggle: opts.panelVisible ? "Close" : "Open",
    stopEverything: "Stop",
  };
}
