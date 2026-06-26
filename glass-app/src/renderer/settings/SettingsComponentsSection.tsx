import { useEffect, type ReactNode } from "react";
import { Cpu, Eye } from "lucide-react";
import type { OmniParserInstallState } from "../../shared/omniParserInstall.ts";
import { send, useGlassState } from "../useGlassState.ts";

type CardStatus = "ok" | "warn" | "idle" | "error";

const OLLAMA_INSTALL_CMD =
  'brew install ollama || echo "\\nHomebrew not found. Visit https://ollama.com/download to install Ollama for macOS."';

function omniStatus(status: OmniParserInstallState["statusLabel"]): CardStatus {
  if (status === "ready") return "ok";
  if (status === "not_installed") return "warn";
  return "error";
}

function omniSummary(omni: OmniParserInstallState | undefined): string {
  if (!omni) return "Checking install status…";
  if (omni.weightsPresent) {
    return "Installed — Aletheia can find more on-screen controls for highlights and step-by-step guidance.";
  }
  if (!omni.sidecarPresent) return "Sidecar not bundled in this Glass build.";
  return "Optional — helps Aletheia spot buttons and fields when macOS Accessibility cannot.";
}

function ComponentPipelineCard({
  step,
  title,
  summary,
  status,
  icon,
  children,
  testId,
}: {
  step: string;
  title: string;
  summary: string;
  status: CardStatus;
  icon: JSX.Element;
  children: ReactNode;
  testId: string;
}): JSX.Element {
  const statusText =
    status === "ok" ? "Ready" : status === "warn" ? "Install needed" : status === "error" ? "Issue" : "Optional";

  return (
    <article className="glass-settings__audio-card" data-testid={testId}>
      <div className="glass-settings__audio-card-head">
        <span className="glass-settings__audio-step">{step}</span>
        <span className={`glass-settings__audio-status glass-settings__audio-status--${status}`}>
          {statusText}
        </span>
      </div>
      <div className="glass-settings__audio-card-main">
        <span className="glass-settings__audio-icon">{icon}</span>
        <div className="glass-settings__audio-copy">
          <h3 className="glass-settings__audio-title">{title}</h3>
          <p className="glass-settings__audio-summary">{summary}</p>
        </div>
      </div>
      <div className="glass-settings__audio-card-body">{children}</div>
    </article>
  );
}

export function SettingsComponentsSection(): JSX.Element {
  const state = useGlassState();
  const omni = state.omniParserInstall;
  const ollamaInstalled = state.ollamaAvailable;
  const canInstallOmni = omni?.sidecarPresent && !omni.weightsPresent;

  useEffect(() => {
    send({ type: "refresh-omniparser-install" });
    const timer = window.setInterval(() => {
      send({ type: "refresh-omniparser-install" });
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="glass-settings__components" data-testid="glass-settings-components">
      <p className="glass-settings__audio-lede">
        Optional add-ons that extend Glass. Installs open the Glass terminal — you confirm with{" "}
        <strong>Enter</strong> before anything downloads.
      </p>

      <ComponentPipelineCard
        step="1"
        title="OmniParser"
        summary={omniSummary(omni)}
        status={omni ? omniStatus(omni.statusLabel) : "idle"}
        icon={<Eye size={26} strokeWidth={1.75} />}
        testId="glass-settings-component-omniparser"
      >
        <p className="glass-settings__audio-detail">
          Powers richer UI for <strong>Aletheia</strong> (toggle on the builder strip). When Aletheia
          is listening, she reads your screen and draws live guidance on top of apps — glowing
          boxes around buttons and fields, spotlights, callouts (&quot;click here&quot;), and
          step-by-step pointers as you work.
        </p>
        <p className="glass-settings__block-hint">
          Glass already maps most native and Chrome controls via Accessibility and DOM. OmniParser adds
          a local screenshot scan for the rest — dense layouts, custom Electron UIs, design tools,
          and other apps where macOS cannot name every control. Install once; Aletheia uses it
          automatically when Companion is on.
        </p>
        {canInstallOmni ? (
          <>
            <ol className="glass-settings__account-steps">
              <li>Click Install below</li>
              <li>Glass terminal opens with the installer</li>
              <li>Press Enter to confirm, then wait for the download</li>
            </ol>
            <div className="glass-settings__audio-actions">
              <button
                type="button"
                className="gbtn gbtn--primary"
                data-testid="glass-install-omniparser-button"
                onClick={() => send({ type: "run-omniparser-install" })}
              >
                Install OmniParser
              </button>
            </div>
          </>
        ) : null}
        {!omni?.sidecarPresent ? (
          <p className="glass-settings__block-hint">
            Dev builds: ensure <code>glass-app/omniparser-sidecar</code> is present.
          </p>
        ) : null}
      </ComponentPipelineCard>

      <ComponentPipelineCard
        step="2"
        title="Ollama"
        summary={
          ollamaInstalled
            ? "Running locally — Glass can use free offline models and semantic code search."
            : "Local AI models on your Mac — required for codebase indexing without cloud APIs."
        }
        status={ollamaInstalled ? "ok" : "warn"}
        icon={<Cpu size={26} strokeWidth={1.75} />}
        testId="glass-settings-component-ollama"
      >
        {!ollamaInstalled ? (
          <>
            <ol className="glass-settings__account-steps">
              <li>Click Install below</li>
              <li>Terminal runs Homebrew install (or shows manual link)</li>
              <li>Restart Glass after install completes</li>
            </ol>
            <div className="glass-settings__audio-actions">
              <button
                type="button"
                className="gbtn gbtn--primary"
                data-testid="glass-install-ollama-button"
                onClick={() => send({ type: "glass-terminal-run", command: OLLAMA_INSTALL_CMD })}
              >
                Install Ollama
              </button>
            </div>
          </>
        ) : (
          <p className="glass-settings__block-hint">
            Configure indexing under <strong>Providers → Glass Agents</strong>.
          </p>
        )}
      </ComponentPipelineCard>
    </div>
  );
}
