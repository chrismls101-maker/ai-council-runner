import {
  displayTitle,
  filterHistory,
  formatRelativeTime,
  formatStatus,
  HISTORY_FILTERS,
  HISTORY_LIBRARY_TABS,
  isFinalPlanRun,
  isResearchBrief,
  MAIN_PANEL_SECTIONS,
  PANEL_TOGGLE_SECTIONS,
  SIDEBAR_NAV,
  tokenModeLabel,
  workflowIcon,
  type HistoryFilter,
  type SidebarSection,
} from "../utils/decisionHistory";
import MemoryVault from "./MemoryVault";
import RailIcon from "./RailIcons";
import { formatUsd, OUTCOME_STATUS_LABELS, type RunHistorySummary } from "../types";

interface SidebarProps {
  section: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
  sidePanelOpen: boolean;
  onSidePanelToggle: () => void;
  history: RunHistorySummary[];
  selectedRunId: string | null;
  filter: HistoryFilter;
  onFilterChange: (filter: HistoryFilter) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onNewDecision: () => void;
  onOpenRun: (runId: string) => void;
  onCopyFinalPlan: (runId: string) => void;
  onDeleteRun: (runId: string) => void;
  onRerun: (runId: string) => void;
}

function DecisionCard({
  item,
  selected,
  compact,
  showActions,
  onOpen,
  onCopy,
  onDelete,
  onRerun,
}: {
  item: RunHistorySummary;
  selected: boolean;
  compact?: boolean;
  showActions?: boolean;
  onOpen: () => void;
  onCopy?: () => void;
  onDelete?: () => void;
  onRerun?: () => void;
}) {
  const title = displayTitle(item);
  const icon = workflowIcon(item.workflowId);

  return (
    <div className={`decision-card ${selected ? "selected" : ""}`}>
      <button type="button" className="decision-card-main" onClick={onOpen}>
        <div className="decision-card-top">
          <span className="decision-icon" aria-hidden="true">
            {icon}
          </span>
          <span className="decision-title">{title}</span>
        </div>
        {!compact && (
          <div className="decision-meta">
            <span className={`workflow-badge wf-${item.workflowId}`}>
              {item.workflowName}
            </span>
            {item.confidence && (
              <span className="history-quality-badge">{item.confidence} confidence</span>
            )}
            {item.riskLevel && (
              <span className={`history-quality-badge risk-${item.riskLevel.toLowerCase()}`}>
                {item.riskLevel} risk
              </span>
            )}
            {item.outcomeStatus && (
              <span className="history-outcome-badge">
                Outcome:{" "}
                {OUTCOME_STATUS_LABELS[
                  item.outcomeStatus as keyof typeof OUTCOME_STATUS_LABELS
                ] ?? item.outcomeStatus.replace(/_/g, " ")}
              </span>
            )}
            <span className={`status-pill status-${item.status}`}>
              {formatStatus(item.status)}
            </span>
          </div>
        )}
        <div className="decision-stats">
          <span>{formatRelativeTime(item.timestamp)}</span>
          <span>·</span>
          <span>{formatUsd(item.totalEstimatedCostUsd)}</span>
          {item.tokenMode && (
            <>
              <span>·</span>
              <span>{tokenModeLabel(item.tokenMode)}</span>
            </>
          )}
          {(item.sourceCount ?? 0) > 0 && (
            <>
              <span>·</span>
              <span className="stat-sources">Sources {item.sourceCount}</span>
            </>
          )}
          {item.benchmarkEnabled && (
            <>
              <span>·</span>
              <span className="stat-benchmark">Benchmark</span>
            </>
          )}
        </div>
      </button>
      {showActions && (
        <div className="decision-card-actions">
          <button type="button" className="btn-icon btn-action-open" title="Open" onClick={onOpen}>
            Open
          </button>
          {item.hasFinalPlan && onCopy && (
            <button type="button" className="btn-icon" title="Copy Final Plan" onClick={onCopy}>
              Copy
            </button>
          )}
          {onRerun && (
            <button type="button" className="btn-icon" title="Re-run" onClick={onRerun}>
              Re-run
            </button>
          )}
          {onDelete && (
            <button type="button" className="btn-icon danger" title="Delete" onClick={onDelete}>
              Del
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="sidebar-empty">
      <p className="empty-title">{title}</p>
      <p className="empty-hint">{hint}</p>
    </div>
  );
}

function isHistoryLibrarySection(section: SidebarSection): boolean {
  return section === "history" || section === "final-plans" || section === "research";
}

export default function Sidebar({
  section,
  onSectionChange,
  sidePanelOpen,
  onSidePanelToggle,
  history,
  selectedRunId,
  filter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  onNewDecision,
  onOpenRun,
  onCopyFinalPlan,
  onDeleteRun,
  onRerun,
}: SidebarProps) {
  const filtered = filterHistory(history, filter, searchQuery);
  const finalPlans = history.filter(isFinalPlanRun);
  const researchBriefs = history.filter(isResearchBrief);

  const showSidePanel =
    sidePanelOpen &&
    (section === "memory" || isHistoryLibrarySection(section));

  const showFilters = section === "history";
  const listTitle =
    section === "history"
      ? "Session History"
      : section === "memory"
        ? "Memory Vault"
        : section === "final-plans"
          ? "Saved Plans"
          : section === "research"
            ? "Research Library"
            : null;

  const listItems =
    section === "history"
      ? filtered
      : section === "final-plans"
        ? filterHistory(finalPlans, "all", searchQuery)
        : section === "research"
          ? filterHistory(researchBriefs, "all", searchQuery)
          : [];

  const handleNavClick = (id: SidebarSection) => {
    if (MAIN_PANEL_SECTIONS.includes(id)) {
      onSectionChange(id);
      return;
    }
    if (id === "console") {
      onSectionChange("console");
      return;
    }
    if (PANEL_TOGGLE_SECTIONS.includes(id)) {
      if (section === id && sidePanelOpen) {
        onSidePanelToggle();
      } else {
        onSectionChange(id);
      }
      return;
    }
    onSectionChange(id);
  };

  const isNavActive = (id: SidebarSection) => {
    if (id === "history") return section === "history";
    if (id === "research") return section === "research";
    if (id === "final-plans") return section === "final-plans";
    return section === id;
  };

  return (
    <aside className={`app-nav-shell${showSidePanel ? " panel-open" : ""}`}>
      <div className="nav-rail" aria-label="IIVO navigation">
        <div className="rail-item-wrap">
          <button
            type="button"
            className={`rail-logo${section === "console" ? " active" : ""}`}
            onClick={() => handleNavClick("console")}
            aria-label="Glass Console"
            data-testid="decision-console"
          >
            <span className="rail-logo-box" aria-hidden="true">
              <img
                className="rail-eye-orb"
                src="/iivo-eye-orb.png"
                alt=""
                width={40}
                height={40}
                draggable={false}
              />
            </span>
          </button>
          <span className="rail-tooltip" role="tooltip">
            Glass Console
          </span>
        </div>

        <div className="rail-item-wrap">
          <button
            type="button"
            className="rail-btn rail-new"
            onClick={onNewDecision}
            aria-label="New Session"
            data-testid="new-decision-btn"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <span className="rail-tooltip" role="tooltip">
            New Session
          </span>
        </div>

        <nav className="rail-nav">
          {SIDEBAR_NAV.map((item) => (
            <div key={item.id} className="rail-item-wrap">
              <button
                type="button"
                className={`rail-btn rail-nav-item${item.id === "settings" ? " rail-settings" : ""} ${isNavActive(item.id) ? "active" : ""}`}
                onClick={() => handleNavClick(item.id)}
                aria-label={item.label}
                aria-current={isNavActive(item.id) ? "page" : undefined}
                data-testid={`sidebar-nav-${item.id}`}
              >
                <RailIcon name={item.icon} size={20} />
              </button>
              <span className="rail-tooltip" role="tooltip">
                {item.label}
              </span>
            </div>
          ))}
        </nav>

        <div className="rail-footer">
          {showSidePanel && (
            <button
              type="button"
              className="rail-btn rail-collapse"
              onClick={onSidePanelToggle}
              aria-label="Collapse panel"
              title="Collapse panel"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}
          <div className="rail-item-wrap">
            <button
              type="button"
              className="rail-btn rail-account"
              aria-label="IIVO workspace"
              title="IIVO Decision workspace"
            >
              <span className="rail-account-wrap">
                <span className="rail-account-avatar" aria-hidden="true">IU</span>
                <span className="rail-account-status" aria-hidden="true" />
              </span>
            </button>
            <span className="rail-tooltip" role="tooltip">
              Decision workspace
            </span>
          </div>
        </div>
      </div>

      {showSidePanel && section === "memory" && (
        <div className="nav-panel" data-testid="memory-vault-panel">
          <header className="nav-panel-header">
            <h2>Memory Vault</h2>
          </header>
          <div className="nav-panel-body memory-vault-area">
            <MemoryVault />
          </div>
        </div>
      )}

      {showSidePanel && isHistoryLibrarySection(section) && (
        <div className="nav-panel" data-testid="decision-history-panel">
          <header className="nav-panel-header">
            <h2>{listTitle}</h2>
          </header>
          <div className="nav-panel-body">
            <div className="nav-panel-tabs" role="tablist" aria-label="History library">
              {HISTORY_LIBRARY_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={section === tab.id}
                  className={`nav-panel-tab${section === tab.id ? " active" : ""}`}
                  onClick={() => onSectionChange(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {showFilters && (
              <>
                <input
                  type="search"
                  className="sidebar-search"
                  placeholder="Search decisions…"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                />
                <div className="sidebar-filters">
                  {HISTORY_FILTERS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      className={`filter-chip ${filter === f.value ? "active" : ""}`}
                      onClick={() => onFilterChange(f.value)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {(section === "final-plans" || section === "research") && (
              <input
                type="search"
                className="sidebar-search"
                placeholder="Search…"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            )}

            {listItems.length === 0 ? (
              <EmptyState
                title="No decisions yet."
                hint="Run your first council to create a decision record."
              />
            ) : (
              <ul className="decision-list">
                {listItems.map((item) => (
                  <li key={item.runId}>
                    <DecisionCard
                      item={item}
                      selected={selectedRunId === item.runId}
                      showActions
                      onOpen={() => onOpenRun(item.runId)}
                      onCopy={
                        item.hasFinalPlan
                          ? () => onCopyFinalPlan(item.runId)
                          : undefined
                      }
                      onDelete={() => onDeleteRun(item.runId)}
                      onRerun={() => onRerun(item.runId)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
