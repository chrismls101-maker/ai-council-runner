import type { GlassPathwayStage, StageStatus } from "../../shared/glassPathwaysTypes.ts";
import "./GlassPathwaysView.css";

interface GlassPathwayStageListProps {
  stages: GlassPathwayStage[];
  selectedStageId: string | null;
  focusStageId: string | null;
  onSelectStage: (stageId: string) => void;
}

function statusLabel(status: StageStatus): string {
  if (status === "active") return "Active";
  if (status === "completed") return "Done";
  return "Pending";
}

export function GlassPathwayStageList({
  stages,
  selectedStageId,
  focusStageId,
  onSelectStage,
}: GlassPathwayStageListProps): JSX.Element {
  return (
    <ol className="gpw-stage-list" data-testid="glass-pathway-stage-list">
      {stages.map((stage) => (
        <li key={stage.id}>
          <button
            type="button"
            className={`gpw-stage-card${selectedStageId === stage.id ? " gpw-stage-card--selected" : ""}${stage.status === "active" ? " gpw-stage-card--active" : ""}${focusStageId === stage.id ? " gpw-stage-card--focus" : ""}${stage.status === "completed" ? " gpw-stage-card--completed" : ""}`}
            onClick={() => onSelectStage(stage.id)}
            data-testid={`glass-pathway-stage-${stage.index}`}
          >
            <span className="gpw-stage-card__num" aria-hidden="true">
              {stage.index}
            </span>
            <span className="gpw-stage-card__body">
              <span className="gpw-stage-card__title">{stage.title}</span>
              <span className="gpw-stage-card__objective">{stage.objective}</span>
            </span>
            <span className={`gpw-stage-card__badge gpw-stage-card__badge--${stage.status}`}>
              {statusLabel(stage.status)}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
