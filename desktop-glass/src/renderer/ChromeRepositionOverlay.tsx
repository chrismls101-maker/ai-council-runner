/** Dark scrim + centered hint while dock or command bar layout is unlocked. */
export function ChromeRepositionOverlay(): JSX.Element {
  return (
    <>
      <div className="chrome-reposition-scrim" aria-hidden="true" />
      <div className="chrome-reposition-hint" role="status" aria-live="polite">
        <span className="chrome-reposition-hint__pill">Hold & drag to move</span>
      </div>
    </>
  );
}
