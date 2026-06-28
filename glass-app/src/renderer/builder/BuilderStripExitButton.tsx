import type { GlassState } from "../../shared/ipc.ts";
import { send, useGlassState } from "../useGlassState.ts";

export function shouldShowBuilderStripExitGlass(state: GlassState): boolean {
  return (
    !state.researchExplorerActive
    && !state.codeAnalystExplorerActive
    && !state.writingStudioActive
    && !state.glassStorageProjectsActive
    && !state.glassDashboardActive
    && !state.aletheiaDashboardActive
    && !state.glassIdeActive
  );
}

export function BuilderStripExitButton(): JSX.Element | null {
  const state = useGlassState();
  if (!shouldShowBuilderStripExitGlass(state)) return null;

  return (
    <button
      type="button"
      className="builder-tab builder-tab--exit-glass glass-btn-depth-3"
      data-testid="glass-exit-control"
      aria-label="Exit Glass"
      onClick={() => send({ type: "glass-quit" })}
    >
      Exit Glass
    </button>
  );
}
