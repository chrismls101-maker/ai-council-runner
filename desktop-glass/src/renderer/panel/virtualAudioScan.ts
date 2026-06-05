import { send } from "../useGlassState.ts";

export async function reportVirtualAudioDevices(): Promise<void> {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices
    .filter((d) => d.kind === "audioinput")
    .map((d) => ({ deviceId: d.deviceId, label: d.label }));
  send({ type: "report-virtual-audio-devices", devices: inputs });
}
