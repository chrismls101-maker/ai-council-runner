import { useCallback, useEffect, useState } from "react";
import type { GlassPathway, GlassPathwayStage, PathwayLiveSession } from "../../shared/glassPathwaysTypes.ts";
import {
  buildEscortObservePrompt,
  buildPrivacyHandoffInstructions,
  detectStagePrivacyHandoff,
  inferPathwayEscortTargets,
  type PathwayEscortTarget,
} from "../../shared/glassPathwaysEscort.ts";
import { prepareGlassTextPointerDown } from "../glassTextInteraction.ts";
import { send, useGlassState } from "../useGlassState.ts";

const PRIVACY_DURATION_MS = 30 * 60 * 1000;

interface GlassPathwayEscortPanelProps {
  pathway: GlassPathway;
  stage: GlassPathwayStage;
  liveSession: PathwayLiveSession | null;
  onBeginEscort: (target: PathwayEscortTarget) => void;
  onBeginPrivacy: (reason: string) => void;
  onResumeFromPrivacy: () => void;
}

export function GlassPathwayEscortPanel({
  pathway,
  stage,
  liveSession,
  onBeginEscort,
  onBeginPrivacy,
  onResumeFromPrivacy,
}: GlassPathwayEscortPanelProps): JSX.Element {
  const glassState = useGlassState();
  const privacy = detectStagePrivacyHandoff(stage, pathway);
  const targets = inferPathwayEscortTargets(stage, pathway);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launchingId, setLaunchingId] = useState<string | null>(null);

  const sessionForStage =
    liveSession?.pathwayId === pathway.id && liveSession.stageId === stage.id
      ? liveSession
      : null;
  const companionPrivacyActive = glassState.companionPrivacy?.active === true;
  const privacyHandoffActive =
    (pathway.status === "privacy_handoff" && pathway.pendingHandoff?.stageId === stage.id && companionPrivacyActive)
    || (sessionForStage?.mode === "privacy" && companionPrivacyActive);

  useEffect(() => {
    if (privacyHandoffActive && !companionPrivacyActive) {
      onResumeFromPrivacy();
    }
  }, [privacyHandoffActive, companionPrivacyActive, onResumeFromPrivacy]);

  const handleTakeMeThere = useCallback(
    async (target: PathwayEscortTarget): Promise<void> => {
      setLaunchError(null);
      setLaunchingId(target.id);
      try {
        const res = await window.glass.glassPathwaysEscortLaunch({
          kind: target.kind,
          destination: target.destination,
        });
        if (!res.ok) {
          setLaunchError(res.error ?? "Could not open destination");
          return;
        }
        onBeginEscort(target);
        send({
          type: "prefill-command-bar",
          text: buildEscortObservePrompt(pathway, stage, target.label),
        });
      } catch (err) {
        setLaunchError(err instanceof Error ? err.message : "Could not open destination");
      } finally {
        setLaunchingId(null);
      }
    },
    [onBeginEscort, pathway, stage],
  );

  const handleStartPrivacy = useCallback((): void => {
    send({ type: "companion-privacy-start", durationMs: PRIVACY_DURATION_MS });
    onBeginPrivacy(privacy.reason);
  }, [onBeginPrivacy, privacy.reason]);

  const handleResume = useCallback((): void => {
    send({ type: "companion-privacy-end" });
    onResumeFromPrivacy();
  }, [onResumeFromPrivacy]);

  return (
    <section className="gpw-escort" data-testid="glass-pathway-escort-panel">
      {privacyHandoffActive ? (
        <div className="gpw-escort__banner gpw-escort__banner--privacy" role="status">
          <strong>Privacy handoff active</strong>
          <p>Aletheia is paused while you complete this step privately.</p>
          {pathway.pendingHandoff?.reason || sessionForStage?.privacyReason ? (
            <p className="gpw-escort__banner-detail">
              {pathway.pendingHandoff?.reason ?? sessionForStage?.privacyReason}
            </p>
          ) : null}
          <button
            type="button"
            className="gpw-btn gpw-btn--primary"
            onClick={handleResume}
            data-testid="glass-pathways-privacy-resume"
          >
            I&apos;m ready — come back
          </button>
        </div>
      ) : sessionForStage?.mode === "escort" ? (
        <div className="gpw-escort__banner gpw-escort__banner--escort" role="status">
          <strong>Escort mode</strong>
          <p>
            Opened {sessionForStage.targetLabel ?? "your destination"}.
            Ask Aletheia in the command bar for observational guidance.
          </p>
        </div>
      ) : null}

      {privacy.needed && !privacyHandoffActive ? (
        <div className="gpw-escort__privacy-offer">
          <h3 className="gpw-escort__heading">Privacy handoff</h3>
          <p className="gpw-escort__text">{privacy.reason}</p>
          <p className="gpw-escort__hint">
            Aletheia will pause observation until you explicitly return.
          </p>
          <button
            type="button"
            className="gpw-btn gpw-btn--secondary"
            onClick={handleStartPrivacy}
            data-testid="glass-pathways-privacy-start"
          >
            Go private for this step
          </button>
          <p className="gpw-escort__private-note">
            {buildPrivacyHandoffInstructions(stage, privacy.reason)}
          </p>
        </div>
      ) : null}

      {targets.length > 0 ? (
        <div className="gpw-escort__targets">
          <h3 className="gpw-escort__heading">Take me there</h3>
          <p className="gpw-escort__hint">
            Opens the relevant place and prefills observational guidance — Aletheia guides, you act.
          </p>
          <ul className="gpw-escort__target-list">
            {targets.map((target) => (
              <li key={target.id}>
                <button
                  type="button"
                  className="gpw-btn gpw-btn--secondary gpw-escort__target-btn"
                  onClick={() => void handleTakeMeThere(target)}
                  onPointerDown={prepareGlassTextPointerDown}
                  disabled={
                    launchingId === target.id
                    || privacyHandoffActive
                    || sessionForStage?.mode === "execution"
                    || sessionForStage?.mode === "connector"
                  }
                  data-testid={`glass-pathways-escort-${target.id}`}
                >
                  {launchingId === target.id ? "Opening…" : target.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {launchError ? (
        <p className="gpw-error" role="alert">{launchError}</p>
      ) : null}
    </section>
  );
}
