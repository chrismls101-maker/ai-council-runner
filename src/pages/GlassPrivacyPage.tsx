import type { JSX } from "react";
import GlassDocLayout from "../components/glass-landing/GlassDocLayout";

export default function GlassPrivacyPage(): JSX.Element {
  return (
    <GlassDocLayout
      title="IIVO Glass Privacy Policy"
      eyebrow="Legal"
      testId="glass-privacy-page"
    >
      <p className="glass-landing__doc-meta">Last updated June 2026</p>

      <section className="glass-landing__doc-section">
        <h2>What Glass captures</h2>
        <p>
          Glass captures your screen, microphone audio, and system audio only when you explicitly
          trigger it. Nothing is captured on launch or in the background.
        </p>
      </section>

      <section className="glass-landing__doc-section">
        <h2>What stays on your device</h2>
        <p>
          Your interaction history, passive context profile, onboarding answers, and session data are
          stored locally in the app&apos;s data folder on your Mac. They never leave your device unless
          you explicitly send them.
        </p>
      </section>

      <section className="glass-landing__doc-section">
        <h2>What gets sent to our server</h2>
        <p>
          When you ask a question, the text of your question and a derived context summary (inferred
          from your usage patterns) are sent to our server at iivo.ai to generate a response. If you
          use Visual Ask, an optimized screenshot is included. Audio is transcribed on our server using
          OpenAI and the transcript is used only to answer your question.
        </p>
      </section>

      <section className="glass-landing__doc-section">
        <h2>What we never do</h2>
        <p>
          We never sell your data. We never train AI models on your private sessions without your
          explicit consent. We never capture anything without your action.
        </p>
      </section>

      <section className="glass-landing__doc-section">
        <h2>Third parties</h2>
        <p>
          We use OpenAI&apos;s API to process questions and transcriptions. Their privacy policy applies
          to data processed through their API.
        </p>
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
