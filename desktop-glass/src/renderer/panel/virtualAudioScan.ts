import { send } from "../useGlassState.ts";

export type VirtualAudioInputDevice = { deviceId: string; label: string };

export async function reportVirtualAudioDevices(): Promise<VirtualAudioInputDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices
    .filter((d) => d.kind === "audioinput")
    .map((d) => ({ deviceId: d.deviceId, label: d.label }));
  send({ type: "report-virtual-audio-devices", devices: inputs });
  return inputs;
}
