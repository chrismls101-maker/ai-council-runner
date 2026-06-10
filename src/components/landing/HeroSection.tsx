import IivoWordmark from "../IivoWordmark";
import { withIivoWordmark } from "../../utils/brandText";
import DotMatrixAccent from "./DotMatrixAccent";

export default function HeroSection() {
  return (
    <section className="landing-hero-zone" aria-label="IIVO">
      <div className="landing-ambient-bloom" aria-hidden="true" />
      <div className="landing-glow" aria-hidden="true" />

      <div className="landing-hero-inner">
        <div className="landing-hero">
          <div className="landing-title-row">
            <DotMatrixAccent side="left" />
            <IivoWordmark as="h1" className="landing-title" />
            <DotMatrixAccent side="right" />
          </div>
          <p className="landing-sub">YOUR GLASS COMMAND CENTER.</p>
          <p className="landing-desc">
            {withIivoWordmark(
              "Glass thinks with you in real time. Come here to review sessions, manage your memory vault, and run council queries that don't need to be in the moment.",
              "landing-desc",
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
