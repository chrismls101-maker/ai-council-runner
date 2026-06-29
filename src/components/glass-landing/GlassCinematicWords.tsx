import { useEffect, useState, type JSX } from "react";

export const CINEMATIC_PHRASES = [
  "Every window.",
  "One layer.",
  "Native intelligence.",
  "Above everything.",
  "IIVO Glass.",
] as const;

type GlassCinematicWordsProps = {
  phrases?: readonly string[];
  phraseMs?: number;
  className?: string;
  fullscreen?: boolean;
  loop?: boolean;
  onComplete?: () => void;
};

export default function GlassCinematicWords({
  phrases = CINEMATIC_PHRASES,
  phraseMs = 2000,
  className = "",
  fullscreen = false,
  loop = false,
  onComplete,
}: GlassCinematicWordsProps): JSX.Element {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");

  useEffect(() => {
    if (phrases.length === 0) return;

    const fadeMs = Math.round(phraseMs * 0.28);
    const holdMs = Math.round(phraseMs * 0.44);

    setPhase("in");
    const holdTimer = window.setTimeout(() => setPhase("hold"), fadeMs);
    const outTimer = window.setTimeout(() => setPhase("out"), fadeMs + holdMs);
    const nextTimer = window.setTimeout(() => {
      if (index >= phrases.length - 1) {
        if (loop) {
          setIndex(0);
          setPhase("in");
          return;
        }
        onComplete?.();
        return;
      }
      setIndex((current) => current + 1);
      setPhase("in");
    }, phraseMs);

    return () => {
      window.clearTimeout(holdTimer);
      window.clearTimeout(outTimer);
      window.clearTimeout(nextTimer);
    };
  }, [index, phraseMs, phrases.length, loop, onComplete]);

  const word = phrases[index] ?? "";

  return (
    <div
      className={[
        "glass-cinema-words",
        fullscreen ? "glass-cinema-words--fullscreen" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="glass-cinema-words__stage">
        <p
          key={`${index}-${word}`}
          className={`glass-cinema-words__line glass-cinema-words__line--${phase}`}
        >
          {word}
        </p>
      </div>
      {fullscreen ? <div className="glass-cinema-words__grain" aria-hidden="true" /> : null}
    </div>
  );
}
