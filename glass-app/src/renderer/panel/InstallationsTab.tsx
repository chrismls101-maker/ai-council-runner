import { useEffect } from "react";
import { send, useGlassState } from "../useGlassState.ts";
import { PanelSection } from "./PanelSection.tsx";
import type { OmniParserInstallState } from "../../shared/omniParserInstall.ts";

function statusPillClass(status: OmniParserInstallState["statusLabel"]): string {
  switch (status) {
    case "ready":
      return "status-dot status-dot--ok";
    case "not_installed":
      return "status-dot status-dot--warn";
    default:
      return "status-dot status-dot--error";
  }
}

function statusText(status: OmniParserInstallState): string {
  switch (status.statusLabel) {
    case "ready":
      return "Installed — active with Companion";
    case "not_installed":
      return "Not installed";
    default:
      return "Sidecar unavailable";
  }
}

const OLLAMA_INSTALL_CMD =
  'brew install ollama || echo "\\nHomebrew not found. Visit https://ollama.com/download to install Ollama for macOS."';

export function InstallationsTab(): JSX.Element {
  const state = useGlassState();
  const omni = state.omniParserInstall;
  const ollamaInstalled = state.ollamaAvailable;

  useEffect(() => {
    send({ type: "refresh-omniparser-install" });
    const timer = window.setInterval(() => {
      send({ type: "refresh-omniparser-install" });
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const canInstall = omni?.sidecarPresent && !omni.weightsPresent;

  return (
    <div className="panel-tab-view" data-testid="glass-panel-installations-tab">
      <p className="empty panel__hint" style={{ marginBottom: 16 }}>
        Optional components that extend Glass. Installs run in the Glass terminal — you
        confirm with Enter before anything downloads.
      </p>

      <PanelSection
        title="OmniParser — Companion UI detection"
        description="Finds buttons and controls on screen when macOS Accessibility cannot. Turns on automatically with Companion after install."
        testId="glass-install-omniparser-section"
      >
        <div className="panel-section__row" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className={statusPillClass(omni?.statusLabel ?? "unavailable")} aria-hidden />
          <span data-testid="glass-install-omniparser-status">
            {omni ? statusText(omni) : "Checking…"}
          </span>
        </div>

        {omni?.weightsPresent ? (
          <p className="hint" style={{ marginTop: 12 }}>
            Ready. Toggle Companion on the strip — Glass starts the detector in the
            background (~30s first time per session). No .env flags needed.
          </p>
        ) : null}

        {canInstall ? (
          <>
            <ol className="hint" style={{ marginTop: 12, paddingLeft: 18 }}>
              <li>Click Install below</li>
              <li>Panel closes and Glass terminal opens</li>
              <li>Read the prompt and press Enter to confirm</li>
              <li>Wait for download to finish, then use Companion</li>
            </ol>
            <button
              type="button"
              className="gbtn gbtn--primary"
              data-testid="glass-install-omniparser-button"
              onClick={() => send({ type: "run-omniparser-install" })}
            >
              Install OmniParser
            </button>
          </>
        ) : null}

        {!omni?.sidecarPresent ? (
          <p className="empty" style={{ marginTop: 12 }}>
            OmniParser sidecar not found in this Glass build. Dev: ensure{" "}
            <code>desktop-glass/omniparser-sidecar</code> exists.
          </p>
        ) : null}
      </PanelSection>

      <PanelSection
        title="Ollama — local AI models"
        description="Runs AI models locally on your machine. Required if you want Glass to use local models instead of cloud APIs."
        testId="glass-install-ollama-section"
      >
        <div className="panel-section__row" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            className={ollamaInstalled ? "status-dot status-dot--ok" : "status-dot status-dot--warn"}
            aria-hidden
          />
          <span data-testid="glass-install-ollama-status">
            {ollamaInstalled ? "Installed — running" : "Not installed"}
          </span>
        </div>

        {ollamaInstalled ? (
          <p className="hint" style={{ marginTop: 12 }}>
            Ollama is running. Glass can use local models when configured.
          </p>
        ) : (
          <>
            <ol className="hint" style={{ marginTop: 12, paddingLeft: 18 }}>
              <li>Click Install below</li>
              <li>Glass terminal opens and runs the installer</li>
              <li>Requires Homebrew — if not installed, the terminal will show the manual download link</li>
              <li>Once complete, restart Glass to detect Ollama</li>
            </ol>
            <button
              type="button"
              className="gbtn gbtn--primary"
              data-testid="glass-install-ollama-button"
              onClick={() => {
                send({ type: "glass-terminal-run", command: OLLAMA_INSTALL_CMD });
              }}
            >
              Install Ollama
            </button>
          </>
        )}
      </PanelSection>
    </div>
  );
}
