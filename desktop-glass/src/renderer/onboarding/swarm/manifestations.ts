// manifestations
// --------------
// The visual GRAMMAR of the morphic substrate. Each manifestation returns a
// vec4: xyz = the position a particle wants, w = its BUILD-SLOT (0..~0.7) — its
// place in the construction order. The engine grows every form OUT of the core
// in slot order, so structures visibly build themselves (nodes then edges,
// branches growing outward, rings drawing around). Abstract / swarm-native only.

export const MODES: Record<string, number> = {
  substrate: 0,   // rest — small core orb seeds, then ice orbital rings spin up
  aperture:  1,   // focus / listening — iris blooms open ring by ring
  lattice:   2,   // (alias) reasoning bloom
  reasoning: 2,   // reasoning — crystalline dendrite bloom that grows while thinking
  waveform:  3,   // speaking — voice resonance ring draws around
  streams:   4,   // executing — branches grow outward from the core, forking
};

export const MANIFEST_GLSL = /* glsl */ `
  vec3 hash3(float n){ return fract(sin(vec3(n, n + 1.7, n + 3.3)) * 43758.5453); }

  vec3 nodePos(float i, float K){
    float ga = 2.39996323;
    float y = 1.0 - (i + 0.5) / K * 2.0;
    float r = sqrt(max(0.0, 1.0 - y * y));
    float th = ga * i;
    return vec3(cos(th) * r, y, sin(th) * r);
  }

  vec3 ringPoint(float k, float ph){
    float th = 1.5707963 + k * 2.0943951;
    float tilt = (mod(k, 2.0) < 0.5) ? 0.4189 : -0.4189;
    vec3 longDir = vec3(cos(th), sin(th), 0.0);
    vec3 shortIn = vec3(-sin(th), cos(th), 0.0);
    vec3 shortDir = shortIn * cos(tilt) + vec3(0.0, 0.0, 1.0) * sin(tilt);
    float ang = ph * 6.2831853;
    return longDir * 1.05 * cos(ang) + shortDir * 0.42 * sin(ang);   // rings sized to clear the text bar
  }

  // --- reasoning-web skeleton: 6 primary trunks, each with 3 considerations ---
  vec3 primDir(float p){ return normalize(nodePos(p, 6.0)); }
  vec3 primPos(float p){ return primDir(p) * 0.92; }
  vec3 secPos(float si){
    float p = floor(si / 3.0), c = mod(si, 3.0);
    vec3 n = primDir(p);
    vec3 t1 = normalize(cross(n, vec3(0.0, 1.0, 0.0) + vec3(0.001)));
    vec3 t2 = cross(n, t1);
    float a = c * 2.0943951 + p * 0.7;
    vec3 d = normalize(n + (t1 * cos(a) + t2 * sin(a)) * 0.55);
    return d * 1.55;
  }

  // 0 — SUBSTRATE (rest, the HERO build): core ignites first, then each ring
  // SWEEPS around one at a time (draw-order = ring index + angle along the ring)
  vec4 mSubstrate(vec3 dir, float seed, float id, float t){
    if (seed < 0.30){
      float r = 0.12 + seed * 0.50;                            // tighter core orb
      return vec4(dir * r, hash3(seed * 7.0).x * 0.07);        // core ignites first
    }
    float k = min(floor((seed - 0.30) * 3.0 / 0.70), 2.0);
    float spin = (mod(k, 2.0) < 0.5) ? 1.0 : -1.0;
    float ph = id + t * 0.06 * spin;
    return vec4(ringPoint(k, ph) + dir * 0.02, 0.14 + k * 0.27 + id * 0.25); // ring sweeps in order
  }

  // 1 — APERTURE: iris blooms ring by ring (inner first)
  vec4 mAperture(vec3 dir, float seed, float id, float t, float voice){
    float ring = floor(seed * 5.0);
    float rad = 0.26 + ring * 0.26;
    rad *= 0.85 + 0.12 * sin(t * 1.4 + ring) + voice * 0.30;
    float ang = id * 6.2831853;
    return vec4(vec3(cos(ang) * rad, sin(ang) * rad, (seed - 0.5) * 0.06), 0.05 + ring * 0.18 + id * 0.07);
  }

  // 2 — REASONING BLOOM: crystalline dendrites grow OUT of the core, forking
  // recursively (exploring), with varied branch lengths (some probe far, some
  // stop short). The engine scales the whole bloom up as build rises, so it
  // KEEPS GROWING / filling space the entire time it thinks (camera zooms out).
  // Drawn line-by-line with crystallizing tips.
  vec4 mLattice(vec3 dir, float seed, float id, float t){
    float A = 9.0;
    float ai = floor(seed * A);
    float ang = ai / A * 6.2831853 + 0.3;
    vec3 base = normalize(vec3(cos(ang), sin(ang), (fract(ai * 0.37) - 0.5) * 0.6));
    vec3 perp = normalize(cross(base, vec3(0.0, 0.0, 1.0)) + vec3(1e-4));
    vec3 perp2 = cross(base, perp);
    float r = id;                                          // 0 at core -> 1 at tip
    // recursive forks (four levels) — the dendrite splits as it explores
    float b1 = (fract(seed * 11.0) < 0.5) ? -1.0 : 1.0;
    float b2 = (fract(seed * 23.0) < 0.5) ? -1.0 : 1.0;
    float b3 = (fract(seed * 47.0) < 0.5) ? -1.0 : 1.0;
    float b4 = (fract(seed * 97.0) < 0.5) ? -1.0 : 1.0;
    float s1 = smoothstep(0.15, 0.35, id);
    float s2 = smoothstep(0.35, 0.55, id);
    float s3 = smoothstep(0.55, 0.78, id);
    float s4 = smoothstep(0.78, 1.00, id);
    vec3 off = perp  * (b1 * 0.35 * s1 + b2 * 0.26 * s2 + b3 * 0.18 * s3 + b4 * 0.12 * s4)
             + perp2 * (b2 * 0.20 * s2 + b3 * 0.14 * s3 + b4 * 0.10 * s4);
    float reachVar = 0.5 + fract(seed * 7.3) * 0.95;       // some branches probe far, some short
    vec3 pos = base * (r * 1.6 * reachVar) + off * (0.4 + r * 1.6);
    pos += (hash3(seed * 13.0 + floor(id * 8.0)) - 0.5) * 0.05;   // crystalline waver
    float armOrder = hash3(ai + 5.0).x;
    return vec4(pos, armOrder * 0.35 + id * 0.6);          // grows outward, ongoing
  }

  // 3 — WAVEFORM: resonance ring draws around, ripples with the voice
  vec4 mWaveform(vec3 dir, float seed, float id, float t, float voice){
    float ang = id * 6.2831853;
    float r = 1.05 + (0.10 + voice * 0.5) * sin(ang * 6.0 - t * 4.0);
    return vec4(vec3(cos(ang) * r, sin(ang) * r + 0.55, sin(ang * 3.0 + t * 3.0) * 0.12 + (seed - 0.5) * 0.04), id * 0.9);
  }

  // 4 — NETWORK: builds the way a network actually forms, in clear stages you can
  // watch wire itself: (1) hub ignites, (2) inner nodes light, (3) spokes draw
  // hub->inner, (4) outer nodes light, (5) connections fan inner->outer, (6) the
  // inner ring links up. Each edge draws node-to-node, staggered, cinematic.
  vec3 ringNode(float k, float K, float R, float tilt){
    float a = k / K * 6.2831853;
    vec2 c = vec2(cos(a), sin(a)) * R;
    return vec3(c.x, c.y * cos(tilt), c.y * sin(tilt));
  }
  vec4 mStreams(vec3 dir, float seed, float id, float t){
    float f = id;
    // 1) hub
    if (seed < 0.05) return vec4(dir * (0.05 + seed * 1.4), 0.0);
    // 2) inner nodes (6)
    if (seed < 0.13){
      float k = floor((seed - 0.05) / 0.08 * 6.0);
      return vec4(ringNode(k, 6.0, 0.95, 0.45) + dir * 0.04, 0.05 + k * 0.02);
    }
    // 4) outer nodes (12) — light a touch later
    if (seed < 0.26){
      float m = floor((seed - 0.13) / 0.13 * 12.0);
      return vec4(ringNode(m, 12.0, 1.85, 0.45) + dir * 0.035, 0.34 + m * 0.010);
    }
    // 3) spokes: hub -> inner (6), each line drawn slowly, one after another
    if (seed < 0.48){
      float k = floor((seed - 0.26) / 0.22 * 6.0);
      vec3 pos = mix(vec3(0.0), ringNode(k, 6.0, 0.95, 0.45), f);
      return vec4(pos + dir * 0.02, 0.10 + k * 0.05 + f * 0.10);
    }
    // 5) fan: inner -> outer (12), staggered, slow travel
    if (seed < 0.80){
      float idx = floor((seed - 0.48) / 0.32 * 12.0);
      float ki = floor(idx / 2.0);
      vec3 pos = mix(ringNode(ki, 6.0, 0.95, 0.45), ringNode(idx, 12.0, 1.85, 0.45), f);
      return vec4(pos + dir * 0.015, 0.40 + idx * 0.022 + f * 0.10);
    }
    // 6) inner ring links up last
    float k = floor((seed - 0.80) / 0.20 * 6.0);
    vec3 a = ringNode(k, 6.0, 0.95, 0.45);
    vec3 b = ringNode(mod(k + 1.0, 6.0), 6.0, 0.95, 0.45);
    return vec4(mix(a, b, f) + dir * 0.012, 0.70 + k * 0.03 + f * 0.08);
  }

  vec4 manifest(float mode, vec3 dir, float seed, float id, float t, float voice){
    if (mode < 0.5) return mSubstrate(dir, seed, id, t);
    else if (mode < 1.5) return mAperture(dir, seed, id, t, voice);
    else if (mode < 2.5) return mLattice(dir, seed, id, t);
    else if (mode < 3.5) return mWaveform(dir, seed, id, t, voice);
    else return mStreams(dir, seed, id, t);
  }
`;
