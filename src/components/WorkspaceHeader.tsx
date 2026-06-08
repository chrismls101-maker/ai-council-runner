interface WorkspaceHeaderProps {
  status?: "loading" | "ready" | "degraded" | "offline" | "syncing";
  usage?: unknown;
  onUsageClick?: () => void;
}

/** Minimal header shell — internal status/credits hidden from users. */
export default function WorkspaceHeader(_props: WorkspaceHeaderProps) {
  return <header className="workspace-header workspace-header--minimal" aria-label="Workspace" />;
}
