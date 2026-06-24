// EnvReflections
// --------------
// Gives the chrome beads something to MIRROR. Without an environment, PBR metal
// renders black — the reflections ARE the material. We build a cool, neutral
// (achromatic, no blue tint) studio environment in a canvas: a dark gradient
// with a few bright horizontal "softbox" strips. Those strips reflect off the
// nano-chrome as sharp silver glints that slide as the swarm moves — the Matrix
// liquid-metal read. PMREM-prefiltered so reflections are smooth, not pixelated.

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

export default function EnvReflections(): null {
  const { gl, scene } = useThree();

  useEffect(() => {
    const w = 1024, h = 512;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;

    // deep neutral gradient (top brighter, like a studio ceiling) — lifted so
    // the chrome has light to catch from most angles (no dead-black hemisphere)
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0.00, '#3a434e');
    g.addColorStop(0.35, '#222a33');
    g.addColorStop(0.62, '#161c24');
    g.addColorStop(1.00, '#0a0e14');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // bright softbox strips -> the sharp moving glints on the chrome
    const strip = (y: number, hh: number, a: number) => {
      const sg = ctx.createLinearGradient(0, y - hh, 0, y + hh);
      sg.addColorStop(0, 'rgba(210,224,238,0)');
      sg.addColorStop(0.5, `rgba(236,244,252,${a})`);
      sg.addColorStop(1, 'rgba(210,224,238,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, y - hh, w, hh * 2);
    };
    strip(h * 0.14, 30, 1.0);   // strong key band (ceiling)
    strip(h * 0.40, 18, 0.75);  // mid fill band
    strip(h * 0.66, 14, 0.6);   // lower fill band
    strip(h * 0.86, 10, 0.45);  // floor bounce

    // bright pools spread all the way AROUND (every azimuth) so the chrome is
    // lit from the front, both sides and behind — the whole face reads.
    const pool = (x: number, y: number, r: number, a: number) => {
      const pg = ctx.createRadialGradient(x, y, 0, x, y, r);
      pg.addColorStop(0, `rgba(244,250,255,${a})`);
      pg.addColorStop(1, 'rgba(244,250,255,0)');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    pool(w * 0.10, h * 0.22, 170, 0.85);
    pool(w * 0.32, h * 0.14, 150, 0.9);
    pool(w * 0.54, h * 0.20, 150, 0.8);
    pool(w * 0.76, h * 0.16, 150, 0.85);
    pool(w * 0.93, h * 0.26, 150, 0.8);
    pool(w * 0.44, h * 0.55, 120, 0.5);
    pool(w * 0.84, h * 0.58, 120, 0.5);

    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;

    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();
    const env = pmrem.fromEquirectangular(tex).texture;

    scene.environment = env;

    tex.dispose();
    pmrem.dispose();
    return () => {
      if (scene.environment === env) scene.environment = null;
      env.dispose();
    };
  }, [gl, scene]);

  return null;
}
