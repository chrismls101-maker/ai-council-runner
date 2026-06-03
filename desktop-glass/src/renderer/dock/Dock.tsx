import { send, useGlassState } from "../useGlassState.ts";
import { StatusPill } from "../components/StatusPill.tsx";
import { SessionPill } from "../components/SessionPill.tsx";

export function Dock(): JSX.Element {
  const state = useGlassState();
  const sessionStatus = state.session?.status ?? null;
  const sessionLive = sessionStatus === "active" || sessionStatus === "paused";

  return (
    <div className="dock">
      <div className="dock__drag">
        <span className="dock__logo" />
        <span className="dock__title">IIVO Glass</span>
      </div>

      <div className="dock__pills">
        <SessionPill status={sessionStatus} />
        <StatusPill status={state.privacy.status} />
      </div>

      <div className="dock__buttons">
        <button
          className="gbtn gbtn--primary"
          onClick={() => send({ type: "ask-iivo" })}
          title="Ask IIVO with current context"
        >
          Ask IIVO
        </button>

        {!sessionLive ? (
          <button
            className="gbtn gbtn--primary"
            onClick={() => send({ type: "session-start" })}
            title="Start a work session"
          >
            Start Session
          </button>
        ) : (
          <>
            {sessionStatus === "active" ? (
              <button
                className="gbtn"
                onClick={() => send({ type: "session-pause" })}
                title="Pause the session"
              >
                Pause
              </button>
            ) : (
              <button
                className="gbtn"
                onClick={() => send({ type: "session-resume" })}
                title="Resume the session"
              >
                Resume
              </button>
            )}
            <button
              className="gbtn gbtn--danger"
              onClick={() => send({ type: "session-end" })}
              title="End the session"
            >
              End
            </button>
          </>
        )}

        <button
          className="gbtn"
          onClick={() => send(sessionLive ? { type: "session-capture" } : { type: "send-screenshot" })}
          title={sessionLive ? "Capture screen into the session timeline" : "Capture this screen and send to IIVO"}
        >
          Capture Screen
        </button>
        <button
          className="gbtn"
          onClick={() => send({ type: "save-moment" })}
          title="Save the current moment"
        >
          Save Moment
        </button>
        <button
          className="gbtn"
          onClick={() => send(state.session ? { type: "session-send" } : { type: "send-transcript" })}
          title={state.session ? "Send the whole session to IIVO" : "Send transcript to IIVO"}
        >
          {state.session ? "Send Session" : "Send to IIVO"}
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
