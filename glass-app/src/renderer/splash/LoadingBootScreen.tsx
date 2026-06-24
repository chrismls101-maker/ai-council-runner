import "@fontsource/michroma/400.css";
import "@fontsource/sora/400.css";
import "@fontsource/sora/500.css";
import { useRef } from "react";
import {
  DEFAULT_GLASS_ENERGY_DURATION_MS,
  GlassEnergyProgressBar,
} from "./GlassEnergyProgressBar.tsx";
import { LoadingGlassBackground } from "./LoadingGlassBackground.tsx";
import SwarmScene from "../onboarding/swarm/SwarmScene.tsx";
import { ModeController } from "../onboarding/swarm/ModeController.ts";
import { VoiceController } from "../onboarding/swarm/VoiceController.ts";
import { PresenceStateMachine } from "../onboarding/swarm/PresenceStateMachine.ts";
import { MODES } from "../onboarding/swarm/manifestations.ts";
import "./iivoBrandFonts.css";
import "./loadingBootScreen.css";

/**
 * Stable swarm controllers for the boot screen — created once, never recreated.
 * Substrate builds itself over 7.5 s while the progress bar fills.
 */
function useBootSwarm() {
  const controllerRef = useRef<ModeController | null>(null);
  const voiceRef = useRef<VoiceController | null>(null);
  const presenceRef = useRef<PresenceStateMachine | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = new ModeController(MODES.substrate);
  }
  if (!voiceRef.current) voiceRef.current = new VoiceController();
  if (!presenceRef.current) {
    presenceRef.current = new PresenceStateMachine();
    presenceRef.current.set("manifesting");
  }

  return {
    controller: controllerRef.current,
    voice: voiceRef.current,
    presence: presenceRef.current,
  };
}

/**
 * IIVO Glass boot screen.
 * The substrate particle swarm builds itself while Glass initialises.
 * When the boot completes the SortingHat overlay picks up with substrate
 * already formed — no visual reset, no gap.
 */
export function LoadingBootScreen(): JSX.Element {
  const { controller, voice, presence } = useBootSwarm();

  return (
    <div className="glass-boot" role="status" aria-live="polite" aria-label="IIVO Intelligent Glass loading">
      {/* Substrate swarm — builds itself over 7.5 s, exactly matching the SortingHat start state */}
      <div className="glass-boot__swarm" aria-hidden="true">
        <SwarmScene
          controller={controller}
          voice={voice}
          presence={presence}
          transparentOverlay
          layout="boot"
        />
      </div>

      <div className="glass-boot__center-dim" aria-hidden="true" />
      <LoadingGlassBackground />

      <main className="glass-boot__content">
        <h1 className="glass-boot__title">
          <span className="glass-boot__title-chrome">
            <span className="glass-boot__title-wordmark iivo-wordmark">IIVO</span>
            <span className="glass-boot__title-rest"> INTELLIGENT GLASS</span>
          </span>
        </h1>

        <div className="glass-boot__loading-block">
          <span className="glass-boot__loading-label">
            LOADING<span className="glass-boot__ellipsis" aria-hidden="true" />
          </span>
          <GlassEnergyProgressBar durationMs={DEFAULT_GLASS_ENERGY_DURATION_MS} />
        </div>

        <p className="glass-boot__subtitle">
          <span className="glass-boot__subtitle-inner">Initializing intelligent overlay</span>
        </p>
      </main>
    </div>
  );
}
