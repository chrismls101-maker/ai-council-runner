import type { BuilderWorkspaceTab } from "../../types/builderWorkspace";

const TABS: Array<{ id: BuilderWorkspaceTab; label: string }> = [
  { id: "compose", label: "Compose" },
  { id: "inspect", label: "Inspect" },
  { id: "improve", label: "Improve" },
  { id: "package", label: "Package" },
  { id: "execute", label: "Execute" },
];

export interface BuilderTabsProps {
  activeTab: BuilderWorkspaceTab;
  onTabChange: (tab: BuilderWorkspaceTab) => void;
}

export default function BuilderTabs({ activeTab, onTabChange }: BuilderTabsProps) {
  return (
    <div className="builder-tabs" data-testid="builder-tabs" role="tablist">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          className={`builder-tab${activeTab === tab.id ? " active" : ""}`}
          data-testid={`builder-tab-${tab.id}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
