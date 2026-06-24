import { useRef } from "react";
import SwarmScene from "../onboarding/swarm/SwarmScene.tsx";
import { ModeController } from "../onboarding/swarm/ModeController.ts";
import { VoiceController } from "../onboarding/swarm/VoiceController.ts";
import { PresenceStateMachine } from "../onboarding/swarm/PresenceStateMachine.ts";
import { MODES } from "../onboarding/swarm/manifestations.ts";
import type { AtomTint } from "../onboarding/swarm/SubstrateRenderMaterial.ts";

/** Fully-formed substrate atom — same resting state as after the boot build completes. */
function createFormedAtomController(): ModeController {
  const controller = new ModeController(MODES.substrate);
  controller.build = 1;
  controller.phase = "build";
  controller.flashed = true;
  controller.flash = 0;
  return controller;
}

/** Boot-screen substrate atom, scaled for the terminal welcome overlay. */
export function TerminalWelcomeSwarm({ atomTint = "sapphire" }: { atomTint?: AtomTint }): JSX.Element {
  const controllerRef = useRef<ModeController | null>(null);
  const voiceRef = useRef<VoiceController | null>(null);
  const presenceRef = useRef<PresenceStateMachine | null>(null);

  if (!controllerRef.current) controllerRef.current = createFormedAtomController();
  if (!voiceRef.current) voiceRef.current = new VoiceController();
  if (!presenceRef.current) {
    presenceRef.current = new PresenceStateMachine();
    presenceRef.current.set("manifesting");
  }

  return (
    <div className="gtw-swarm" aria-hidden="true">
      <SwarmScene
        controller={controllerRef.current}
        voice={voiceRef.current}
        presence={presenceRef.current}
        transparentOverlay
        layout="boot"
        atomTint={atomTint}
      />
    </div>
  );
}
