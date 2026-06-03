export default function BuilderLoadingIcon() {
  return (
    <div className="builder-loading" data-testid="builder-loading" role="status" aria-label="Building">
      <div className="builder-loading-ring" />
      <p className="muted">Building your workspace…</p>
    </div>
  );
}
