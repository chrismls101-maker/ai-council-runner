import type { GlassPathway, PathwayLiveSession } from "../../shared/glassPathwaysTypes.ts";
import {
  derivePathwayDisplayStatus,
  formatPathwayUpdatedAt,
  pathwayProgressSummary,
  pathwayStatusLabel,
} from "../../shared/glassPathwaysProgress.ts";
import { buildPathwayNarrativeSummary } from "../../shared/glassPathwaysRuntime.ts";

interface GlassPathwayHeaderProps {
  pathway: GlassPathway;
  liveSession?: PathwayLiveSession | null;
}

export function GlassPathwayHeader({ pathway, liveSession = null }: GlassPathwayHeaderProps): JSX.Element {
  const status = derivePathwayDisplayStatus(pathway);
  const updated = formatPathwayUpdatedAt(pathway.updatedAt);
  const narrative = buildPathwayNarrativeSummary(pathway, liveSession);

  return (
    <header className="gpw-pathway__header" data-testid="glass-pathway-header">
      <div className="gpw-pathway__header-top">
        <h2 className="gpw-pathway__title">{pathway.title}</h2>
        <span className={`gpw-pathway-badge gpw-pathway-badge--${status}`}>
          {pathwayStatusLabel(status)}
        </span>
      </div>
      <p className="gpw-pathway__summary">{pathway.summary}</p>
      <p className="gpw-pathway__narrative" data-testid="glass-pathway-narrative">{narrative}</p>
      <div className="gpw-pathway__meta">
        <span className="gpw-pathway__domain">{pathway.domain}</span>
        <span className="gpw-pathway__progress">{pathwayProgressSummary(pathway)}</span>
        {updated ? (
          <span className="gpw-pathway__updated">Updated {updated}</span>
        ) : null}
      </div>
    </header>
  );
}
