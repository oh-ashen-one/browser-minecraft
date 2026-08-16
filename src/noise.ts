/**
 * CUBELAND — deterministic noise & hashing.
 * Every value here is a pure function of its inputs, so world generation,
 * tree placement and decoration are reproducible from the seed alone.
 */

/** Fast seeded PRNG (mulberry32). Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Turn a user seed (string or number) into a stable uint32. */
export function hashSeed(str: string): number {
  const s = str.trim();
  if (s === '') return (Math.random() * 0xffffffff) >>> 0;
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10) >>> 0;
    return n === 0 ? 42 : n;
  }
  let h = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Integer lattice hash → [0,1). Deterministic across sessions. */
function ihash(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb25);
  h ^= Math.imul(y | 0, 0x165667b1);
  h ^= Math.imul(z | 0, 0x9e3779b1);
  h ^= Math.imul(seed | 0, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 2D hash [0,1) at integer coords. */
export function h2(x: number, z: number, seed: number): number {
  return ihash(Math.floor(x), Math.floor(z), 0, seed);
}

/** 3D hash [0,1) at integer coords. */
export function h3(x: number, y: number, z: number, seed: number): number {
  return ihash(Math.floor(x), Math.floor(y), Math.floor(z), seed);
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Billinear value noise, output [0,1]. */
export function vnoise2(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const a = ihash(xi, yi, 0, seed);
  const b = ihash(xi + 1, yi, 0, seed);
  const c = ihash(xi, yi + 1, 0, seed);
  const d = ihash(xi + 1, yi + 1, 0, seed);
  const u = smooth(xf);
  const v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal 2D value noise, output [0,1]. */
export function fbm2(x: number, y: number, seed: number, oct = 4): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += vnoise2(x, y, seed + i * 1013) * amp;
    norm += amp;
    amp *= 0.5;
    x = x * 2.03 + 17.3;
    y = y * 1.97 - 9.1;
  }
  return sum / norm;
}

/** Trilinear value noise in 3D, output [0,1]. */
export function vnoise3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const zf = smooth(z - zi);

  const c000 = ihash(xi, yi, zi, seed);
  const c100 = ihash(xi + 1, yi, zi, seed);
  const c010 = ihash(xi, yi + 1, zi, seed);
  const c110 = ihash(xi + 1, yi + 1, zi, seed);
  const c001 = ihash(xi, yi, zi + 1, seed);
  const c101 = ihash(xi + 1, yi, zi + 1, seed);
  const c011 = ihash(xi, yi + 1, zi + 1, seed);
  const c111 = ihash(xi + 1, yi + 1, zi + 1, seed);

  const x00 = c000 + (c100 - c000) * xf;
  const x10 = c010 + (c110 - c010) * xf;
  const x01 = c001 + (c101 - c001) * xf;
  const x11 = c011 + (c111 - c011) * xf;
  const y0 = x00 + (x10 - x00) * yf;
  const y1 = x01 + (x11 - x01) * yf;
  return y0 + (y1 - y0) * zf;
}

/** Fractal 3D value noise, output [0,1]. */
export function fbm3(x: number, y: number, z: number, seed: number, oct = 4): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += vnoise3(x, y, z, seed + i * 7919) * amp;
    norm += amp;
    amp *= 0.5;
    x = x * 2.01 + 3.7;
    y = y * 2.02 - 5.3;
    z = z * 1.99 + 7.9;
  }
  return sum / norm;
}

/* ---------- small math utils shared across the engine ---------- */

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

/** Hermite smoothstep between edges e0..e1. */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Map a 0..1 value from one range to another with clamping. */
export function remap(v: number, a0: number, a1: number, b0: number, b1: number): number {
  return lerp(b0, b1, clamp((v - a0) / (a1 - a0), 0, 1));
}

/** Shortest signed difference between two angles (radians). */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
