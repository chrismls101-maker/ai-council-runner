export function MagnifierLens({
  rect,
  cropDataUrl,
}: {
  rect: { left: number; top: number; width: number; height: number };
  cropDataUrl?: string;
}): JSX.Element {
  const size = Math.max(120, Math.min(220, Math.max(rect.width, rect.height) * 2.5));
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const left = cx - size / 2;
  const top = cy - size / 2;

  return (
    <div
      className="companion-presence__magnifier"
      style={{ left: `${left}px`, top: `${top}px`, width: `${size}px`, height: `${size}px` }}
      data-testid="companion-magnifier"
      aria-hidden="true"
    >
      {cropDataUrl ? (
        <img
          className="companion-presence__magnifier-img"
          src={cropDataUrl}
          alt=""
          draggable={false}
        />
      ) : (
        <div className="companion-presence__magnifier-fallback" />
      )}
      <div className="companion-presence__magnifier-ring" />
    </div>
  );
}
