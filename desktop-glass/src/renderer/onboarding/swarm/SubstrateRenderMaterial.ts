// SubstrateRenderMaterial
// -----------------------
// Draws the substrate particles as ICE / DIAMOND crystal beads (not blue chrome).
// Bright, clear, high-spec silver-white bodies that reflect the studio
// environment, with a faint COOL PRISMATIC dispersion on their fresnel edges and
// sparse white twinkles travelling through the active form — like cut diamond /
// ice. No saturated cyan; the cool tint is barely-there.

import * as THREE from 'three';
import { SWARM_CONFIG } from './swarmConfig';

export interface SubstrateRenderMaterialResult {
  material: THREE.MeshStandardMaterial;
  uniforms: Record<string, THREE.IUniform>;
}

export function createSubstrateRenderMaterial(): SubstrateRenderMaterialResult {
  const uniforms: Record<string, THREE.IUniform> = {
    uPosTex: { value: null },
    uTime:   { value: 0 },
    uBeadR:  { value: 0.0085 },    // smaller beads
    uTwinkle:{ value: 0.7 },       // sparse white sparkle amount
    uPrism:  { value: 0.35 },      // cool prismatic edge dispersion
    uRim:    { value: 0.5 },
    uAmber:  { value: 0 },         // status: error / unsure
    uGreen:  { value: 0 },         // status: resolved
    uFlash:  { value: 0 },         // completion crystallization burst (1 -> 0)
    uBlue:   { value: 1 },         // 1 = atom (holds diamond-blue + flash), 0 = other forms (ice)
  };

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#c2ccd9'), // cool silver-white (icy), not dark chrome
    metalness: 0.85,
    roughness: 0.12,                   // crisp, glassy
    envMapIntensity: SWARM_CONFIG.envIntensity,
  });

  // @ts-ignore — THREE.WebGLProgramParametersWithUniforms has no bundled type alias here
  material.onBeforeCompile = (shader: any) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', /* glsl */ `#include <common>
        attribute vec2 aRef; attribute float aSeed, aId;
        uniform sampler2D uPosTex; uniform float uTime, uBeadR;
        varying float vTwinkle, vSeed, vTip, vR, vCore;`)
      .replace('#include <begin_vertex>', /* glsl */ `
        vec4 ps = texture2D(uPosTex, aRef);
        vec3 p = ps.xyz;
        // ALIVE: a tiny per-bead shimmer so the swarm breathes in place
        p += vec3(sin(uTime * 1.3 + aSeed * 30.0),
                  cos(uTime * 1.1 + aSeed * 21.0),
                  sin(uTime * 0.9 + aSeed * 17.0)) * 0.007;
        float reveal = ps.w;                      // 0 = not yet drawn, 1 = settled
        // hidden until the draw-front reaches it (size -> 0)
        float vis = smoothstep(0.0, 0.10, reveal);
        float size = uBeadR * (0.6 + 0.8 * aSeed) * vis;
        // bright crystallizing TIP right at the growth front
        vTip = smoothstep(0.0, 0.06, reveal) * (1.0 - smoothstep(0.06, 0.34, reveal));
        vTwinkle = pow(0.5 + 0.5 * sin(aId * 50.0 - uTime * 4.0 + aSeed * 6.2831), 6.0) * vis;
        vSeed = aSeed;
        vR = length(p);                           // radius (for the completion ring)
        vCore = 1.0 - step(0.30, aSeed);          // 1 = central core ball, 0 = rings
        vec3 transformed = position * size + p;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */ `#include <common>
        uniform float uTwinkle, uPrism, uRim, uAmber, uGreen, uFlash, uBlue;
        varying float vTwinkle, vSeed, vTip, vR, vCore;`)
      .replace('#include <emissivemap_fragment>', /* glsl */ `#include <emissivemap_fragment>
        {
          vec3 V = normalize(vViewPosition);
          float rimF = pow(1.0 - clamp(dot(normalize(normal), V), 0.0, 1.0), 3.0);
          float prismAmt = max(0.0, 1.0 - uAmber - uGreen);   // status overrides the ice prism
          totalEmissiveRadiance += vec3(0.80, 0.86, 0.96) * rimF * uRim;
          vec3 prism = mix(vec3(0.72, 0.88, 1.0), vec3(0.86, 0.86, 1.0), fract(vSeed * 9.0));
          totalEmissiveRadiance += prism * rimF * uPrism * prismAmt;
          totalEmissiveRadiance += vec3(0.92, 0.96, 1.0) * vTwinkle * uTwinkle;
          totalEmissiveRadiance += vec3(0.85, 0.93, 1.0) * vTip * 1.6;

          // (the atom's resting blue is applied as a colour grade at the end —
          //  the whole crystal is blue, not just a glow.)

          // COMPLETION BURST (atom only): a diamond-blue ring EXPLODES outward from
          // the core, then fades — leaving the blue diamond behind.
          vec3 diamondBlue = vec3(0.30, 0.66, 1.0);
          float front = (1.0 - uFlash) * 3.0;               // ring expands as flash fades
          float ring = exp(-abs(vR - front) * 2.6) * uFlash;
          totalEmissiveRadiance += diamondBlue * (ring * 3.6 + uFlash * 0.55 * (rimF + vTwinkle));

          // STATUS tint: amber = error/unsure, green = resolved
          float lit = rimF * 0.7 + vTwinkle * 1.0 + vTip * 0.8;
          totalEmissiveRadiance += vec3(1.00, 0.55, 0.12) * uAmber * lit;
          totalEmissiveRadiance += vec3(0.20, 1.00, 0.45) * uGreen * lit;
        }`)
      // ATOM colour grade: tint the entire crystal — reflections, highlights and
      // all — toward a perfect sapphire blue. Same diamond material, blue colour.
      // uBlue is 1 only for the atom, so the working forms stay neutral ice.
      .replace('#include <opaque_fragment>', /* glsl */ `#include <opaque_fragment>
        gl_FragColor.rgb *= mix(vec3(1.0), vec3(0.34, 0.58, 1.30), uBlue * vCore);`);
  };

  return { material, uniforms };
}
