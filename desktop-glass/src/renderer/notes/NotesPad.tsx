import { useRef } from "react";
import { send, useGlassState } from "../useGlassState.ts";
import { useChromeWindowDrag } from "../useChromeWindowDrag.ts";
import { LiveNotesTab } from "../panel/LiveNotesTab.tsx";
import { ListenInsightStrip } from "./ListenInsightStrip.tsx";
import { formatListeningDuration } from "../../shared/audioChunks.ts";
import { copilotModeIsActive } from "../../shared/copilotTypes.ts";

/** Dedicated floating notepad for Listen mode — separate from the main panel. */
export function NotesPad(): JSX.Element {
  const state = useGlassState();
  const dragRef = useRef<HTMLDivElement | null>(null);
  useChromeWindowDrag(true, dragRef);
  const listening = state.privacy.listening;
  const listenModeActive =
    state.copilot.config.sessionType === "video_learning" &&
    copilotModeIsActive(state.copilot.config.mode) &&
    (state.session?.status === "active" || state.session?.status === "paused");
  const showTimer = listening || listenModeActive;
  const timerLabel = listening
    ? formatListeningDuration(Math.max(state.stt?.listeningElapsedMs ?? 0, 0))
    : listenModeActive
      ? "Paused"
      : "";

  return (
    <div className="notes-pad notes-pad--composer" data-testid="glass-notes-pad">
      <span className="notes-pad__sheen" aria-hidden="true" />
      <header className="notes-pad__header" ref={dragRef}>
        <div className="notes-pad__brand">
          <span className="notes-pad__dot" aria-hidden />
          <div>
            <div className="notes-pad__title-row">
              <div className="notes-pad__title">IIVO Notes</div>
              {showTimer ? (
                <span
                  className={`notes-pad__timer${!listening ? " notes-pad__timer--paused" : ""}`}
                  data-testid="glass-notes-pad-timer"
                >
                  {timerLabel}
                </span>
              ) : null}
            </div>
            <div className="notes-pad__subtitle">Live from system audio</div>
          </div>
        </div>
        <div className="notes-pad__header-actions">
          {listenModeActive ? (
            <button
              type="button"
              className="notes-pad__stop"
              data-testid="glass-notes-pad-stop"
              data-chrome-no-drag
              title={listening ? "Stop listening and hide notes" : "Stop listen session"}
              onClick={() => send({ type: "stop-everything" })}
            >
              Stop
            </button>
          ) : null}
          <button
            type="button"
            className="notes-pad__close"
            data-testid="glass-notes-pad-close"
            data-chrome-no-drag
            title="Hide notes pad"
            onClick={() => send({ type: "hide-notes-pad" })}
          >
            ✕
          </button>
        </div>
      </header>
      <div className="notes-pad__body">
        <LiveNotesTab state={state} showTranslate={false} />
      </div>
      <ListenInsightStrip insight={state.listenLiveNotes?.latestInsight} />
      <span className="notes-pad__led ui-led-line" aria-hidden="true" />
    </div>
  );
}
