import { useMemo } from "react";

interface Particle {
  id: number;
  left: string;
  top: string;
  size: number;
  duration: number;
  delay: number;
}

export default function AnimatedGlassBackground() {
  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: 18 }, (_, id) => ({
        id,
        left: `${8 + Math.random() * 84}%`,
        top: `${10 + Math.random() * 80}%`,
        size: 2 + Math.random() * 3,
        duration: 16 + Math.random() * 18,
        delay: Math.random() * -20,
      })),
    [],
  );

  return (
    <div className="glass-landing-bg" aria-hidden="true">
      <div className="glass-landing-bg__aurora" />
      <div className="glass-landing-bg__aurora-secondary" />
      <div className="glass-landing-bg__glow" />
      <div className="glass-landing-bg__grid" />
      <div className="glass-landing-bg__noise" />
      {particles.map((p) => (
        <span
          key={p.id}
          className="glass-landing-bg__particle"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
