import type { JSX } from "react";
import GlassDocLayout from "../components/glass-landing/GlassDocLayout";

export default function Glass404Page(): JSX.Element {
  return (
    <GlassDocLayout
      title="Page Not Found"
      eyebrow="404"
      testId="glass-404-page"
    >
      <p className="glass-landing__doc-meta">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <p>
        You may have followed a broken link or typed a URL that isn&apos;t part of IIVO Glass.
      </p>
      <p>
        <a href="/" className="glass-landing__footer-link">
          ← Back to IIVO Glass
        </a>
      </p>
    </GlassDocLayout>
  );
}
