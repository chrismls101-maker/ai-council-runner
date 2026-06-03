import type { ArtifactSection } from "../../types/artifacts";
import type { BuildMap } from "../../utils/buildMap";

export interface BuilderSidebarProps {
  sections: ArtifactSection[];
  buildMap?: BuildMap;
  selectedSectionId?: string | null;
  onSelectSection: (sectionId: string) => void;
}

export default function BuilderSidebar({
  sections,
  buildMap,
  selectedSectionId,
  onSelectSection,
}: BuilderSidebarProps) {
  const statusById = new Map(buildMap?.sections.map((s) => [s.id, s.status]) ?? []);

  return (
    <aside className="builder-sidebar" data-testid="builder-sidebar">
      <h4 className="builder-sidebar-title">Outline</h4>
      <nav className="builder-outline">
        {sections.map((section) => {
          const status = statusById.get(section.id);
          return (
            <button
              key={section.id}
              type="button"
              className={`builder-outline-item${selectedSectionId === section.id ? " active" : ""}`}
              data-testid={`builder-outline-${section.id}`}
              onClick={() => onSelectSection(section.id)}
            >
              <span>{section.label}</span>
              {status && <span className={`outline-status ${status}`}>{status}</span>}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
