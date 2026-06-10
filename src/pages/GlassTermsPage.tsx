import type { JSX } from "react";
import GlassDocLayout from "../components/glass-landing/GlassDocLayout";

export default function GlassTermsPage(): JSX.Element {
  return (
    <GlassDocLayout title="IIVO Glass Terms of Service" eyebrow="Legal" testId="glass-terms-page">
      <p className="glass-landing__doc-meta">Last updated June 2026</p>

      <p className="glass-landing__doc-lead">
        IIVO Glass is a beta product provided as-is. By installing and using it you agree to these
        terms.
      </p>

      <section className="glass-landing__doc-section">
        <h2>Beta software</h2>
        <p>
          This is an early beta. Features may change, break, or be removed. Do not rely on it for
          critical decisions without your own judgment.
        </p>
      </section>

      <section className="glass-landing__doc-section">
        <h2>Acceptable use</h2>
        <p>
          Use Glass for lawful purposes only. Do not use it to capture or record others without their
          consent.
        </p>
      </section>

      <section className="glass-landing__doc-section">
        <h2>No warranty</h2>
        <p>
          Glass is provided without warranty of any kind. We are not liable for any damages arising
          from its use.
        </p>
      </section>

      <section className="glass-landing__doc-section">
        <h2>Your data</h2>
        <p>You own your data. We do not claim any rights to content you create using Glass.</p>
      </section>

      <section className="glass-landing__doc-section">
        <h2>Changes</h2>
        <p>We may update these terms. Continued use after changes means you accept the new terms.</p>
      </section>

      <section className="glass-landing__doc-section">
        <h2>Contact</h2>
        <p>
          <a href="mailto:chrismls101@gmail.com">chrismls101@gmail.com</a>
        </p>
      </section>
    </GlassDocLayout>
  );
}
