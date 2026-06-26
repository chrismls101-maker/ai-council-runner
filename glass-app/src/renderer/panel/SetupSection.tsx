import { useGlassState } from "../useGlassState.ts";
import { ConnectGlassHero, DashboardSetupContent } from "../dashboard/DashboardSetupSections.tsx";

/** @deprecated Dashboard uses DashboardSetupView; kept for test id compatibility. */
export function SetupSection(): JSX.Element {
  const state = useGlassState();
  return (
    <>
      <ConnectGlassHero />
      <DashboardSetupContent state={state} />
    </>
  );
}
