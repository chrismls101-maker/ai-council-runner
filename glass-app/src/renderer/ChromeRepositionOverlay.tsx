/** Gold ring + hint while dock or command bar layout is unlocked (visual only — never blocks clicks). */
export function ChromeRepositionOverlay(): JSX.Element {
  return (
    <div className="chrome-reposition-overlay" aria-hidden="true">
      <div className="chrome-reposition-ring" />
      <div className="chrome-reposition-hint" role="status" aria-live="polite">
        <span className="chrome-reposition-hint__icon" aria-hidden="true">
          ⤧
        </span>
        <span className="chrome-reposition-hint__text">Hold &amp; drag to move</span>
      </div>
    </div>
  );
}
