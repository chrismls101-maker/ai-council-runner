import { send } from "../useGlassState.ts";
import type { GlassState } from "../../shared/ipc.ts";
import type {
  GlassCopilotCardButton,
  GlassCopilotIntervention,
} from "../../shared/copilotTypes.ts";

/**
 * Session Copilot overlay — small, non-blocking interaction cards.
 *
 * Renders (in priority order): the "Turn on Copilot?" offer, the system-audio
 * silence warning, the ready debrief, and any pending suggestion cards.
 * Everything here is user-driven; copilot never acts without a click.
 */
export function CopilotOverlay({
  state,
  enterInteractive,
  leaveInteractive,
}: {
  state: GlassState;
  enterInteractive: () => void;
  leaveInteractive: () => void;
}): JSX.Element | null {
  const copilot = state.copilot;
  const showOffer = !!copilot.offer;
  const showSilence = copilot.systemAudioSilenceWarning;
  const debrief = copilot.debrief ?? null;
  const interventions = copilot.pendingInterventions;

  if (!showOffer && !showSilence && !debrief && interventions.length === 0) {
    return null;
  }

  return (
    <div
      className="overlay-copilot"
      data-testid="glass-copilot-overlay"
      onMouseEnter={enterInteractive}
      onMouseLeave={leaveInteractive}
    >
      {showOffer ? (
        <article className="overlay-copilot-card" data-testid="glass-copilot-offer">
          <div className="overlay-copilot-card__eyebrow">Session Copilot</div>
          <div className="overlay-copilot-card__title">Turn on Session Copilot?</div>
          <p className="overlay-copilot-card__body">
            You started system audio. Copilot can quietly extract ideas, actions, and risks.
          </p>
          <div className="overlay-copilot-card__actions">
            <button
              type="button"
              className="gbtn gbtn--primary"
              onClick={() => send({ type: "copilot-accept-offer", mode: "passive" })}
            >
              Passive
            </button>
            <button
              type="button"
              className="gbtn"
              onClick={() => send({ type: "copilot-accept-offer", mode: "coaching" })}
            >
              Coaching
            </button>
            <button
              type="button"
              className="gbtn gbtn--ghost"
              onClick={() => send({ type: "copilot-dismiss-offer" })}
            >
              No
            </button>
          </div>
        </article>
      ) : null}

      {showSilence ? (
        <article className="overlay-copilot-card" data-testid="glass-copilot-silence">
          <div className="overlay-copilot-card__eyebrow">Session Copilot</div>
          <div className="overlay-copilot-card__title">No audio detected.</div>
          <p className="overlay-copilot-card__body">Pause system listening?</p>
          <div className="overlay-copilot-card__actions">
            <button
              type="button"
              className="gbtn gbtn--primary"
              onClick={() => send({ type: "copilot-pause-system-audio" })}
            >
              Pause
            </button>
            <button
              type="button"
              className="gbtn gbtn--ghost"
              onClick={() => send({ type: "copilot-dismiss-silence-warning" })}
            >
              Keep listening
            </button>
          </div>
        </article>
      ) : null}

      {debrief ? (
        <article className="overlay-copilot-card overlay-copilot-card--debrief" data-testid="glass-copilot-debrief">
          <div className="overlay-copilot-card__eyebrow">Session Debrief</div>
          <pre className="overlay-copilot-card__debrief-body">{debrief.markdown}</pre>
          <div className="overlay-copilot-card__actions">
            <button
              type="button"
              className="gbtn gbtn--primary"
              onClick={() => send({ type: "copilot-open-debrief-in-iivo" })}
            >
              Open in IIVO
            </button>
            <button
              type="button"
              className="gbtn gbtn--ghost"
              onClick={() => send({ type: "copilot-dismiss-debrief" })}
            >
              Dismiss
            </button>
          </div>
        </article>
      ) : null}

      {interventions.map((iv) => (
        <CopilotInterventionCard key={iv.id} intervention={iv} />
      ))}
    </div>
  );
}

function CopilotInterventionCard({
  intervention,
}: {
  intervention: GlassCopilotIntervention;
}): JSX.Element {
  return (
    <article className="overlay-copilot-card" data-testid="glass-copilot-card">
      <div className="overlay-copilot-card__eyebrow">Copilot</div>
      <div className="overlay-copilot-card__title">{intervention.title}</div>
      <p className="overlay-copilot-card__body">{intervention.body}</p>
      <div className="overlay-copilot-card__actions">
        {intervention.buttons.map((button: GlassCopilotCardButton) => (
          <button
            key={button.action}
            type="button"
            className={`gbtn${button.primary ? " gbtn--primary" : " gbtn--ghost"}`}
            data-action={button.action}
            onClick={() =>
              send({ type: "copilot-card-action", id: intervention.id, action: button.action })
            }
          >
            {button.label}
          </button>
        ))}
      </div>
    </article>
  );
}
