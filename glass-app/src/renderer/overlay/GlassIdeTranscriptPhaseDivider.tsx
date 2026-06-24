import type { CoderTranscriptPhaseMarker } from "../../shared/glassIdeTranscriptPhaseDividers.ts";

interface GlassIdeTranscriptPhaseDividerProps {
  marker: CoderTranscriptPhaseMarker;
}

export function GlassIdeTranscriptPhaseDivider({
  marker,
}: GlassIdeTranscriptPhaseDividerProps): JSX.Element {
  return (
    <div
      className="gide-transcript-phase"
      data-phase={marker.phase}
      data-testid="glass-ide-phase-divider"
      role="separator"
      aria-label={marker.label}
    >
      <span className="gide-transcript-phase__line" aria-hidden="true" />
      <span className="gide-transcript-phase__label">{marker.label}</span>
      <span className="gide-transcript-phase__line" aria-hidden="true" />
    </div>
  );
}
