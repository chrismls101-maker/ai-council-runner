import type { BuildMap } from "../../utils/buildMap";

export interface BuildMapPanelProps {
  buildMap: BuildMap;
  onAddSection?: (sectionId: string) => void;
  onImproveSection?: (sectionId: string) => void;
}

export default function BuildMapPanel({
  buildMap,
  onAddSection,
  onImproveSection,
}: BuildMapPanelProps) {
  return (
    <div className="build-map-panel" data-testid="build-map-panel">
      <div className="build-map-header">
        <h4>Build Map</h4>
        <span className="build-map-score" data-testid="build-map-completeness">
          {buildMap.overallCompleteness}%
        </span>
      </div>
      <p className="muted build-map-type">{buildMap.title}</p>
      <ul className="build-map-sections">
        {buildMap.sections.map((section) => (
          <li
            key={section.id}
            className={`build-map-item status-${section.status}`}
            data-testid={`build-map-section-${section.id}`}
          >
            <span className="build-map-label">{section.label}</span>
            <span className={`build-map-status ${section.status}`}>{section.status}</span>
            {section.reason && <p className="muted build-map-reason">{section.reason}</p>}
            <div className="build-map-actions">
              {section.status === "missing" && onAddSection && (
                <button
                  type="button"
                  className="btn ghost small"
                  data-testid={`build-map-add-${section.id}`}
                  onClick={() => onAddSection(section.id)}
                >
                  Add section
                </button>
              )}
              {(section.status === "weak" || section.status === "missing") && onImproveSection && (
                <button
                  type="button"
                  className="btn ghost small"
                  data-testid={`build-map-improve-${section.id}`}
                  onClick={() => onImproveSection(section.id)}
                >
                  Improve section
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
