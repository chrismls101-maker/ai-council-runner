import * as THREE from "three";
import type { ShapePath } from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { IIVO_WORDMARK_SVG } from "./iivoWordmarkSvg.ts";
import type { LetterShapeData } from "./types.ts";

const loader = new SVGLoader();

function shapeCenter(shape: THREE.Shape): [number, number] {
  const points = shape.getPoints(24);
  if (points.length === 0) return [0, 0];
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return [x / points.length, y / points.length];
}

function pathToShape(path: ShapePath): THREE.Shape {
  const shapes = SVGLoader.createShapes(path);
  return shapes[0] ?? new THREE.Shape();
}

/** Parse IIVO SVG into extrudable letter shapes (O includes hole). */
export function parseIivoLogoShapes(): LetterShapeData[] {
  const doc = loader.parse(IIVO_WORDMARK_SVG);
  const byId = new Map<string, ShapePath>();

  for (const path of doc.paths) {
    const id = path.userData?.node?.getAttribute?.("id") ?? "";
    if (id) byId.set(id, path);
  }

  const letters: LetterShapeData[] = [];

  for (const id of ["letter-i1", "letter-i2", "letter-v"]) {
    const path = byId.get(id);
    if (!path) continue;
    const shape = pathToShape(path);
    letters.push({ id, shape, center: shapeCenter(shape) });
  }

  const oOuter = byId.get("letter-o-outer");
  const oInner = byId.get("letter-o-inner");
  if (oOuter) {
    const shape = pathToShape(oOuter);
    if (oInner) {
      for (const hole of SVGLoader.createShapes(oInner)) {
        shape.holes.push(hole);
      }
    }
    letters.push({ id: "letter-o", shape, center: shapeCenter(shape) });
  }

  return letters;
}

/** Normalize shapes to centered unit-ish space for consistent sizing. */
export function normalizeLogoShapes(letters: LetterShapeData[]): {
  letters: LetterShapeData[];
  scale: number;
  offset: THREE.Vector2;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const letter of letters) {
    const pts = letter.shape.getPoints(32);
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const scale = 2.8 / Math.max(width, height);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const offset = new THREE.Vector2(cx, cy);

  const normalized = letters.map((letter) => {
    const cloned = new THREE.Shape();
    const points = letter.shape.getPoints(48);
    if (points.length > 0) {
      cloned.moveTo((points[0].x - cx) * scale, -(points[0].y - cy) * scale);
      for (let i = 1; i < points.length; i++) {
        cloned.lineTo((points[i].x - cx) * scale, -(points[i].y - cy) * scale);
      }
      cloned.closePath();
    }
    for (const hole of letter.shape.holes) {
      const holePts = hole.getPoints(32);
      if (holePts.length === 0) continue;
      const holePath = new THREE.Path();
      holePath.moveTo((holePts[0].x - cx) * scale, -(holePts[0].y - cy) * scale);
      for (let i = 1; i < holePts.length; i++) {
        holePath.lineTo((holePts[i].x - cx) * scale, -(holePts[i].y - cy) * scale);
      }
      holePath.closePath();
      cloned.holes.push(holePath);
    }
    return {
      id: letter.id,
      shape: cloned,
      center: [
        (letter.center[0] - cx) * scale,
        -(letter.center[1] - cy) * scale,
      ] as [number, number],
    };
  });

  return { letters: normalized, scale, offset };
}

let cachedLetters: LetterShapeData[] | null = null;
let cachedVersion = 0;
const SVG_CACHE_VERSION = 2;

export function getIivoLogoLetters(): LetterShapeData[] {
  if (!cachedLetters || cachedVersion !== SVG_CACHE_VERSION) {
    cachedLetters = normalizeLogoShapes(parseIivoLogoShapes()).letters;
    cachedVersion = SVG_CACHE_VERSION;
  }
  return cachedLetters;
}

/** Force re-parse after SVG updates (dev hot reload). */
export function invalidateLogoLetterCache(): void {
  cachedLetters = null;
  cachedVersion = 0;
}
