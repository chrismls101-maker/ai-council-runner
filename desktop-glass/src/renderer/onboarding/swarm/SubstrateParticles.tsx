// SubstrateParticles
// ------------------
// Mounts the morphic substrate: the GPGPU field + the chrome render material +
// the ModeController. Each frame it advances the controller's morph, feeds the
// active modes/voice into the sim, steps the physics, and hands the simulated
// positions to the renderer. Pose-locked, front-facing — only the matter moves.

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createSubstrateField } from './SubstrateField';
import { createSubstrateRenderMaterial } from './SubstrateRenderMaterial';
import { MODES } from './manifestations';
import { SWARM_CONFIG } from './swarmConfig';
import type { ModeController } from './ModeController';
import type { VoiceController } from './VoiceController';
import type { PresenceStateMachine } from './PresenceStateMachine';

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const N = 24000; // less dense

interface SubstrateParticlesProps {
  controller: ModeController;
  voice: VoiceController;
  presence: PresenceStateMachine;
}

export default function SubstrateParticles({
  controller,
  voice,
  presence,
}: SubstrateParticlesProps): JSX.Element {
  const { gl } = useThree();

  const built = useMemo(() => {
    const sim = createSubstrateField(gl, N);
    const base = new THREE.IcosahedronGeometry(1, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('normal', base.attributes.normal);
    geo.setAttribute('aRef', new THREE.InstancedBufferAttribute(sim.refs, 2));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(sim.seeds, 1));
    geo.setAttribute('aId', new THREE.InstancedBufferAttribute(sim.ids, 1));
    geo.instanceCount = N;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10);
    const { material, uniforms } = createSubstrateRenderMaterial();
    return { sim, geo, material, uniforms };
  }, [gl]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useFrame((state: any, delta: number) => {
    const dt = Math.min(0.03, delta);
    const t = state.clock.elapsedTime;
    controller.tick(dt);
    const m = controller.uniforms();

    // reasoning EXPANSION: grow while it's thinking, ease back otherwise
    const reasoning = m.mode === MODES.reasoning;
    const thinking = presence && presence.name === 'thinking';
    controller.grow = (reasoning && thinking)
      ? Math.min(1.8, controller.grow + dt * 0.18)
      : Math.max(0, controller.grow - dt * 0.7);

    const vu = built.sim.velVar.material.uniforms;
    vu.uTime.value = t;
    vu.uDt.value = dt;
    vu.uMode.value = m.mode;
    vu.uBuild.value = m.build;
    vu.uGrow.value = controller.grow;
    vu.uVoice.value = voice ? voice.update(dt, presence?.isSpeaking?.() ?? false) : 0;
    built.sim.posVar.material.uniforms.uDt.value = dt;
    built.sim.gpu.compute();

    const u = built.uniforms;
    u.uPosTex.value = built.sim.gpu.getCurrentRenderTarget(built.sim.posVar).texture;
    u.uTime.value = t;
    // status tint eased toward the controller's amber/green (set by the chat flow)
    u.uAmber.value = lerp(u.uAmber.value, controller.amber || 0, 1 - Math.pow(0.02, dt));
    u.uGreen.value = lerp(u.uGreen.value, controller.green || 0, 1 - Math.pow(0.02, dt));
    u.uFlash.value = controller.flash || 0;   // completion crystallization burst
    // the core ball turns blue AFTER the flash: ramps in as the flash fades (and
    // only once the atom has locked / flashed). Rings stay ice.
    const atomDone = m.mode === MODES.substrate && controller.flashed;
    u.uBlue.value = lerp(u.uBlue.value, atomDone ? 1 - (controller.flash || 0) : 0, 1 - Math.pow(0.05, dt));
    built.material.envMapIntensity = SWARM_CONFIG.envIntensity;
  });

  return <mesh geometry={built.geo} material={built.material} frustumCulled={false} />;
}
