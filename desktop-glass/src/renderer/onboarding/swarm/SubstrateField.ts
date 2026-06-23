// SubstrateField (GPGPU)
// ----------------------
// The permanent base substrate. Particles (dir, seed, id) spring toward a TARGET
// from the active manifestation, drawing on in slot order. Spring + curl give the
// deliberate, living flow.
//
// The NETWORK manifestation is special: it's a real BRAIN CONNECTOME baked on the
// CPU — neuron nodes scattered through a brain-shaped volume, each wired to its
// nearest neighbours by organic CURVED fibres. Those endpoints are baked into two
// data textures (tNetA/tNetB) and the shader rides each particle along its fibre,
// so it builds like a nervous system wiring itself.

import * as THREE from 'three';
// @ts-ignore — GPUComputationRenderer ships without its own .d.ts in older @types/three builds
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import { NOISE_GLSL } from './noise';
import { MANIFEST_GLSL } from './manifestations';

const velocityShader = /* glsl */ `
  uniform sampler2D tInfo, tInfo2, tNetA, tNetB;
  uniform float uTime, uDt, uMode, uBuild, uGrow, uVoice, uSpring, uDamp, uTurb;
  ${NOISE_GLSL}
  ${MANIFEST_GLSL}
  void main(){
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 pos = texture2D(texturePosition, uv).xyz;
    vec3 vel = texture2D(textureVelocity, uv).xyz;
    vec4 A = texture2D(tInfo, uv);   // dir.xyz, seed
    vec4 B = texture2D(tInfo2, uv);  // id, _, _, _
    vec3 dir = A.xyz; float seed = A.w; float id = B.x;

    vec4 form;
    if (uMode > 3.5) {
      // NETWORK — brain connectome: ride this particle along its baked fibre
      // (neuron a -> neuron b) with an organic outward bow; nodes have a==b.
      vec4 nA = texture2D(tNetA, uv);
      vec4 nB = texture2D(tNetB, uv);
      vec3 a = nA.xyz; float slot = nA.w;
      vec3 b = nB.xyz; float curve = nB.w;
      vec3 mid = mix(a, b, id);
      vec3 ab = b - a;
      vec3 cdir = normalize(cross(ab, mid + vec3(1e-3)) + vec3(1e-4));
      vec3 cdir2 = normalize(cross(ab, cdir) + vec3(1e-4));
      // LIGHTNING: jagged bolt pinned at both nodes (env=0 at the ends), forking
      // in the middle — the connection sprouts node-to-node like an arc.
      float env = sin(id * 3.14159);
      float amp = abs(curve) + 0.06;
      float j1 = sin(id * 39.0 + a.x * 27.0) + 0.5 * sin(id * 74.0 + a.z * 13.0);
      float j2 = sin(id * 48.0 + a.y * 19.0) + 0.5 * sin(id * 93.0 + a.x * 9.0);
      vec3 p = mid + (cdir * j1 + cdir2 * j2) * env * amp * 0.6;
      form = vec4(p, slot + id * 0.10);     // bolt draws a -> b (spark travels)
    } else {
      form = manifest(uMode, dir, seed, id, uTime, uVoice);
    }
    vec3 T = form.xyz; float drawT = form.w;

    // REASONING BLOOM keeps EXPANDING the longer it thinks (uGrow climbs while
    // thinking) so it fills more space over time — the camera zooms out to follow.
    if (uMode > 1.5 && uMode < 2.5) T *= (0.7 + uGrow * 1.3);
    float reveal = smoothstep(drawT, drawT + 0.05, uBuild);

    vec3 accel = (T - pos) * uSpring - vel * uDamp;
    accel += curlNoise(pos * 0.55 + vec3(0.0, 0.0, uTime * 0.07)) * uTurb * 0.05; // faint life

    vel += accel * uDt;
    vel = clamp(vel, -40.0, 40.0);
    gl_FragColor = vec4(vel, reveal);
  }
`;

const positionShader = /* glsl */ `
  uniform float uDt;
  void main(){
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 pos = texture2D(texturePosition, uv).xyz;
    vec4 vel = texture2D(textureVelocity, uv);
    pos += vel.xyz * uDt;
    gl_FragColor = vec4(pos, vel.w);
  }
`;

// ---- build a brain connectome: neurons + nearest-neighbour fibres, ordered so
// the wiring PROPAGATES outward from a seed neuron (breadth-first), connection by
// connection — like a nervous system wiring itself. ----
function buildConnectome() {
  // STRUCTURED layout: a hub + concentric shells of nodes (a designed network,
  // not a random scatter). Nearest-neighbour wiring then gives clean radial +
  // tangential connections; BFS from the hub makes it SPROUT outward.
  const neurons: number[][] = [[0, 0, 0]]; // hub
  const shell = (count: number, R: number) => {
    for (let k = 0; k < count; k++) {
      const y = 1 - (k + 0.5) / count * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = 2.39996323 * k;
      neurons.push([Math.cos(th) * r * R * 1.25, y * R, Math.sin(th) * r * R]);
    }
  };
  shell(8, 0.62);
  shell(13, 1.02);
  shell(16, 1.38);
  const M = neurons.length;
  const edges: number[][] = [];
  const idxByKey: Record<string, number> = {};
  const adj: number[][][] = Array.from({ length: M }, () => []);
  const key = (a: number, b: number) => (a < b ? a + '_' + b : b + '_' + a);
  for (let n = 0; n < M; n++) {
    const d: [number, number][] = [];
    for (let m = 0; m < M; m++) {
      if (m === n) continue;
      const dx = neurons[n][0] - neurons[m][0];
      const dy = neurons[n][1] - neurons[m][1];
      const dz = neurons[n][2] - neurons[m][2];
      d.push([dx * dx + dy * dy + dz * dz, m]);
    }
    d.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < 3; k++) { // wire each neuron to its 3 nearest
      const m = d[k][1], kk = key(n, m);
      if (idxByKey[kk] !== undefined) continue;
      idxByKey[kk] = edges.length;
      edges.push([n, m]);
    }
  }
  edges.forEach(([a, b], ei) => {
    adj[a].push([b, ei]);
    adj[b].push([a, ei]);
  });

  // BFS from seed 0 -> the order connections are discovered = the order they draw
  const E = edges.length;
  const edgeOrder = new Array<number>(E).fill(-1);
  const visited = new Array<boolean>(M).fill(false);
  const q = [0];
  visited[0] = true;
  let oi = 0;
  while (q.length) {
    const u = q.shift()!;
    for (const [, ei] of adj[u]) if (edgeOrder[ei] < 0) edgeOrder[ei] = oi++;
    for (const [v] of adj[u]) if (!visited[v]) { visited[v] = true; q.push(v); }
  }
  for (let e = 0; e < E; e++) if (edgeOrder[e] < 0) edgeOrder[e] = oi++;
  const maxO = Math.max(1, oi - 1);

  // a neuron lights just as the first connection reaches it
  const nodeSlot = new Array<number>(M).fill(1);
  edges.forEach(([a, b], ei) => {
    const o = edgeOrder[ei] / maxO;
    if (o < nodeSlot[a]) nodeSlot[a] = o;
    if (o < nodeSlot[b]) nodeSlot[b] = o;
  });
  nodeSlot[0] = 0;
  return { neurons, edges, edgeOrder, nodeSlot, M, E, maxO };
}

export interface SubstrateField {
  // @ts-ignore — GPUComputationRenderer has no bundled types
  gpu: any;
  // @ts-ignore
  posVar: any;
  // @ts-ignore
  velVar: any;
  refs: Float32Array;
  seeds: Float32Array;
  ids: Float32Array;
  count: number;
}

export function createSubstrateField(renderer: THREE.WebGLRenderer, N: number): SubstrateField {
  const sizeX = Math.ceil(Math.sqrt(N));
  const sizeY = Math.ceil(N / sizeX);
  const total = sizeX * sizeY;

  // @ts-ignore — GPUComputationRenderer constructor
  const gpu = new GPUComputationRenderer(sizeX, sizeY, renderer);
  if (!renderer.capabilities.isWebGL2) gpu.setDataType(THREE.HalfFloatType);

  const tInfo = gpu.createTexture();
  const tInfo2 = gpu.createTexture();
  const pos0 = gpu.createTexture();
  const tNetA = gpu.createTexture();
  const tNetB = gpu.createTexture();
  const ai = tInfo.image.data as unknown as Float32Array;
  const bi = tInfo2.image.data as unknown as Float32Array;
  const pi = pos0.image.data as unknown as Float32Array;
  const na = tNetA.image.data as unknown as Float32Array;
  const nb = tNetB.image.data as unknown as Float32Array;

  const { neurons, edges, edgeOrder, nodeSlot, maxO } = buildConnectome();
  const M = neurons.length, E = edges.length;
  const nodeCount = Math.floor(N * 0.15); // smaller somas -> fibres dominate

  const seeds = new Float32Array(N), ids = new Float32Array(N);
  for (let i = 0; i < total; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, rr = Math.sqrt(1 - u * u);
    const dx = rr * Math.cos(th), dy = u, dz = rr * Math.sin(th);
    const seed = Math.random(), id = Math.random();
    if (i < N) { seeds[i] = seed; ids[i] = id; }
    ai[i*4+0] = dx; ai[i*4+1] = dy; ai[i*4+2] = dz; ai[i*4+3] = seed;
    bi[i*4+0] = id; bi[i*4+1] = 0; bi[i*4+2] = 0; bi[i*4+3] = 0;
    const r = 0.02 + seed * 0.06;
    pi[i*4+0] = dx * r; pi[i*4+1] = dy * r; pi[i*4+2] = dz * r; pi[i*4+3] = 1.0;

    // --- connectome assignment for this particle ---
    const j = i < N ? i : N - 1;
    if (j < nodeCount) { // a neuron soma: a == b, small blob
      const ni = Math.min(M - 1, Math.floor(j / nodeCount * M));
      const c = neurons[ni];
      const jx = (Math.random() - 0.5) * 0.07;
      const jy = (Math.random() - 0.5) * 0.07;
      const jz = (Math.random() - 0.5) * 0.07;
      na[i*4+0] = c[0] + jx; na[i*4+1] = c[1] + jy; na[i*4+2] = c[2] + jz;
      na[i*4+3] = 0.04 + nodeSlot[ni] * 0.80; // lights as the wiring reaches it
      nb[i*4+0] = c[0] + jx; nb[i*4+1] = c[1] + jy; nb[i*4+2] = c[2] + jz;
      nb[i*4+3] = 0.0; // no bow for a soma
    } else { // a fibre along an edge
      const e = Math.min(E - 1, Math.floor((j - nodeCount) / (N - nodeCount) * E));
      const a = neurons[edges[e][0]], b = neurons[edges[e][1]];
      na[i*4+0] = a[0]; na[i*4+1] = a[1]; na[i*4+2] = a[2];
      na[i*4+3] = 0.05 + (edgeOrder[e] / maxO) * 0.82; // BFS propagation order
      nb[i*4+0] = b[0]; nb[i*4+1] = b[1]; nb[i*4+2] = b[2];
      nb[i*4+3] = (Math.random() - 0.5) * 0.40; // organic outward bow
    }
  }

  const velVar = gpu.addVariable('textureVelocity', velocityShader, gpu.createTexture());
  const posVar = gpu.addVariable('texturePosition', positionShader, pos0);
  gpu.setVariableDependencies(velVar, [posVar, velVar]);
  gpu.setVariableDependencies(posVar, [posVar, velVar]);

  Object.assign(velVar.material.uniforms, {
    tInfo: { value: tInfo }, tInfo2: { value: tInfo2 },
    tNetA: { value: tNetA }, tNetB: { value: tNetB },
    uTime: { value: 0 }, uDt: { value: 1 / 60 },
    uMode: { value: 0 }, uBuild: { value: 0 }, uGrow: { value: 0 }, uVoice: { value: 0 },
    uSpring: { value: 15.0 }, uDamp: { value: 7.0 }, uTurb: { value: 0.5 },
  });
  posVar.material.uniforms.uDt = { value: 1 / 60 };

  const err = gpu.init();
  if (err !== null) console.error('[IIVO] substrate GPGPU init error:', err);

  const refs = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    refs[i*2]   = ((i % sizeX) + 0.5) / sizeX;
    refs[i*2+1] = (Math.floor(i / sizeX) + 0.5) / sizeY;
  }

  return { gpu, posVar, velVar, refs, seeds, ids, count: N };
}
