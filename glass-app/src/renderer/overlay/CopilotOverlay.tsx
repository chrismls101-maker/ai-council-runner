import { useEffect } from "react";
import { formatOverlayPlainText } from "../../shared/overlayPlainText.ts";
import { ensureOverlayInteractive, handlePaletteListWheel } from "../glassTextInteraction.ts";
import { send } from "../useGlassState.ts";
import type { GlassState } from "../../shared/ipc.ts";
import type {
  GlassCopilotCardButton,
  GlassCopilotIntervention,
} from "../../shared/copilotTypes.ts";
import type { GlassCopilotDiagnosticResult } from "../../shared/copilotDiagnosticAnalysis.ts";
import { deriveActiveListeningMode } from "../../shared/activeListeningContext.ts";
import { copilotModeIsActive } from "../../shared/copilotTypes.ts";

function isListenModeActive(state: GlassState): boolean {
  const sessionLive =
    state.session?.status === "active" || state.session?.status === "paused";
  return (
    deriveActiveListeningMode(
      state.copilot.config,
      sessionLive && copilotModeIsActive(state.copilot.config.mode),
    ) === "listen" && state.privacy.listening
  );
}

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
  const showListeningLimit = copilot.listeningLimitReached;
  const showSilence = copilot.systemAudioSilenceWarning && state.privacy.listening;
  const diagnosticResult = copilot.diagnosticResult ?? null;
  const diagnosticAnalyzing = copilot.diagnosticAnalyzing ?? false;
  const listenMode = isListenModeActive(state);
  const interventions = listenMode ? [] : copilot.pendingInterventions;

  const hasInteractiveCards =
    showOffer ||
    showListeningLimit ||
    showSilence ||
    !!diagnosticResult ||
    diagnosticAnalyzing ||
    interventions.length > 0;

  useEffect(() => {
    window.glass.setCopilotOverlayCardOpen?.(hasInteractiveCards);
    return () => {
      window.glass.setCopilotOverlayCardOpen?.(false);
    };
  }, [hasInteractiveCards]);

  if (
    !showOffer &&
    !showListeningLimit &&
    !showSilence &&
    !diagnosticResult &&
    !diagnosticAnalyzing &&
    interventions.length === 0
  ) {
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

      {showListeningLimit ? (
        <article className="overlay-copilot-card" data-testid="glass-listening-limit">
          <div className="overlay-copilot-card__eyebrow">Listening</div>
          <div className="overlay-copilot-card__title">Listening limit reached. Continue?</div>
          <p className="overlay-copilot-card__body">
            You reached the max listening duration. Continue for 15 more minutes or stop now.
          </p>
          <div className="overlay-copilot-card__actions">
            <button
              type="button"
              className="gbtn gbtn--primary"
              onClick={() => send({ type: "copilot-listening-limit-continue" })}
            >
              Continue 15 min
            </button>
            <button
              type="button"
              className="gbtn gbtn--ghost"
              onClick={() => send({ type: "copilot-listening-limit-stop" })}
            >
              Stop Listening
            </button>
          </div>
        </article>
      ) : null}

      {showSilence && listenMode ? (
        <article className="overlay-copilot-card" data-testid="glass-listen-silence-status">
          <div className="overlay-copilot-card__eyebrow">Listen Mode</div>
          <div className="overlay-copilot-card__title">No audio detected — still listening</div>
          <p className="overlay-copilot-card__body">
            Play audio on your Mac or check BlackHole routing. You can keep listening or stop now.
          </p>
          <div className="overlay-copilot-card__actions">
            <button
              type="button"
              className="gbtn gbtn--primary"
              onClick={() => send({ type: "copilot-dismiss-silence-warning" })}
            >
              Keep listening
            </button>
            <button
              type="button"
              className="gbtn gbtn--ghost"
              onClick={() => send({ type: "pause" })}
            >
              Pause
            </button>
            <button
              type="button"
              className="gbtn gbtn--ghost"
              onClick={() => send({ type: "stop-everything" })}
            >
              Stop Listening
            </button>
          </div>
        </article>
      ) : showSilence ? (
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

      {diagnosticAnalyzing ? (
        <article className="overlay-copilot-card" data-testid="glass-copilot-diagnostic-loading">
          <div className="overlay-copilot-card__eyebrow">Diagnostic</div>
          <div className="overlay-copilot-card__title">Analyzing the issue…</div>
          <p className="overlay-copilot-card__body">Direct AI diagnosis in progress (not Council).</p>
        </article>
      ) : null}

      {diagnosticResult ? (
        <DiagnosticResultCard result={diagnosticResult} />
      ) : null}

      {interventions.map((iv) => (
        <CopilotInterventionCard key={iv.id} intervention={iv} />
      ))}
    </div>
  );
}

function DiagnosticResultCard({ result }: { result: GlassCopilotDiagnosticResult }): JSX.Element {
  return (
    <article
      className="overlay-copilot-card glass-answer-shell glass-answer-shell--auto"
      data-testid="glass-copilot-diagnostic-result"
      onMouseEnter={ensureOverlayInteractive}
      onPointerDownCapture={ensureOverlayInteractive}
    >
      <span className="glass-answer-shell__sheen" aria-hidden="true" />
      <div className="glass-answer-shell__content">
        <div className="overlay-copilot-card__eyebrow">Diagnostic</div>
        <div className="overlay-copilot-card__title">{result.rootCauseSummary}</div>
        <pre
          className="overlay-copilot-card__debrief-body overlay-copilot-card__debrief-body--auto"
          onWheel={handlePaletteListWheel}
        >
          {formatOverlayPlainText(result.fullMarkdown || result.probableRootCause)}
        </pre>
        <div className="overlay-copilot-card__actions">
          <button
            type="button"
            className="gbtn"
            onClick={() => send({ type: "copilot-save-diagnostic-result" })}
          >
            Save
          </button>
          <button
            type="button"
            className="gbtn gbtn--primary"
            onClick={() => send({ type: "copilot-open-diagnostic-in-iivo" })}
          >
            Open in IIVO
          </button>
          <button
            type="button"
            className="gbtn gbtn--ghost"
            onClick={() => send({ type: "copilot-dismiss-diagnostic-result" })}
          >
            Dismiss
          </button>
        </div>
      </div>
      <span className="glass-answer-shell__led ui-led-line" aria-hidden="true" />
    </article>
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
