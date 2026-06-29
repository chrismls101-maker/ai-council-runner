import { useGlassState } from "../useGlassState.ts";
import { ConnectGlassHero, DashboardSetupContent } from "../dashboard/DashboardSetupSections.tsx";
import { ProfileEditor } from "./PanelSetupSections.tsx";
import { SettingsAccountSection } from "../settings/SettingsAccountSection.tsx";

/** Glass connection, permissions, API keys, and account — formerly System → Setup. */
export function PanelSetupTab(): JSX.Element {
  const state = useGlassState();

  return (
    <div className="panel-setup-tab glass-dashboard__setup" data-testid="glass-panel-setup-tab">
      <header className="glass-dashboard__setup-page-head">
        <h1 className="glass-dashboard__setup-page-title">Setup</h1>
        <p className="glass-dashboard__setup-page-sub">
          Connect Glass once, then confirm permissions and server health.
        </p>
      </header>

      <ConnectGlassHero />

      <div className="glass-dashboard__setup-scroll">
        <DashboardSetupContent state={state} />
        <ProfileEditor state={state} />
        <SettingsAccountSection state={state} />
      </div>
    </div>
  );
}
