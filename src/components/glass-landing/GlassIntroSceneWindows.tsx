import type { JSX, ReactNode } from "react";
import GlassIntroTerminalDemo from "./GlassIntroTerminalDemo";
import type { GlassIntroPhase } from "./glassCinematicIntro";

export type IntroSceneWindow = "pdf" | "notes" | "terminal" | "finder" | null;

const WINDOW_PHASES: Partial<Record<GlassIntroPhase, IntroSceneWindow>> = {
  "open-pdf": "pdf",
  "cursor-notes": "pdf",
  "open-notes": "notes",
  "command-demo": "notes",
  "command-response": "notes",
  "cursor-agents": "notes",
  "agents-click": "notes",
  "open-agents": "notes",
  "cursor-coder": "notes",
  "coder-click": "notes",
  "cursor-terminal": "notes",
  "terminal-click": "notes",
  "open-terminal": "terminal",
  "terminal-voice": "terminal",
  "terminal-demo": "terminal",
  "terminal-close": "terminal",
  "cursor-finder": "finder",
  "finder-click": "finder",
  "open-finder": "finder",
  "cursor-safari": "finder",
  "safari-click": "finder",
};

const SCENE_ACT: Partial<Record<IntroSceneWindow, number>> = {
  pdf: 1,
  notes: 2,
  terminal: 3,
  finder: 4,
};

export function introSceneWindow(phase: GlassIntroPhase): IntroSceneWindow {
  if (phase === "open-ide" || phase.startsWith("ide-")) return null;
  if (phase === "safari-open" || phase === "safari-typing" || phase === "safari-load") return null;
  if (phase === "site-reveal" || phase === "glass-site" || phase === "complete") return null;
  return WINDOW_PHASES[phase] ?? null;
}

function WindowChrome({
  title,
  app,
  children,
}: {
  title: string;
  app?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="glass-intro-window glass-intro-window--rise">
      <div className="glass-intro-window__titlebar">
        <div className="glass-intro-window__lights" aria-hidden="true">
          <span className="glass-intro-window__dot glass-intro-window__dot--red" />
          <span className="glass-intro-window__dot glass-intro-window__dot--amber" />
          <span className="glass-intro-window__dot glass-intro-window__dot--green" />
        </div>
        <span className="glass-intro-window__title">{title}</span>
        {app ? <span className="glass-intro-window__app">{app}</span> : null}
      </div>
      <div className="glass-intro-window__body">{children}</div>
    </div>
  );
}

/** Center-spread reveal — matches real Glass terminal window open. */
function IntroTerminalReveal({ phase }: { phase: GlassIntroPhase }): JSX.Element {
  return <GlassIntroTerminalDemo phase={phase} />;
}

/** macOS window mocks during intro — context switches while Glass stays above. */
export default function GlassIntroSceneWindows({ phase }: { phase: GlassIntroPhase }): JSX.Element | null {
  const active = introSceneWindow(phase);
  if (!active) return null;

  const act = SCENE_ACT[active] ?? 1;

  return (
    <div
      className={`glass-intro-scene-windows glass-intro-scene-windows--${active}`}
      data-scene-act={act}
      aria-hidden="true"
    >
      <div className="glass-intro-scene-flash" aria-hidden="true" />

      {active === "pdf" ? (
        <WindowChrome title="Release Notes.pdf — Page 1 of 3" app="Preview">
          <div className="glass-intro-window__preview">
            <div className="glass-intro-window__preview-toolbar">
              <span className="glass-intro-window__preview-zoom">−</span>
              <span className="glass-intro-window__preview-zoom glass-intro-window__preview-zoom--value">100%</span>
              <span className="glass-intro-window__preview-zoom">+</span>
              <span className="glass-intro-window__preview-divider" />
              <span className="glass-intro-window__preview-share">Share</span>
            </div>
            <div className="glass-intro-window__preview-canvas">
              <article className="glass-intro-window__pdf-page">
                <p className="glass-intro-window__pdf-kicker">IIVO Glass · Category Brief</p>
                <h2>The Intelligence Layer</h2>
                <p>
                  IIVO Glass is the next layer of AI-native computing — intelligent glass above macOS,
                  reading every window you capture, every document you open, every meeting you record.
                  Not a chat tab. Not a per-app copilot. An operating layer.
                </p>
                <p>
                  Lens fuses context across apps in one session. Aletheia speaks. Terminal converts
                  voice to shell. Agents ship code from the overlay — while you never leave flow.
                </p>
                <div className="glass-intro-window__pdf-lines" />
              </article>
            </div>
          </div>
        </WindowChrome>
      ) : null}

      {active === "notes" ? (
        <WindowChrome title="Meeting Notes.txt" app="TextEdit">
          <div className="glass-intro-window__textedit">
            <div className="glass-intro-window__textedit-toolbar">
              <span>Helvetica</span>
              <span>13</span>
              <span className="glass-intro-window__textedit-bold">B</span>
              <span className="glass-intro-window__textedit-italic">I</span>
              <span className="glass-intro-window__textedit-rule" />
            </div>
            <div className="glass-intro-window__notes">
              <p>— Product sync · Glass launch · intelligence layer</p>
              <p><strong>Action:</strong> Ship Lens cross-window context in overlay — Iivo</p>
              <p><strong>Action:</strong> Voice terminal — port 3000, restart dev, open localhost — You</p>
              <p><strong>Action:</strong> Council agents for code review from any app — Team</p>
              <p>Positioning: intelligent glass across all apps. Not tab AI. Category shift.</p>
              <p className="glass-intro-window__notes-cursor">▍</p>
            </div>
          </div>
        </WindowChrome>
      ) : null}

      {active === "terminal" ? <IntroTerminalReveal phase={phase} /> : null}

      {active === "finder" ? (
        <WindowChrome title="Projects" app="Finder">
          <div className="glass-intro-window__finder">
            <div className="glass-intro-window__finder-toolbar">
              <span className="glass-intro-window__finder-nav glass-intro-window__finder-nav--back" />
              <span className="glass-intro-window__finder-nav glass-intro-window__finder-nav--fwd" />
              <span className="glass-intro-window__finder-path">iCloud Drive › Projects</span>
              <span className="glass-intro-window__finder-view">
                <span className="glass-intro-window__finder-view-btn glass-intro-window__finder-view-btn--active" />
                <span className="glass-intro-window__finder-view-btn" />
              </span>
            </div>
            <div className="glass-intro-window__finder-body">
              <div className="glass-intro-window__finder-sidebar">
                <p className="glass-intro-window__finder-sidebar-kicker">Favorites</p>
                <span><i className="glass-intro-window__finder-sidebar-icon glass-intro-window__finder-sidebar-icon--airdrop" />AirDrop</span>
                <span><i className="glass-intro-window__finder-sidebar-icon glass-intro-window__finder-sidebar-icon--recents" />Recents</span>
                <span><i className="glass-intro-window__finder-sidebar-icon glass-intro-window__finder-sidebar-icon--desktop" />Desktop</span>
                <span><i className="glass-intro-window__finder-sidebar-icon glass-intro-window__finder-sidebar-icon--documents" />Documents</span>
                <span className="glass-intro-window__finder-active">
                  <i className="glass-intro-window__finder-sidebar-icon glass-intro-window__finder-sidebar-icon--folder" />Projects
                </span>
              </div>
              <div className="glass-intro-window__finder-grid">
                <div><i className="glass-intro-window__finder-folder" />Roadmap</div>
                <div><i className="glass-intro-window__finder-folder" />Design</div>
                <div><i className="glass-intro-window__finder-folder" />Research</div>
                <div><i className="glass-intro-window__finder-file" />brief.pdf</div>
                <div><i className="glass-intro-window__finder-file glass-intro-window__finder-file--code" />Glass.swift</div>
                <div><i className="glass-intro-window__finder-file glass-intro-window__finder-file--image" />hero.png</div>
              </div>
            </div>
          </div>
        </WindowChrome>
      ) : null}
    </div>
  );
}
