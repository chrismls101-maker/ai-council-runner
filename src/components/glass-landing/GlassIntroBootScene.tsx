import { useEffect, type JSX } from "react";
import {
  ALETHEIA_BOOT_ACTIVATE,
  speakAletheiaLine,
} from "./glassIntroAletheiaSpeak";
import { duckIntroMusic, markBootTimelineStart, restoreIntroMusic, scheduleOnBootTimeline, startIntroMusic } from "./glassIntroBootSound";
import { playOverlayActivationPulse } from "./glassIntroBootPulseSound";

const BOOT_RAIL_ACTIONS = [
  { icon: "◫", label: "Agents" },
  { icon: "▦", label: "Storage" },
  { icon: "◎", label: "Memory" },
] as const;

const BOOT_STRIP_LEFT = [
  { icon: "◈", label: "Agents", kind: "agents" },
  { icon: "▦", label: "Storage", kind: "storage" },
] as const;

function BootMicIcon(): JSX.Element {
  return (
    <svg className="glass-browse__mic-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"
      />
    </svg>
  );
}

function BootSendIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 4l7 7-7 7v-4H5v-6h7V4z" />
    </svg>
  );
}

function BootWinChrome({ title }: { title?: string }): JSX.Element {
  return (
    <div className="glass-intro__boot-win-chrome">
      <span /><span /><span />
      {title ? <span className="glass-intro__boot-win-title">{title}</span> : null}
    </div>
  );
}

function SafariToolbar({ url }: { url: string }): JSX.Element {
  return (
    <div className="glass-intro__boot-safari-toolbar">
      <span className="glass-intro__boot-safari-nav">
        <i /><i /><i />
      </span>
      <span className="glass-intro__boot-safari-url">{url}</span>
      <span className="glass-intro__boot-safari-share" />
    </div>
  );
}

export default function GlassIntroBootScene(): JSX.Element {
  useEffect(() => {
    markBootTimelineStart();
    startIntroMusic();

    const cancelPulse = scheduleOnBootTimeline(() => {
      void playOverlayActivationPulse();
      duckIntroMusic(0.1, 450);
      document.documentElement.classList.add("glass-intro-aletheia-speaking");
      void speakAletheiaLine({
        text: ALETHEIA_BOOT_ACTIVATE,
        profile: "boot",
        audioId: "boot-activate",
        emphasis: 1,
      }).finally(() => {
        document.documentElement.classList.remove("glass-intro-aletheia-speaking");
        restoreIntroMusic(900);
      });
    }, 4750);

    return cancelPulse;
  }, []);

  return (
    <>
      <div className="glass-intro__boot-mac" aria-hidden="true">
        <div className="glass-intro__boot-wallpaper" />
        <div className="glass-intro__boot-menubar">
          <span className="glass-intro__boot-menubar-apple">&#63743;</span>
          <span className="glass-intro__boot-menubar-clock">9:41 AM</span>
        </div>

        <div className="glass-intro__boot-win glass-intro__boot-win--safari">
          <BootWinChrome title="iivo.ai — Intelligent Glass" />
          <div className="glass-intro__boot-win-body glass-intro__boot-win-body--safari">
            <SafariToolbar url="iivo.ai" />
            <div className="glass-intro__boot-site glass-intro__boot-site--iivo">
              <nav className="glass-intro__boot-iivo-nav">
                <strong>IIVO</strong>
                <span>Product</span>
                <span>Memory</span>
                <em>Get Glass</em>
              </nav>
              <div className="glass-intro__boot-iivo-hero">
                <small>The AI-Native Computing Layer</small>
                <h1>INTELLIGENT GLASS</h1>
                <p>One layer above every app on your Mac.</p>
                <button type="button">Experience the next layer</button>
              </div>
              <div className="glass-intro__boot-iivo-grid">
                <article><b>Lens</b><span>Reads every window</span></article>
                <article><b>Aletheia</b><span>Voice across apps</span></article>
                <article><b>Agents</b><span>Always on top</span></article>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-intro__boot-win glass-intro__boot-win--github">
          <BootWinChrome title="glass-app — GitHub" />
          <div className="glass-intro__boot-win-body glass-intro__boot-win-body--safari">
            <SafariToolbar url="github.com/iivo/glass-app" />
            <div className="glass-intro__boot-site glass-intro__boot-site--github">
              <header className="glass-intro__boot-gh-header">
                <span className="glass-intro__boot-gh-repo">iivo / <strong>glass-app</strong></span>
                <span className="glass-intro__boot-gh-star">★ Star 2.4k</span>
              </header>
              <div className="glass-intro__boot-gh-tabs">
                <span className="glass-intro__boot-gh-tab glass-intro__boot-gh-tab--active">Code</span>
                <span className="glass-intro__boot-gh-tab">Issues</span>
                <span className="glass-intro__boot-gh-tab">Pull requests</span>
              </div>
              <div className="glass-intro__boot-gh-branch">main · 847 commits</div>
              <ul className="glass-intro__boot-gh-files">
                <li><i className="glass-intro__boot-gh-folder" />src/components/glass-landing</li>
                <li><i className="glass-intro__boot-gh-file" />GlassBrowseOverlay.tsx</li>
                <li><i className="glass-intro__boot-gh-file" />GlassIntroBootScene.tsx</li>
                <li><i className="glass-intro__boot-gh-file" />glass-browse-mode.css</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="glass-intro__boot-win glass-intro__boot-win--notion">
          <BootWinChrome title="Launch checklist" />
          <div className="glass-intro__boot-win-body glass-intro__boot-win-body--notion">
            <aside className="glass-intro__boot-notion-sidebar">
              <span className="glass-intro__boot-notion-page glass-intro__boot-notion-page--active">Launch checklist</span>
              <span className="glass-intro__boot-notion-page">Agent specs</span>
              <span className="glass-intro__boot-notion-page">Memory model</span>
            </aside>
            <div className="glass-intro__boot-notion-doc">
              <h2>Launch checklist</h2>
              <p className="glass-intro__boot-notion-meta">Updated today · Product</p>
              <ul>
                <li><span className="glass-intro__boot-notion-check glass-intro__boot-notion-check--done" />Boot intro cinematic</li>
                <li><span className="glass-intro__boot-notion-check glass-intro__boot-notion-check--done" />Overlay frame + command bar</li>
                <li><span className="glass-intro__boot-notion-check" />Aletheia voice demo</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="glass-intro__boot-win glass-intro__boot-win--linear">
          <BootWinChrome title="Linear" />
          <div className="glass-intro__boot-win-body glass-intro__boot-win-body--linear">
            <div className="glass-intro__boot-linear-sidebar">
              <span>Inbox</span>
              <span className="glass-intro__boot-linear-active">Glass v1</span>
              <span>Memory</span>
            </div>
            <div className="glass-intro__boot-linear-main">
              <div className="glass-intro__boot-linear-issue">
                <span className="glass-intro__boot-linear-id">GLS-142</span>
                <strong>Cinematic boot sequence</strong>
                <em>In Progress</em>
              </div>
              <div className="glass-intro__boot-linear-issue">
                <span className="glass-intro__boot-linear-id">GLS-138</span>
                <strong>Realistic window mocks</strong>
                <em>Done</em>
              </div>
              <div className="glass-intro__boot-linear-issue">
                <span className="glass-intro__boot-linear-id">GLS-129</span>
                <strong>Overlay activation pulse</strong>
                <em>Review</em>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-intro__boot-win glass-intro__boot-win--mail">
          <BootWinChrome title="Mail" />
          <div className="glass-intro__boot-win-body glass-intro__boot-win-body--mail">
            <aside className="glass-intro__boot-mail-sidebar">
              <span className="glass-intro__boot-mail-folder glass-intro__boot-mail-folder--active">Inbox</span>
              <span className="glass-intro__boot-mail-folder">Sent</span>
              <span className="glass-intro__boot-mail-folder">Drafts</span>
            </aside>
            <div className="glass-intro__boot-mail-list">
              <div className="glass-intro__boot-mail-row glass-intro__boot-mail-row--active">
                <span className="glass-intro__boot-mail-dot" />
                <div>
                  <strong>Sarah Chen</strong>
                  <em>Re: Glass launch — looks incredible</em>
                </div>
                <time>9:12</time>
              </div>
              <div className="glass-intro__boot-mail-row">
                <span className="glass-intro__boot-mail-dot glass-intro__boot-mail-dot--read" />
                <div>
                  <strong>Design team</strong>
                  <em>Figma frames attached</em>
                </div>
                <time>8:47</time>
              </div>
              <div className="glass-intro__boot-mail-row">
                <span className="glass-intro__boot-mail-dot glass-intro__boot-mail-dot--read" />
                <div>
                  <strong>Investor update</strong>
                  <em>Q2 metrics draft</em>
                </div>
                <time>Yesterday</time>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-intro__boot-win glass-intro__boot-win--notes">
          <BootWinChrome title="Notes" />
          <div className="glass-intro__boot-win-body glass-intro__boot-win-body--notes">
            <p className="glass-intro__boot-notes-title">Meeting — IIVO Glass launch</p>
            <p>• Cross-window Lens context</p>
            <p>• Aletheia voice commands</p>
            <p>• Agent council from overlay</p>
            <p>• Ship before demo at 2pm</p>
          </div>
        </div>

        <div className="glass-intro__boot-win glass-intro__boot-win--figma">
          <BootWinChrome title="Glass — Figma" />
          <div className="glass-intro__boot-win-body glass-intro__boot-win-body--figma">
            <div className="glass-intro__boot-figma-sidebar">
              <span>Pages</span>
              <span className="glass-intro__boot-figma-layer">Boot intro</span>
              <span className="glass-intro__boot-figma-layer">Overlay chrome</span>
              <span className="glass-intro__boot-figma-layer">Command bar</span>
            </div>
            <div className="glass-intro__boot-figma-canvas">
              <span className="glass-intro__boot-figma-card glass-intro__boot-figma-card--1">
                <small>Hero frame</small>
              </span>
              <span className="glass-intro__boot-figma-card glass-intro__boot-figma-card--2">
                <small>Command bar</small>
              </span>
              <span className="glass-intro__boot-figma-card glass-intro__boot-figma-card--3" />
            </div>
          </div>
        </div>

        <div className="glass-intro__boot-win glass-intro__boot-win--terminal">
          <BootWinChrome title="Terminal — glass-app" />
          <div className="glass-intro__boot-win-body glass-intro__boot-win-body--terminal">
            <p><span className="glass-intro__boot-term-prompt">➜</span> npm run dev</p>
            <p className="glass-intro__boot-term-dim">VITE v6.4.3 ready in 412ms</p>
            <p className="glass-intro__boot-term-dim">→ Local: http://localhost:5173</p>
            <p><span className="glass-intro__boot-term-prompt">➜</span> glass status</p>
            <p className="glass-intro__boot-term-out">overlay: active · lens: on · memory: synced</p>
          </div>
        </div>

        <div className="glass-intro__boot-win glass-intro__boot-win--slack">
          <BootWinChrome title="Slack — #glass-launch" />
          <div className="glass-intro__boot-win-body glass-intro__boot-win-body--slack">
            <aside className="glass-intro__boot-slack-rail">
              <span className="glass-intro__boot-slack-channel glass-intro__boot-slack-channel--active">#glass-launch</span>
              <span className="glass-intro__boot-slack-channel">#design</span>
            </aside>
            <div className="glass-intro__boot-slack-main">
              <div className="glass-intro__boot-slack-msg">
                <strong>Alex</strong>
                <span>Boot sequence looks insane — the overlay drop 🔥</span>
              </div>
              <div className="glass-intro__boot-slack-msg glass-intro__boot-slack-msg--you">
                <strong>You</strong>
                <span>Shipping today. Experience the next layer.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-intro__boot-overlay" aria-hidden="true">
        <div className="glass-browse__vignette" />

        <div className="glass-intro__boot-frame-pulse" />
        <div className="glass-intro__boot-frame glass-browse__frame">
          <span className="glass-browse__corner glass-browse__corner--tl" />
          <span className="glass-browse__corner glass-browse__corner--tr" />
          <span className="glass-browse__corner glass-browse__corner--bl" />
          <span className="glass-browse__corner glass-browse__corner--br" />
        </div>

        <nav className="glass-browse__rail" aria-label="Glass dock rail">
          <div className="glass-browse__rail-chrome">
            <span className="glass-browse__rail-ring glass-browse__rail-ring--active">G</span>
            {BOOT_RAIL_ACTIONS.map((action) => (
              <span key={action.label} className="glass-browse__rail-btn" title={action.label}>
                {action.icon}
              </span>
            ))}
          </div>
        </nav>

        <div className="glass-browse__command-host">
          <form className="glass-browse__command glass-browse__command--armed command-bar--listening">
            <div className="glass-browse__command-row">
              <span className="glass-browse__mic glass-browse__mic--live" aria-hidden="true">
                <BootMicIcon />
              </span>
              <span className="glass-browse__input glass-intro__boot-command-placeholder">
                Ask across every window on your screen…
              </span>
              <div className="glass-browse__trailing">
                <span className="glass-browse__send" aria-hidden="true">
                  <BootSendIcon />
                </span>
              </div>
            </div>
            <span className="glass-browse__command-led" aria-hidden="true" />
          </form>
        </div>

        <div className="glass-browse__strip glass-browse__strip--aletheia-core">
          <div className="glass-browse__strip-group glass-browse__strip-group--left">
            {BOOT_STRIP_LEFT.map((tab) => (
              <span
                key={tab.label}
                className={`glass-browse__strip-tab glass-browse__strip-tab--${tab.kind}${tab.kind === "agents" ? " glass-browse__strip-tab--active" : ""}`}
              >
                <span className="glass-browse__strip-icon">{tab.icon}</span>
                <span>{tab.label}</span>
              </span>
            ))}
          </div>
          <div className="glass-browse__strip-group glass-browse__strip-group--center">
            <span className="glass-browse__strip-tab glass-browse__strip-tab--aletheia">
              <span className="glass-browse__strip-aletheia-dot" aria-hidden="true" />
              <span>Aletheia</span>
            </span>
          </div>
          <div className="glass-browse__strip-group glass-browse__strip-group--right">
            <span className="glass-browse__strip-tab glass-browse__strip-tab--quit">
              <span>Quit</span>
            </span>
          </div>
        </div>
      </div>

      <div className="glass-intro__boot-glass" aria-hidden="true" />
    </>
  );
}
