import type { GlassState } from "../../shared/ipc.ts";
import { CopilotPanel } from "./CopilotPanel.tsx";
import { ListenStatusBar } from "./LiveNotesTab.tsx";

type SessionControlTabProps = {
  state: GlassState;
  sessionLive: boolean;
};

export function SessionControlTab({
  state,
  sessionLive,
}: SessionControlTabProps): JSX.Element {
  return (
    <div className="panel-session-control" data-testid="glass-panel-session-tab">
      <div className="panel__body panel__body--copilot">
        <CopilotPanel sessionLive={sessionLive} />
      </div>
      <div className="panel-session-control__status">
        <p className="section-title">Now</p>
        <ListenStatusBar state={state} />
      </div>
    </div>
  );
}
