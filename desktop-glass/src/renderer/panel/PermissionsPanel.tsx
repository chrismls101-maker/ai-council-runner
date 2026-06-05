import { useCallback } from "react";
import { send, useGlassState } from "../useGlassState.ts";
import type { GlassCommand } from "../../shared/ipc.ts";
import type { GlassCapabilityRow, GlassSetupActionType } from "../../shared/glassCapabilities.ts";
import { mapPermissionsApiToMic } from "../../shared/glassCapabilities.ts";
import { reportVirtualAudioDevices } from "./virtualAudioScan.ts";
import { PanelSection } from "./PanelSection.tsx";

function severityClass(severity: GlassCapabilityRow["severity"]): string {
  return `status-dot status-dot--${severity}`;
}

function sendSetupAction(action: GlassSetupActionType): void {
  send({ type: action } as GlassCommand);
}

async function queryMicPermissionWithoutPrompt(): Promise<void> {
  if (!navigator.permissions?.query) return;
  try {
    const result = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    send({
      type: "report-mic-permission",
      status: mapPermissionsApiToMic(result.state),
    });
  } catch {
    /* Permissions API unavailable */
  }
}

const PERMISSION_ROW_IDS = new Set<GlassCapabilityRow["id"]>([
  "screenRecording",
  "windowCapture",
  "vision",
  "server",
]);

export function PermissionsPanel(): JSX.Element {
  const state = useGlassState();
  const rows = (state.setupCapabilities ?? []).filter((row) => PERMISSION_ROW_IDS.has(row.id));

  const runSetupCheck = useCallback(async () => {
    await queryMicPermissionWithoutPrompt();
    await reportVirtualAudioDevices();
    send({ type: "run-setup-check" });
  }, []);

  const setupActions = (
    <>
      <button type="button" className="gbtn" onClick={() => void runSetupCheck()}>
        Run Setup Check
      </button>
      <button
        type="button"
        className="gbtn"
        data-testid="glass-run-capture-diagnostics"
        onClick={() => send({ type: "run-capture-diagnostics" })}
      >
        Run Capture Diagnostics
      </button>
    </>
  );

  return (
    <PanelSection
      title="Permissions & capture"
      description="Screen recording, vision, and server readiness. Refreshes automatically when Glass opens."
      actions={setupActions}
      testId="glass-panel-setup"
    >
      {state.duplicateAppWarning ? (
        <p className="setup-section__warning" data-testid="glass-duplicate-app-warning">
          {state.duplicateAppWarning}
        </p>
      ) : null}
      {state.setupCheckSummary ? (
        <p className="hint setup-section__summary">{state.setupCheckSummary}</p>
      ) : null}
      {state.captureDiagnosticsReport ? (
        <div
          className="setup-section__diagnostics-panel"
          data-testid="glass-capture-diagnostics-report"
        >
          <div className="setup-section__diagnostics-head">
            <strong>Capture diagnostics</strong>
            <button
              type="button"
              className="gbtn gbtn--ghost"
              data-testid="glass-capture-diagnostics-close"
              onClick={() => send({ type: "clear-capture-diagnostics-report" })}
            >
              Close
            </button>
          </div>
          <pre className="setup-section__diagnostics">
            {state.captureDiagnosticsReport.lines.join("\n")}
          </pre>
        </div>
      ) : null}
      <ul className="setup-section__rows setup-section__rows--grid">
        {rows.map((row) => (
          <li key={row.id} className="setup-section__row" data-testid={`glass-setup-row-${row.id}`}>
            <div className="setup-section__row-head">
              <span className={severityClass(row.severity)} aria-hidden="true" />
              <div className="setup-section__row-text">
                <strong>{labelForCapability(row.id)}</strong>
                <span className="setup-section__status">{row.label}</span>
                {row.detail ? <span className="setup-section__detail">{row.detail}</span> : null}
              </div>
            </div>
            {row.actions?.length ? (
              <div className="setup-section__row-footer">
                {row.actions.map((action) => (
                  <button
                    key={action.command}
                    type="button"
                    className="gbtn"
                    data-testid={`glass-setup-action-${row.id}-${action.command}`}
                    onClick={() => sendSetupAction(action.command)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            ) : row.actionLabel && row.actionCommand ? (
              <div className="setup-section__row-footer">
                <button
                  type="button"
                  className="gbtn"
                  data-testid={`glass-setup-action-${row.id}`}
                  onClick={() => sendSetupAction(row.actionCommand!)}
                >
                  {row.actionLabel}
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </PanelSection>
  );
}

function labelForCapability(id: GlassCapabilityRow["id"]): string {
  switch (id) {
    case "screenRecording":
      return "Screen Capture";
    case "windowCapture":
      return "Window Capture";
    case "microphone":
      return "Microphone";
    case "systemAudio":
      return "System Audio";
    case "vision":
      return "Vision";
    case "stt":
      return "STT";
    case "server":
      return "Server";
    default:
      return id;
  }
}
