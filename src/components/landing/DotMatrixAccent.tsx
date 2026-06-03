export default function DotMatrixAccent({ side }: { side: "left" | "right" }) {
  return (
    <div className={`landing-dot-matrix landing-dot-matrix-${side}`} aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className="landing-dot" />
      ))}
    </div>
  );
}
