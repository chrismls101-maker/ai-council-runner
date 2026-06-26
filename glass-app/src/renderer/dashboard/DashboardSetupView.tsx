import type { GlassState } from "../../shared/ipc.ts";
import { ConnectGlassHero, DashboardSetupContent } from "./DashboardSetupSections.tsx";

type DashboardSetupViewProps = {
  state: GlassState;
};

export function DashboardSetupView({ state }: DashboardSetupViewProps): JSX.Element {
  return (
    <section className="glass-dashboard__setup" data-testid="glass-dashboard-setup">
      <header className="glass-dashboard__setup-page-head">
        <h1 className="glass-dashboard__setup-page-title">Setup</h1>
        <p className="glass-dashboard__setup-page-sub">
          Connect Glass once, then confirm permissions and server health.
        </p>
      </header>

      <ConnectGlassHero />

      <div className="glass-dashboard__setup-scroll">
        <DashboardSetupContent state={state} />
      </div>
    </section>
  );
}
