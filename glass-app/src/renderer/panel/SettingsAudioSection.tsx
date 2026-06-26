import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Headphones, Mic, Radio, Speaker, Waves } from "lucide-react";
import type { GlassCapabilityRow, GlassSetupActionType } from "../../shared/glassCapabilities.ts";
import type { GlassCommand, GlassState } from "../../shared/ipc.ts";
import {
  buildSystemAudioSourceOptions,
  isSystemAudioConnected,
  NATIVE_SYSTEM_AUDIO_SOURCE_VALUE,
  resolveSelectedDeviceLabel,
  resolveSystemAudioRowStatus,
  resolveSystemAudioSignalStatus,
} from "../../shared/systemAudioUi.ts";
import { send } from "../useGlassState.ts";
import { SystemAudioLiveMeter } from "./SystemAudioLiveMeter.tsx";
import { reportVirtualAudioDevices } from "./virtualAudioScan.ts";
import { SettingsChoiceCard, SettingsChoiceGrid } from "../settings/SettingsChoiceCard.tsx";

function sendSetupAction(action: GlassSetupActionType): void {
  send({ type: action } as GlassCommand);
}

function capabilityStatus(row: GlassCapabilityRow | undefined): "ok" | "warn" | "idle" | "error" {
  if (!row) return "idle";
  if (row.severity === "ok") return "ok";
  if (row.severity === "warn") return "warn";
  if (row.severity === "error") return "error";
  return "idle";
}

type AudioCardProps = {
  step: string;
  title: string;
  summary: string;
  status: "ok" | "warn" | "idle" | "error";
  icon: JSX.Element;
  children: ReactNode;
  testId: string;
};

function AudioPipelineCard({
  step,
  title,
  summary,
  status,
  icon,
  children,
  testId,
}: AudioCardProps): JSX.Element {
  return (
    <article className="glass-settings__audio-card" data-testid={testId}>
      <div className="glass-settings__audio-card-head">
        <span className="glass-settings__audio-step">{step}</span>
        <span className={`glass-settings__audio-status glass-settings__audio-status--${status}`}>
          {status === "ok" ? "Ready" : status === "warn" ? "Action needed" : status === "error" ? "Issue" : "Not set up"}
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

export function SettingsAudioSection({ state }: { state: GlassState }): JSX.Element {
  const settings = state.glassSettings;
  const [liveTesting, setLiveTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [scanning, setScanning] = useState(false);

  const installStatus = state.blackHoleInstallStatus ?? "idle";
  const isInstalling =
    installStatus === "downloading" ||
    installStatus === "installing" ||
    installStatus === "configuring";
  const installDone = installStatus === "done";
  const installError = installStatus === "error";
  const installProgress = state.blackHoleInstallProgress ?? "";

  const virtualDevices = state.virtualAudioDevices ?? [];
  const systemConnected = isSystemAudioConnected(state.systemAudioStatus);
  const systemStatusLabel = resolveSystemAudioRowStatus({
    systemAudioStatus: state.systemAudioStatus,
    virtualDevices,
    selectedVirtualAudioDeviceId: state.selectedVirtualAudioDeviceId,
  });
  const signalStatus = resolveSystemAudioSignalStatus(state.systemAudioDetail);
  const selectedLabel = resolveSelectedDeviceLabel({
    virtualDevices,
    selectedVirtualAudioDeviceId: state.selectedVirtualAudioDeviceId,
  });

  const micRow = state.setupCapabilities?.find((row) => row.id === "microphone");
  const sttRow = state.setupCapabilities?.find((row) => row.id === "stt");

  const systemNeedsInstall = !installDone && !systemConnected;
  const systemCardStatus: AudioCardProps["status"] = systemConnected
    ? "ok"
    : isInstalling
      ? "idle"
      : installError || /needed|unavailable/i.test(systemStatusLabel)
        ? "warn"
        : "idle";

  const systemSummary = systemConnected
    ? `Routing through ${selectedLabel}. Signal: ${signalStatus}.`
    : installDone
      ? "BlackHole is installed — tap Connect to route app audio (YouTube, meetings, etc.)."
      : "Captures what your Mac plays — not your microphone. Requires a one-time BlackHole install.";

  useEffect(() => {
    if (connecting && systemConnected) setConnecting(false);
  }, [connecting, systemConnected]);

  useEffect(() => {
    if (!connecting) return;
    const timer = window.setTimeout(() => setConnecting(false), 10_000);
    return () => window.clearTimeout(timer);
  }, [connecting]);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    await reportVirtualAudioDevices();
    send({ type: "connect-system-audio" });
  }, []);

  const handleDetect = useCallback(async () => {
    setScanning(true);
    await reportVirtualAudioDevices();
    setScanning(false);
  }, []);

  const sourceOptions = buildSystemAudioSourceOptions(virtualDevices);
  const selectedValue = state.selectedVirtualAudioDeviceId ?? NATIVE_SYSTEM_AUDIO_SOURCE_VALUE;

  return (
    <div className="glass-settings__audio" data-testid="glass-settings-audio-section">
      <p className="glass-settings__audio-lede">
        Three layers: <strong>system audio</strong> (apps &amp; media), <strong>microphone</strong>{" "}
        (your voice), and <strong>speech-to-text</strong> (transcription). Set up each in order.
      </p>

      <AudioPipelineCard
        step="1"
        title="System audio"
        summary={systemSummary}
        status={systemCardStatus}
        icon={<Headphones size={26} strokeWidth={1.75} />}
        testId="glass-settings-audio-system"
      >
        {isInstalling ? (
          <p className="hint" data-testid="blackhole-install-progress">
            {installProgress || "Installing BlackHole…"}
          </p>
        ) : null}
        {installError && !isInstalling ? (
          <p className="hint hint--error" data-testid="blackhole-install-error">
            {installProgress || "Installation failed — try again."}
          </p>
        ) : null}

        <div className="glass-settings__audio-actions">
          {systemNeedsInstall && !isInstalling ? (
            <button
              type="button"
              className="gbtn gbtn--primary"
              data-testid="glass-install-system-audio"
              onClick={() => send({ type: "install-system-audio" })}
            >
              Download &amp; install BlackHole
            </button>
          ) : (
            <button
              type="button"
              className={`gbtn gbtn--primary${systemConnected ? " gbtn--connect-glass--connected" : ""}`}
              data-testid="glass-connect-system-audio"
              disabled={connecting || isInstalling}
              onClick={() => void handleConnect()}
            >
              {connecting ? "Connecting…" : systemConnected ? "Reconnect system audio" : "Connect system audio"}
            </button>
          )}
          <button
            type="button"
            className="gbtn gbtn--ghost"
            data-testid="glass-test-system-audio-bar"
            disabled={liveTesting || isInstalling}
            onClick={() => {
              setLiveTesting(true);
              send({ type: "clear-last-notice" });
            }}
          >
            {liveTesting ? "Testing…" : "Test levels"}
          </button>
          <button
            type="button"
            className="gbtn gbtn--ghost"
            data-testid="glass-detect-audio-devices"
            disabled={scanning || isInstalling}
            onClick={() => void handleDetect()}
          >
            {scanning ? "Scanning…" : "Scan devices"}
          </button>
        </div>

        {liveTesting ? (
          <div className="glass-settings__audio-meter">
            <SystemAudioLiveMeter
              deviceId={state.selectedVirtualAudioDeviceId}
              onDone={() => setLiveTesting(false)}
              keepMonitoring
            />
            <button
              type="button"
              className="gbtn gbtn--ghost gbtn--small"
              data-testid="glass-stop-system-audio-meter"
              onClick={() => setLiveTesting(false)}
            >
              Stop meter
            </button>
          </div>
        ) : null}

        {virtualDevices.length > 0 ? (
          <label className="glass-settings__audio-field">
            <span>Input route</span>
            <select
              data-testid="glass-system-audio-source-select"
              value={selectedValue}
              onChange={(e) =>
                send({ type: "set-selected-virtual-audio-device", deviceId: e.target.value })
              }
            >
              {sourceOptions.map((option) => (
                <option key={option.value || "native"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </AudioPipelineCard>

      <AudioPipelineCard
        step="2"
        title="Microphone"
        summary={
          micRow?.detail ??
          micRow?.label ??
          "Lets Glass hear you for Listen mode and voice commands."
        }
        status={capabilityStatus(micRow)}
        icon={<Mic size={26} strokeWidth={1.75} />}
        testId="glass-settings-audio-mic"
      >
        <p className="glass-settings__audio-detail">{micRow?.label ?? "Checking…"}</p>
        <div className="glass-settings__audio-actions">
          {micRow?.actions?.map((action) => (
            <button
              key={action.command}
              type="button"
              className="gbtn gbtn--primary"
              data-testid={`glass-setup-action-microphone-${action.command}`}
              onClick={() => sendSetupAction(action.command)}
            >
              {action.label}
            </button>
          )) ?? null}
          {!micRow?.actions?.length && micRow?.actionCommand ? (
            <button
              type="button"
              className="gbtn gbtn--primary"
              data-testid="glass-setup-action-microphone"
              onClick={() => sendSetupAction(micRow.actionCommand!)}
            >
              {micRow.actionLabel}
            </button>
          ) : null}
        </div>
      </AudioPipelineCard>

      <AudioPipelineCard
        step="3"
        title="Speech-to-text"
        summary={
          sttRow?.detail ??
          "Transcribes audio using your configured provider (OpenAI or local)."
        }
        status={capabilityStatus(sttRow)}
        icon={<Waves size={26} strokeWidth={1.75} />}
        testId="glass-settings-audio-stt"
      >
        <p className="glass-settings__audio-detail">{sttRow?.label ?? "Checking…"}</p>
        <div className="glass-settings__audio-actions">
          {sttRow?.actions?.map((action) => (
            <button
              key={action.command}
              type="button"
              className="gbtn gbtn--ghost"
              data-testid={`glass-setup-action-stt-${action.command}`}
              onClick={() => sendSetupAction(action.command)}
            >
              {action.label}
            </button>
          )) ?? null}
        </div>
        <p className="glass-settings__block-hint">
          Add an OpenAI key under <strong>Providers</strong> if STT shows missing credentials.
        </p>
      </AudioPipelineCard>

      <section className="glass-settings__audio-utility">
        <SettingsChoiceGrid>
          <SettingsChoiceCard
            icon={<Speaker size={24} strokeWidth={1.75} />}
            label="Restore speakers"
            description={
              settings.savedMacOutputDeviceName
                ? `Saved: ${settings.savedMacOutputDeviceName}`
                : "Remember Mac output after BlackHole routing"
            }
            selected={Boolean(settings.savedMacOutputDeviceName)}
            status={settings.savedMacOutputDeviceName ? "ok" : "idle"}
            testId="glass-settings-audio-restore"
            onClick={() => send({ type: "save-mac-output-device" })}
          />
          <SettingsChoiceCard
            icon={<Radio size={24} strokeWidth={1.75} />}
            label="Clear saved output"
            description="Remove saved speaker device"
            disabled={!settings.savedMacOutputDeviceName}
            testId="glass-settings-audio-clear-output"
            onClick={() => send({ type: "clear-mac-output-device" })}
          />
        </SettingsChoiceGrid>
        <p className="glass-settings__block-hint">
          Optional: saves your current speaker so Glass can restore it on launch. Needs{" "}
          <code>brew install switchaudio-osx</code> for auto-restore.
        </p>
      </section>
    </div>
  );
}
