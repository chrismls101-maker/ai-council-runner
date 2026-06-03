import { send, useGlassState } from "../useGlassState.ts";
import { StatusPill } from "../components/StatusPill.tsx";

export function Dock(): JSX.Element {
  const state = useGlassState();
  const listening = state.privacy.listening;

  return (
    <div className="dock">
      <div className="dock__drag">
        <span className="dock__logo" />
        <span className="dock__title">IIVO Glass</span>
      </div>

      <StatusPill status={state.privacy.status} />

      <div className="dock__buttons">
        <button
          className="gbtn gbtn--primary"
          onClick={() => send({ type: "ask-iivo" })}
          title="Ask IIVO with current context"
        >
          Ask IIVO
        </button>
        <button
          className="gbtn"
          onClick={() => send({ type: "send-screenshot" })}
          title="Capture this screen and send to IIVO"
        >
          Capture Screen
        </button>
        {listening ? (
          <button
            className="gbtn gbtn--danger"
            onClick={() => send({ type: "pause" })}
            title="Pause listening"
          >
            Pause
          </button>
        ) : (
          <button
            className="gbtn"
            onClick={() => send({ type: "start-listening" })}
            title="Start listening"
          >
            Start Listening
          </button>
        )}
        <button
          className="gbtn"
          onClick={() => send({ type: "save-moment" })}
          title="Save the current moment"
        >
          Save Moment
        </button>
        <button
          className="gbtn"
          onClick={() => send({ type: "send-transcript" })}
          title="Send transcript to IIVO"
        >
          Send to IIVO
        </button>
        <button
          className="gbtn gbtn--ghost gbtn--icon"
          onClick={() => send({ type: "toggle-panel" })}
          title="Toggle intelligence panel"
        >
          Panel
        </button>
        <button
          className="gbtn gbtn--ghost gbtn--icon"
          onClick={() => send({ type: "open-chat" })}
          title="Open IIVO chat in browser"
        >
          Open IIVO
        </button>
      </div>
    </div>
  );
}
