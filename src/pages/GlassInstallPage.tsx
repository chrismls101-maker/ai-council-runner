import type { JSX } from "react";
import GlassDocLayout from "../components/glass-landing/GlassDocLayout";
import { useGlassLatestRelease } from "../hooks/useGlassLatestRelease";
import {
  GLASS_DMG_ARM64_DOWNLOAD_URL,
  GLASS_DMG_X64_DOWNLOAD_URL,
} from "../utils/glassRelease";

export default function GlassInstallPage(): JSX.Element {
  const { version: glassVersion } = useGlassLatestRelease();

  return (
    <GlassDocLayout
      title="Beta Install Guide"
      eyebrow="Installation"
      testId="glass-install-page"
    >
      <p className="glass-landing__doc-lead">
        Install IIVO Glass on your Mac and run your first question. No terminal, no configuration
        files, no developer setup.
      </p>

      <section className="glass-landing__doc-section">
        <h2>What you need</h2>
        <p>
          A Mac running macOS — <strong>Apple Silicon</strong> (M1, M2, M3, M4) or{" "}
          <strong>Intel</strong>.
        </p>
        <p>
          Production server: <a href="https://iivo.ai">iivo.ai</a> — the app is already set up to
          use it.
        </p>
      </section>

      <section className="glass-landing__doc-section">
        <h2>1. Download</h2>
        <ol>
          <li>
            Open <a href="https://iivo.ai">iivo.ai</a> in Safari or Chrome.
          </li>
          <li>If you see a password screen, enter the preview password your invite included.</li>
          <li>
            Click <strong>Download for Mac — Apple Silicon (2020 and later)</strong> or{" "}
            <strong>Download for Mac — Intel (2019 and earlier)</strong> depending on your Mac.
          </li>
        </ol>
        <p>
          Not sure which you have? Apple menu → About This Mac. If it says "Apple M…" you have
          Apple Silicon. If it says "Intel Core" you have Intel.
        </p>
        <p>
          The file is named{" "}
          <code>IIVO-Glass-{glassVersion}-arm64.dmg</code> (Apple Silicon) or{" "}
          <code>IIVO-Glass-{glassVersion}-x64.dmg</code> (Intel). It will land in your{" "}
          <strong>Downloads</strong> folder.{" "}
          Direct links:{" "}
          <a href={GLASS_DMG_ARM64_DOWNLOAD_URL}>Apple Silicon</a>
          {" · "}
          <a href={GLASS_DMG_X64_DOWNLOAD_URL}>Intel</a>
        </p>
      </section>

      <section className="glass-landing__doc-section">
        <h2>2. Install</h2>
        <ol>
          <li>Double-click the <code>.dmg</code> file in Downloads.</li>
          <li>Drag <strong>IIVO Glass</strong> into the <strong>Applications</strong> folder.</li>
          <li>Eject the disk image (right-click the desktop icon → Eject).</li>
        </ol>
      </section>

      <section className="glass-landing__doc-section">
        <h2>3. Open IIVO Glass</h2>
        <ol>
          <li>
            Open <strong>Applications</strong> (Finder → Applications, or Spotlight: ⌘ Space, type{" "}
            <em>IIVO Glass</em>).
          </li>
          <li>Double-click <strong>IIVO Glass</strong>.</li>
        </ol>
        <p>The first launch may take a few seconds while the boot animation plays. That is normal.</p>
        <p>
          <strong>If macOS says the app cannot be opened:</strong> Right-click <strong>IIVO Glass</strong>{" "}
          → <strong>Open</strong> → <strong>Open</strong> once. You should only need to do this once.
        </p>
      </section>

      <section className="glass-landing__doc-section">
        <h2>4. First-run welcome (optional)</h2>
        <p>
          A short welcome may ask three quick questions (your name, what you do, what you are focused
          on). Answer them or click <strong>Skip</strong> — either way works.
        </p>
        <p>When it finishes, you will see a small <strong>Glass</strong> dock and a command bar at the bottom center.</p>
      </section>

      <section className="glass-landing__doc-section">
        <h2>5. Grant permissions</h2>
        <p>
          Glass needs macOS permission before it can hear you or see your screen.{" "}
          <strong>Nothing is recorded until you start it.</strong>
        </p>
        <h3>Screen Recording</h3>
        <ol>
          <li>Click <strong>Capture</strong> on the Glass dock, or ask a question that uses your screen.</li>
          <li>macOS may show a prompt — click OK or Open System Settings.</li>
          <li>Go to System Settings → Privacy &amp; Security → Screen Recording.</li>
          <li>Turn <strong>IIVO Glass</strong> on.</li>
          <li>Quit IIVO Glass completely (⌘ Q), then open it again.</li>
        </ol>
        <h3>Microphone</h3>
        <ol>
          <li>Click the microphone icon on the command bar, or start listening from the panel.</li>
          <li>When macOS asks, click OK.</li>
          <li>
            If you do not see a prompt: System Settings → Privacy &amp; Security → Microphone → turn{" "}
            <strong>IIVO Glass</strong> on.
          </li>
        </ol>
        <h3>System Audio (optional)</h3>
        <p>
          Only needed if you want Glass to hear audio playing on your Mac. On newer macOS versions
          this may appear as System Audio Recording under Privacy &amp; Security.
        </p>
      </section>

      <section className="glass-landing__doc-section">
        <h2>6. Connect to iivo.ai</h2>
        <ol>
          <li>On the Glass dock, click <strong>Open Panel</strong>.</li>
          <li>At the top of the panel, click <strong>CONNECT IIVO GLASS</strong>.</li>
          <li>Wait until the button shows <strong>IIVO GLASS CONNECTED</strong> (green dot).</li>
        </ol>
        <p>
          Under Setup, confirm <strong>Server</strong> is connected, and Screen/Microphone show ready
          after you granted permissions. You do not need to type any server address.
        </p>
      </section>

      <section className="glass-landing__doc-section">
        <h2>7. Run your first ask</h2>
        <ol>
          <li>Click in the command bar at the bottom of your screen.</li>
          <li>
            Type a simple question, for example: <em>What is IIVO Glass in one sentence?</em>
          </li>
          <li>Press Enter or click the send arrow.</li>
        </ol>
        <p>
          You should see a short thinking state, then an answer card above the command bar. That
          confirms Glass is installed, connected to production, and working.
        </p>
      </section>

      <section className="glass-landing__doc-section">
        <h2>Something not working?</h2>
        <ul>
          <li>
            <strong>IIVO Glass does not appear in Privacy settings</strong> — Open the app from
            Applications, not a download folder copy.
          </li>
          <li>
            <strong>Permission is on but capture still fails</strong> — Quit Glass (⌘ Q), reopen, and
            click CONNECT IIVO GLASS again.
          </li>
          <li>
            <strong>Answer never appears / Server error</strong> — Check Wi‑Fi and confirm Server is
            not red in Setup.
          </li>
          <li>
            <strong>Only “Electron” in Privacy lists</strong> — Install from the DMG and use IIVO
            Glass from Applications.
          </li>
        </ul>
        <p>
          Still stuck? Note what you see (especially any red rows in Setup), your macOS version, and
          send that to your beta contact.
        </p>
      </section>
    </GlassDocLayout>
  );
}
