/**
 * Build desktop-glass/build/icon.icns (and icon.png 1024 master) for IIVO Glass.
 *
 * Design: the IIVO eye/orb logo composited onto a dark "glass" rounded-square
 * background (vertical gradient + subtle cyan glow + edge highlight), with
 * anti-aliased corners. macOS-style padded icon look.
 *
 * Dependency-free: PNG decode/encode via Node zlib; the orb is high-quality
 * downscaled with macOS-native `sips`; final .icns assembled with `iconutil`.
 */

import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(ROOT, "..");
const SOURCE = path.join(REPO_ROOT, "browser-extension/assets/icon-source-crop.png");
const BUILD_DIR = path.join(ROOT, "build");

const CANVAS = 1024; // master icon resolution
const ALPHA_THRESHOLD = 8; // include the soft outer glow when trimming
const ORB_WIDTH = 700; // orb target width on the 1024 canvas

// ---------- PNG decode ----------
function readChunks(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("Not a PNG");
  let off = 8;
  const chunks = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    chunks.push({ type, data: buf.subarray(off + 8, off + 8 + len) });
    off += 12 + len;
  }
  return chunks;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodeRGBA(buf) {
  const chunks = readChunks(buf);
  const ihdr = chunks.find((c) => c.type === "IHDR").data;
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr.readUInt8(8);
  const colorType = ihdr.readUInt8(9);
  const interlace = ihdr.readUInt8(12);
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`Unsupported PNG (bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace})`);
  }
  const idat = Buffer.concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.data));
  const raw = zlib.inflateSync(idat);
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, y * stride + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let val = line[x];
      switch (filter) {
        case 0: break;
        case 1: val = (val + a) & 0xff; break;
        case 2: val = (val + b) & 0xff; break;
        case 3: val = (val + ((a + b) >> 1)) & 0xff; break;
        case 4: val = (val + paeth(a, b, c)) & 0xff; break;
        default: throw new Error(`Bad filter ${filter}`);
      }
      cur[x] = val;
    }
    prev = cur;
  }
  return { width, height, data: out };
}

// ---------- PNG encode ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodeRGBA({ width, height, data }) {
  const stride = width * 4;
  const rawWithFilters = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    rawWithFilters[y * (stride + 1)] = 0;
    data.copy(rawWithFilters, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  const idat = zlib.deflateSync(rawWithFilters, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- helpers ----------
function alphaBBox({ width, height, data }) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] >= ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error("Image is fully transparent");
  return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function cropBBox(img, box) {
  const out = Buffer.alloc(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    for (let x = 0; x < box.w; x++) {
      const src = ((box.minY + y) * img.width + (box.minX + x)) * 4;
      const dst = (y * box.w + x) * 4;
      out[dst] = img.data[src];
      out[dst + 1] = img.data[src + 1];
      out[dst + 2] = img.data[src + 2];
      out[dst + 3] = img.data[src + 3];
    }
  }
  return { width: box.w, height: box.h, data: out };
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Signed distance to a rounded rectangle centered in the canvas. */
function roundedRectSD(px, py, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(px - cx) - (halfW - r);
  const qy = Math.abs(py - cy) - (halfH - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - r;
}

/** Draw the dark glass rounded-square background on a CANVAS×CANVAS RGBA buffer. */
function drawBackground() {
  const S = CANVAS;
  const data = Buffer.alloc(S * S * 4);
  const margin = Math.round(S * 0.055); // ~56px
  const half = (S - 2 * margin) / 2;
  const cx = S / 2, cy = S / 2;
  const radius = Math.round((half * 2) * 0.2237); // macOS squircle-ish radius
  const glowX = cx, glowY = cy - S * 0.06;
  const glowR = S * 0.5;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const sd = roundedRectSD(x + 0.5, y + 0.5, cx, cy, half, half, radius);
      const coverage = clamp01(0.5 - sd);
      const i = (y * S + x) * 4;
      if (coverage <= 0) {
        data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
        continue;
      }
      // vertical gradient: top -> bottom
      const t = clamp01((y - margin) / (S - 2 * margin));
      let r = lerp(26, 9, t);
      let g = lerp(33, 12, t);
      let b = lerp(48, 19, t);
      // cyan glow (radial, behind the orb)
      const gd = Math.hypot(x - glowX, y - glowY) / glowR;
      const glow = Math.pow(clamp01(1 - gd), 2.2) * 0.5;
      r += 40 * glow;
      g += 150 * glow;
      b += 200 * glow;
      // faint purple lift toward the bottom
      const pd = clamp01((t - 0.55) / 0.45);
      r += 30 * pd * 0.25;
      b += 60 * pd * 0.25;
      // inner edge highlight ring (~3px inside the border), brighter at top
      const ring = clamp01(1 - Math.abs(sd + 4) / 3);
      const ringTop = lerp(0.35, 0.12, t);
      r = lerp(r, 190, ring * ringTop);
      g = lerp(g, 220, ring * ringTop);
      b = lerp(b, 255, ring * ringTop);

      data[i] = Math.round(clamp01(r / 255) * 255);
      data[i + 1] = Math.round(clamp01(g / 255) * 255);
      data[i + 2] = Math.round(clamp01(b / 255) * 255);
      data[i + 3] = Math.round(coverage * 255);
    }
  }
  return { width: S, height: S, data };
}

/** Alpha-composite `src` (centered) over `dst` in place. */
function compositeCentered(dst, src) {
  const S = dst.width;
  const offX = Math.round((S - src.width) / 2);
  const offY = Math.round((S - src.height) / 2);
  for (let y = 0; y < src.height; y++) {
    const dy = offY + y;
    if (dy < 0 || dy >= S) continue;
    for (let x = 0; x < src.width; x++) {
      const dx = offX + x;
      if (dx < 0 || dx >= S) continue;
      const s = (y * src.width + x) * 4;
      const sa = src.data[s + 3] / 255;
      if (sa <= 0) continue;
      const d = (dy * S + dx) * 4;
      const da = dst.data[d + 3] / 255;
      const outA = sa + da * (1 - sa);
      for (let k = 0; k < 3; k++) {
        const sc = src.data[s + k];
        const dc = dst.data[d + k];
        dst.data[d + k] = Math.round((sc * sa + dc * da * (1 - sa)) / (outA || 1));
      }
      dst.data[d + 3] = Math.round(outA * 255);
    }
  }
}

async function main() {
  await fs.mkdir(BUILD_DIR, { recursive: true });

  // 1) crop the orb to its alpha bounding box
  const src = await fs.readFile(SOURCE);
  const img = decodeRGBA(src);
  const box = alphaBBox(img);
  const orbCrop = cropBBox(img, box);
  const orbBBoxPath = path.join(BUILD_DIR, ".orb-bbox.png");
  await fs.writeFile(orbBBoxPath, encodeRGBA(orbCrop));

  // 2) high-quality downscale the orb to target width (keep aspect) via sips
  const orbScaledPath = path.join(BUILD_DIR, ".orb-scaled.png");
  execFileSync("sips", ["--resampleWidth", String(ORB_WIDTH), orbBBoxPath, "--out", orbScaledPath]);
  const orb = decodeRGBA(await fs.readFile(orbScaledPath));
  console.log(`orb bbox ${box.w}x${box.h} -> scaled ${orb.width}x${orb.height} on ${CANVAS}px glass bg`);

  // 3) draw background + composite orb
  const canvas = drawBackground();
  compositeCentered(canvas, orb);
  const masterPath = path.join(BUILD_DIR, ".icon-master.png");
  await fs.writeFile(masterPath, encodeRGBA(canvas));

  // 1024 master png (also a handy fallback icon for electron-builder)
  const png1024 = path.join(BUILD_DIR, "icon.png");
  execFileSync("sips", ["-s", "format", "png", "-z", "1024", "1024", masterPath, "--out", png1024]);

  // 4) build the .iconset and convert to .icns (iconset kept inside workspace)
  const iconset = path.join(BUILD_DIR, ".iconset-tmp");
  const iconsetDir = path.join(iconset, "icon.iconset");
  await fs.rm(iconset, { recursive: true, force: true });
  await fs.mkdir(iconsetDir, { recursive: true });
  const variants = [
    [16, "icon_16x16.png"],
    [32, "icon_16x16@2x.png"],
    [32, "icon_32x32.png"],
    [64, "icon_32x32@2x.png"],
    [128, "icon_128x128.png"],
    [256, "icon_128x128@2x.png"],
    [256, "icon_256x256.png"],
    [512, "icon_256x256@2x.png"],
    [512, "icon_512x512.png"],
    [1024, "icon_512x512@2x.png"],
  ];
  for (const [size, name] of variants) {
    execFileSync("sips", [
      "-s", "format", "png", "-z", String(size), String(size),
      masterPath, "--out", path.join(iconsetDir, name),
    ]);
  }
  const icnsPath = path.join(BUILD_DIR, "icon.icns");
  execFileSync("iconutil", ["-c", "icns", iconsetDir, "-o", icnsPath]);

  // cleanup temp artifacts
  await fs.rm(iconset, { recursive: true, force: true });
  await fs.rm(orbBBoxPath, { force: true });
  await fs.rm(orbScaledPath, { force: true });
  await fs.rm(masterPath, { force: true });

  console.log(`wrote ${icnsPath}`);
  console.log(`wrote ${png1024}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
