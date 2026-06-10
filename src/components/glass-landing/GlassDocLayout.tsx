import type { ReactNode, JSX } from "react";
import AnimatedGlassBackground from "./AnimatedGlassBackground";
import GlassLandingFooter from "./GlassLandingFooter";
import "./glass-landing.css";

type GlassDocLayoutProps = {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  testId?: string;
};

export default function GlassDocLayout({
  title,
  eyebrow,
  children,
  testId,
}: GlassDocLayoutProps): JSX.Element {
  return (
    <div className="glass-landing glass-landing--doc" data-testid={testId}>
      <AnimatedGlassBackground />
      <article className="glass-landing__doc">
        <p className="glass-landing__doc-back">
          <a href="/" className="glass-landing__footer-link">
            ← IIVO Glass
          </a>
        </p>
        {eyebrow ? <p className="glass-landing__eyebrow">{eyebrow}</p> : null}
        <h1 className="glass-landing__doc-title">{title}</h1>
        <div className="glass-landing__doc-body">{children}</div>
      </article>
      <GlassLandingFooter />
    </div>
  );
}
