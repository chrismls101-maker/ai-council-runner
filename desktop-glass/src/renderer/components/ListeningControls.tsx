import { send, useGlassState } from "../useGlassState.ts";
import { useTranscriptionContext } from "../TranscriptionProvider.tsx";

export function ListeningControls({ compact = false }: { compact?: boolean }): JSX.Element {
  const state = useGlassState();
  const tx = useTranscriptionContext();
  const listening = state.privacy.listening || tx.status === "listening";

  if (tx.selectedMode === "manual" && !listening) {
    return (
      <p className="empty">
        Choose Microphone or System Audio above, then press Start Listening.
      </p>
    );
  }

  return (
    <div className={`listening-controls${compact ? " listening-controls--compact" : ""}`}>
      {listening ? (
        <>
          <p className="privacy__warning">
            ● Listening {tx.listeningDuration} —{" "}
            {tx.selectedMode === "system_audio" ? "system audio" : "microphone"}
            {tx.transcribing ? " · transcribing…" : ""}
          </p>
          {tx.listeningHint ? <p className="empty">{tx.listeningHint}</p> : null}
          <button type="button" className="gbtn gbtn--danger" onClick={() => send({ type: "pause" })}>
            Stop Listening
          </button>
        </>
      ) : (
        <>
          <p className="empty">{tx.statusMessage}</p>
          {tx.listeningHint ? <p className="empty">{tx.listeningHint}</p> : null}
          {tx.sttFixHint ? <p className="empty">{tx.sttFixHint}</p> : null}
          <button
            type="button"
            className="gbtn gbtn--primary"
            onClick={() => tx.startListening()}
            disabled={!tx.canListen}
          >
            Start Listening
          </button>
        </>
      )}
      {tx.lastError ? <div className="error-banner">{tx.lastError}</div> : null}
    </div>
  );
}

export function OperationDiagnosticsFooter(): JSX.Element {
  const state = useGlassState();
  const diag = state.operationDiagnostics;

  return (
    <div className="operation-diagnostics">
      <p className="section-title">Operation diagnostics</p>
      <div className="summary-box operation-diagnostics__grid">
        <div>
          <strong>Last command</strong>
          <div>{diag.lastCommand ?? "—"}</div>
        </div>
        <div>
          <strong>Status</strong>
          <div>{diag.lastCommandStatus}</div>
        </div>
        <div>
          <strong>Listening source</strong>
          <div>{diag.listeningSource ?? state.transcriptionMode}</div>
        </div>
        <div>
          <strong>STT</strong>
          <div>{diag.sttProviderStatus ?? state.stt.status}</div>
        </div>
        <div>
          <strong>Capture</strong>
          <div>{diag.captureStatus ?? "—"}</div>
        </div>
        <div>
          <strong>Server STT</strong>
          <div>{diag.serverSttStatus ?? state.stt.endpoint}</div>
        </div>
      </div>
      {diag.lastError || state.lastError ? (
        <div className="error-banner">{diag.lastError ?? state.lastError}</div>
      ) : null}
    </div>
  );
}
