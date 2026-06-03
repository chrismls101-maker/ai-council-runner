import UsageIndicator from "./UsageIndicator";
import type { UsageSummaryResponse } from "../types/usage";
import { BETA_WORKSPACE_LABEL } from "../constants/publicMessages";

interface WorkspaceHeaderProps {
  status: "loading" | "ready" | "degraded" | "offline" | "syncing";
  usage?: UsageSummaryResponse | null;
  onUsageClick?: () => void;
}

const STATUS_COPY: Record<WorkspaceHeaderProps["status"], string> = {
  loading: "Loading workspace",
  ready: "Workspace synced",
  syncing: "Syncing workspace",
  degraded: "Workspace ready · limited",
  offline: "Backend offline",
};

export default function WorkspaceHeader({ status, usage, onUsageClick }: WorkspaceHeaderProps) {
  const isOnline = status === "ready" || status === "degraded" || status === "syncing";

  return (
    <header className="workspace-header" aria-label="Workspace status">
      <div className={`workspace-status-pill workspace-status-${status}`}>
        <span
          className={`workspace-status-dot${isOnline ? " online" : ""}${status === "degraded" ? " degraded" : ""}${status === "syncing" ? " syncing" : ""}`}
          aria-hidden="true"
        />
        <span>{STATUS_COPY[status]}</span>
      </div>
      <div className="workspace-header-end">
        <span className="workspace-beta-label muted" data-testid="workspace-beta-label">
          {BETA_WORKSPACE_LABEL}
        </span>
        <UsageIndicator usage={usage ?? null} onClick={onUsageClick} />
      </div>
    </header>
  );
}
