import { useEffect, useState, type CSSProperties, type JSX } from "react";
import type { GlassIntroPhase } from "./glassCinematicIntro";
import {
  INTRO_IDE_COMPOSER_PROMPT,
  INTRO_IDE_PROJECT,
  INTRO_IDE_STREAM_ITEMS,
  type IntroIdeStreamItem,
} from "./glassIntroIdeScript";
import {
  INTRO_HOLD,
  INTRO_IDE_ANSWER_TYPE_MS,
  INTRO_IDE_COMPOSE_TYPE_MS,
  INTRO_IDE_STREAM_STEP_MS,
} from "./glassIntroTiming";
import "./glass-intro-ide-shell.css";

const IDE_PHASES = new Set<GlassIntroPhase>([
  "open-ide",
  "ide-compose",
  "ide-stream",
  "ide-preview",
  "ide-zoom",
]);

const TREE_WIDTH = 220;
const STREAM_WIDTH = 380;

const PROJECT_FILES = [
  { path: "GLASS_CONTEXT.md", folder: false },
  { path: "package.json", folder: false },
  { path: "src/pages/GlassLandingPage.tsx", folder: false, selected: true },
  { path: "src/components/glass-landing/GlassSiteHero.tsx", folder: false },
] as const;

type CenterTab = "editor" | "preview";

function beatFromPhase(phase: GlassIntroPhase): "open" | "compose" | "stream" | "preview" | "zoom" | null {
  if (phase === "open-ide") return "open";
  if (phase === "ide-compose") return "compose";
  if (phase === "ide-stream") return "stream";
  if (phase === "ide-preview") return "preview";
  if (phase === "ide-zoom") return "zoom";
  return null;
}

function ToolGlyph({ name, spinning }: { name: string; spinning: boolean }): JSX.Element {
  const cls = `gide-transcript-tool__icon${spinning ? " gide-transcript-tool__icon--spin" : ""}`;
  if (name === "read_file") {
    return (
      <svg className={cls} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path d="M3 2.5h8a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M4 5h6M4 7h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "run_terminal_cmd") {
    return (
      <svg className={cls} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path d="M3 4.5 5.5 7 3 9.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 9.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className={cls} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="2.5" y="3" width="9" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 6h5M4.5 8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function StreamLine({ item }: { item: IntroIdeStreamItem }): JSX.Element {
  if (item.kind === "thinking") {
    return (
      <div className="gide-transcript__thinking glass-intro-ide__stream-line">
        <span className="gide-transcript__thinking-dots" aria-hidden="true">
          <span /><span /><span />
        </span>
        <span>Thinking</span>
      </div>
    );
  }
  if (item.kind === "activity") {
    return (
      <div className="gide-transcript__activity glass-intro-ide__stream-line">
        <span className="gide-transcript__activity-dot" aria-hidden="true" />
        <span className="gide-transcript__activity-text">{item.text}</span>
      </div>
    );
  }
  if (item.kind === "tool") {
    const statusClass =
      item.status === "running"
        ? "gide-transcript-tool--running"
        : item.status === "done"
          ? "gide-transcript-tool--done"
          : "";
    return (
      <div
        className={`gide-transcript-tool gide-transcript-tool--compact ${statusClass} glass-intro-ide__stream-line`}
      >
        <ToolGlyph name={item.name} spinning={item.status === "running"} />
        <div className="gide-transcript-tool__body">
          <span className="gide-transcript-tool__label">{item.label}</span>
          {item.detail && item.status === "done" ? (
            <span className="gide-transcript-tool__result">{item.detail}</span>
          ) : null}
        </div>
        {item.status === "done" ? (
          <span className="gide-transcript-tool__badge gide-transcript-tool__badge--done">Done</span>
        ) : (
          <span className="gide-transcript-tool__badge gide-transcript-tool__badge--live">Live</span>
        )}
      </div>
    );
  }
  return (
    <p className={`gide-transcript__text glass-intro-ide__stream-line${item.live ? " gide-transcript__text--live" : ""}`}>
      {item.text}
    </p>
  );
}

/** Glass Coder IDE intro — mirrors real `GlassIdeShell` layout and stream. */
export default function GlassIntroIdeMock({ phase }: { phase: GlassIntroPhase }): JSX.Element | null {
  const beat = beatFromPhase(phase);
  const [revealed, setRevealed] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [composerSubmitted, setComposerSubmitted] = useState(false);
  const [submittedPrompt, setSubmittedPrompt] = useState("");
  const [streamCount, setStreamCount] = useState(0);
  const [centerTab, setCenterTab] = useState<CenterTab>("editor");
  const [previewReady, setPreviewReady] = useState(false);
  const [liveAnswer, setLiveAnswer] = useState("");

  useEffect(() => {
    if (!beat) {
      setRevealed(false);
      setComposerText("");
      setComposerSubmitted(false);
      setSubmittedPrompt("");
      setStreamCount(0);
      setCenterTab("editor");
      setPreviewReady(false);
      setLiveAnswer("");
      return;
    }
    if (beat === "open") {
      setComposerText("");
      setComposerSubmitted(false);
      setSubmittedPrompt("");
      setStreamCount(0);
      setCenterTab("editor");
      setPreviewReady(false);
      setLiveAnswer("");
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setRevealed(true));
      });
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [beat]);

  useEffect(() => {
    if (beat !== "compose") return;
    setComposerText("");
    setComposerSubmitted(false);
    setSubmittedPrompt("");
    let index = 0;
    const full = INTRO_IDE_COMPOSER_PROMPT;
    const interval = window.setInterval(() => {
      index += 1;
      setComposerText(full.slice(0, index));
      if (index >= full.length) {
        window.clearInterval(interval);
        window.setTimeout(() => {
          setSubmittedPrompt(full);
          setComposerSubmitted(true);
          setComposerText("");
        }, INTRO_HOLD.afterIdeSubmit);
      }
    }, INTRO_IDE_COMPOSE_TYPE_MS);
    return () => window.clearInterval(interval);
  }, [beat]);

  useEffect(() => {
    if (beat !== "stream") {
      if (beat === "preview" || beat === "zoom") {
        setStreamCount(INTRO_IDE_STREAM_ITEMS.length);
        setCenterTab("preview");
        setPreviewReady(true);
      }
      return;
    }
    if (!submittedPrompt) {
      setSubmittedPrompt(INTRO_IDE_COMPOSER_PROMPT);
      setComposerSubmitted(true);
      setComposerText("");
    }
    setStreamCount(0);
    setCenterTab("editor");
    setPreviewReady(false);
    setLiveAnswer("");
    const timers: number[] = [];
    INTRO_IDE_STREAM_ITEMS.forEach((item, i) => {
      timers.push(
        window.setTimeout(() => {
          setStreamCount(i + 1);
          if (item.kind === "tool" && item.name === "open_preview" && item.status === "done") {
            setPreviewReady(true);
            setCenterTab("preview");
          }
        }, i * INTRO_IDE_STREAM_STEP_MS),
      );
    });
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [beat, submittedPrompt]);

  useEffect(() => {
    if (beat !== "stream" && beat !== "preview") return;
    const textItem = INTRO_IDE_STREAM_ITEMS.find((item) => item.kind === "text");
    if (!textItem || textItem.kind !== "text") return;
    if (streamCount < INTRO_IDE_STREAM_ITEMS.length) return;

    let index = 0;
    const interval = window.setInterval(() => {
      index += 1;
      setLiveAnswer(textItem.text.slice(0, index));
      if (index >= textItem.text.length) window.clearInterval(interval);
    }, INTRO_IDE_ANSWER_TYPE_MS);
    return () => window.clearInterval(interval);
  }, [beat, streamCount]);

  if (!IDE_PHASES.has(phase) || !beat) return null;

  const zooming = beat === "zoom";
  const streamItems = INTRO_IDE_STREAM_ITEMS.slice(0, streamCount).map((item) => {
    if (item.kind === "text" && item.live && liveAnswer) {
      return { ...item, text: liveAnswer };
    }
    return item;
  });

  const showPreviewPanel = centerTab === "preview";

  const composerValue = beat === "compose" && !composerSubmitted ? composerText : "";

  return (
    <div
      className={[
        "glass-intro-ide",
        "gide-shell",
        revealed ? "glass-intro-ide--open" : "",
        zooming ? "glass-intro-ide--zoom" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="glass-intro-ide-mock"
      data-presence={beat === "stream" ? "thinking" : beat === "preview" || beat === "zoom" ? "answering" : undefined}
      style={{ "--gide-terminal-chrome-h": "158px" } as CSSProperties}
      aria-hidden="true"
    >
      <div className="gide-shell__glass" aria-hidden="true" />
      <div className="gide-presence-aura" aria-hidden="true" />

      <header className="gide-header">
        <div className="gide-header__lead">
          <span className="gide-title">Glass Coder IDE</span>
        </div>
        <div className="gide-header__center">
          <button type="button" className="gide-project-switch-btn" tabIndex={-1}>
            {INTRO_IDE_PROJECT}
          </button>
        </div>
        <div className="gide-header__right">
          <button type="button" className="ws-chrome-exit" tabIndex={-1}>
            Exit IDE
          </button>
        </div>
      </header>

      <div className="gide-main">
        <section className="gide-pane gide-pane--tree" style={{ width: TREE_WIDTH }} aria-label="Project files">
          <div className="gide-tree">
            <div className="gide-tree__head">
              <span>Explorer</span>
            </div>
            <ul className="gide-tree__list">
              {PROJECT_FILES.map((file) => (
                <li key={file.path}>
                  <button
                    type="button"
                    className={`gide-tree__row${"selected" in file && file.selected ? " gide-tree__row--selected" : ""}`}
                    tabIndex={-1}
                  >
                    <span className="gide-tree__icon" aria-hidden="true">
                      ·
                    </span>
                    {file.path.split("/").pop()}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="gide-split gide-split--horizontal" aria-hidden="true" />

        <section className="gide-pane gide-pane--center" aria-label="Editor and terminal">
          <div className="gide-center-stack">
            <div className="gide-center-editor" style={{ flex: "1 1 0", minHeight: 0 }}>
              <div className="gide-editor-pane">
                <div className="gide-center-tabs">
                  <button
                    type="button"
                    className={`gide-center-tab${centerTab === "editor" ? " gide-center-tab--active" : ""}`}
                    tabIndex={-1}
                  >
                    Editor
                  </button>
                  <button
                    type="button"
                    className={`gide-center-tab${centerTab === "preview" ? " gide-center-tab--active" : ""}`}
                    tabIndex={-1}
                  >
                    Preview
                  </button>
                </div>
                <div className="gide-center-tab-body gide-center-tab-body--stacked">
                  <div
                    className={`gide-center-tab-panel${!showPreviewPanel ? " gide-center-tab-panel--behind" : ""}`}
                    aria-hidden={!showPreviewPanel}
                  >
                    <div className="gide-preview">
                      <div className="gide-preview__toolbar">
                        <input
                          type="text"
                          className="gide-preview__url"
                          readOnly
                          value={previewReady ? "https://iivo.ai" : ""}
                          placeholder="http://localhost:5173"
                          tabIndex={-1}
                        />
                        <button type="button" className="gide-preview__btn" tabIndex={-1} disabled={!previewReady}>
                          Reload
                        </button>
                      </div>
                      <div className="gide-preview__frame">
                        {previewReady ? (
                          <div className="glass-intro-ide__preview-site">
                            <p className="glass-intro-ide__preview-kicker">Introducing the next layer</p>
                            <h2>IIVO Glass</h2>
                            <p>Intelligent glass across every Mac app.</p>
                            <span className="glass-intro-ide__preview-cta">Experience the next layer</span>
                          </div>
                        ) : (
                          <div className="glass-intro-ide__preview-empty">
                            <span className="glass-intro-ide__preview-empty-icon" aria-hidden="true">◇</span>
                            <p>Live preview will appear here after Glass Coder opens the site.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div
                    className={`gide-center-tab-panel${showPreviewPanel ? " gide-center-tab-panel--behind" : ""}`}
                    aria-hidden={showPreviewPanel}
                  >
                    <div className="gide-editor-workspace">
                      <div className="gide-file-tabs">
                        <span className="gide-file-tab gide-file-tab--active">GlassLandingPage.tsx</span>
                      </div>
                      <pre className="gide-editor-surface">
                        <code>
                          {`// Glass Coder — intelligence layer above every app\nexport default function GlassLandingPage() {\n  return <GlassSiteHero />;\n}`}
                        </code>
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="glass-intro-ide__terminal-strip gide-center-terminal gide-center-terminal--collapsed">
              <div className="glass-intro-ide__terminal-strip-inner">
                ⌃ → Shell · Describe what you want — Enter converts to command
              </div>
            </div>
          </div>
        </section>

        <div className="gide-split gide-split--horizontal" aria-hidden="true" />

        <section className="gide-pane gide-pane--stream" style={{ width: STREAM_WIDTH }} aria-label="AI stream">
          <div className="gide-stream-pane">
            <div className="gide-stream-toolbar">
              <span className="gide-pane__label">AI stream</span>
            </div>
            <div className="gide-ide-feed">
              <div className="gide-transcript">
                {submittedPrompt && (beat === "stream" || beat === "preview" || beat === "zoom") ? (
                  <p className="gide-transcript__text glass-intro-ide__stream-line glass-intro-ide__user-prompt">
                    {submittedPrompt}
                  </p>
                ) : null}
                {streamItems.map((item, index) => (
                  <StreamLine key={`${item.kind}-${index}`} item={item} />
                ))}
              </div>
            </div>
            <div className="gide-stream-composer">
              <div className="gide-composer-field">
                <div className="gide-composer-input-wrap">
                  <textarea
                    className="gide-composer-input"
                    readOnly
                    value={composerValue}
                    rows={2}
                    placeholder="Ask Glass Coder to build, fix, or ship…"
                    tabIndex={-1}
                  />
                  <div className="gide-composer-input-bar">
                    <div className="gide-composer-input-bar__left">
                      <span className="gide-composer-mode-select__trigger">Agent</span>
                      <span className="gide-composer-mode-select__trigger">Composer</span>
                    </div>
                    <button
                      type="button"
                      className={`gide-composer-run${
                        beat === "compose" && composerText.length > 0 && !composerSubmitted
                          ? " gide-composer-run--ready"
                          : beat === "stream" && streamCount > 0
                            ? " gide-composer-run--stop"
                            : ""
                      }`}
                      tabIndex={-1}
                      aria-hidden="true"
                    >
                      {beat === "stream" && streamCount > 0 ? "■" : "↑"}
                    </button>
                  </div>
                </div>
              </div>
              <div className="gide-chat-footer">
                <span>↵ send · Shift+↵ newline · @ file · Files → output/</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <footer className="gide-cost-footer gide-cost-footer--live">
        <span className="gide-cost-footer__label">This run</span>
        <span className="gide-cost-footer__value">Measuring token usage…</span>
      </footer>

      {zooming ? <div className="glass-intro-ide__zoom-flash" aria-hidden="true" /> : null}
    </div>
  );
}
