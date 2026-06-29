import type { GlassPathway, GlassPathwayStage } from "../../shared/glassPathwaysTypes.ts";
import {
  recommendedNextMove,
  resolveFocusStage,
  resolveNextStage,
} from "../../shared/glassPathwaysGuidance.ts";
import { prepareGlassTextPointerDown } from "../glassTextInteraction.ts";

interface GlassPathwayGuidanceCardProps {
  pathway: GlassPathway;
  onOpenStage: (stageId: string) => void;
}

export function GlassPathwayGuidanceCard({
  pathway,
  onOpenStage,
}: GlassPathwayGuidanceCardProps): JSX.Element | null {
  const focus = resolveFocusStage(pathway);
  if (!focus) return null;

  const next = resolveNextStage(pathway, focus);
  const move = recommendedNextMove(focus, pathway);
  const allComplete = pathway.stages.every((s) => s.status === "completed");

  if (allComplete) {
    return (
      <section className="gpw-guidance gpw-guidance--complete" data-testid="glass-pathway-guidance">
        <p className="gpw-guidance__complete">Every stage is complete — you finished this pathway.</p>
      </section>
    );
  }

  return (
    <section className="gpw-guidance" data-testid="glass-pathway-guidance">
      <div className="gpw-guidance__focus">
        <span className="gpw-guidance__label">Current focus</span>
        <button
          type="button"
          className="gpw-guidance__stage-link"
          onClick={() => onOpenStage(focus.id)}
          onPointerDown={prepareGlassTextPointerDown}
        >
          <span className="gpw-guidance__stage-num">Stage {focus.index}</span>
          <span className="gpw-guidance__stage-title">{focus.title}</span>
        </button>
        <p className="gpw-guidance__move">
          <span className="gpw-guidance__move-label">Recommended next move</span>
          {move}
        </p>
      </div>

      {next && next.id !== focus.id ? (
        <div className="gpw-guidance__next">
          <span className="gpw-guidance__label">Up next</span>
          <button
            type="button"
            className="gpw-guidance__next-link"
            onClick={() => onOpenStage(next.id)}
            onPointerDown={prepareGlassTextPointerDown}
          >
            Stage {next.index}: {next.title}
          </button>
        </div>
      ) : null}
    </section>
  );
}
