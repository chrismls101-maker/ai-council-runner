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
          <p className="landing-sub">INTELLIGENCE IN. VERIFIED ACTION OUT.</p>
          <p className="landing-desc">
            {withIivoWordmark(
              "Ask a serious question. IIVO will choose the right path: one model, verified search, or a specialist council.",
              "landing-desc",
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
