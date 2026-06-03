import type { ReactNode } from "react";
import HeroSection from "./HeroSection";

interface LandingViewProps {
  children: ReactNode;
}

export default function LandingView({ children }: LandingViewProps) {
  return (
    <div className="landing-layout">
      <HeroSection />

      <section className="landing-compose-zone" aria-label="Start a decision">
        <div className="landing-composer-wash" aria-hidden="true" />
        <div className="landing-composer-slot">{children}</div>
      </section>
    </div>
  );
}
