export function SketchLayer({ paths }: { paths: string[] }): JSX.Element | null {
  if (!paths.length) return null;
  return (
    <svg
      className="companion-presence__sketch"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      aria-hidden="true"
      data-testid="companion-sketch"
    >
      {paths.map((d, index) => (
        <path key={`sketch-${index}`} d={d} className="companion-presence__sketch-path" />
      ))}
    </svg>
  );
}
