import { send, useGlassState } from "../useGlassState.ts";

export function GlassAwarenessStrip(): JSX.Element | null {
  const state = useGlassState();

  // Only show if we have at least something to show
  const hasApp = Boolean(state.activeApp);
  const hasContext = Boolean(state.workingContext);
  const hasClip = Boolean(state.clipboardText);
  const hasMemory = Boolean(state.memoryResults && state.memoryResults.length > 0);

  if (!hasApp && !hasContext && !hasClip) return null;

  // Truncate working context for display
  const contextText = state.workingContext
    ? (state.workingContext.length > 60
        ? state.workingContext.slice(0, 60) + '…'
        : state.workingContext)
    : null;

  return (
    <div className="glass-awareness-strip" data-testid="glass-awareness-strip">
      <div className="glass-awareness-strip__chips">
        {state.activeApp ? (
          <span className="glass-awareness-chip glass-awareness-chip--app">
            <span className="glass-awareness-chip__dot" aria-hidden="true" />
            {state.activeApp}
          </span>
        ) : null}
        {hasClip ? (
          <span className="glass-awareness-chip glass-awareness-chip--clip">
            <span className="glass-awareness-chip__dot glass-awareness-chip__dot--clip" aria-hidden="true" />
            clipboard
          </span>
        ) : null}
      </div>
      {contextText ? (
        <p className="glass-awareness-strip__context">{contextText}</p>
      ) : null}
      {hasMemory ? (
        <button
          type="button"
          className="glass-awareness-strip__memory"
          onClick={() => send({ type: "get-recent-memory" })}
          title="View related past answers"
        >
          {state.memoryResults!.length} related
        </button>
      ) : null}
    </div>
  );
}
