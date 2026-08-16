/**
 * CUBELAND — chunked voxel world.
 * Mesa strata (sand -> sandstone -> terracotta bands -> rock), a few flat-topped
 * mesas, scattered cacti. One merged mesh per chunk with baked vertex AO and
 * aerial perspective toward the sky horizon colour (fog = horizon, no hard edge).
 */

import { B, blockDef } from './blocks';
import { hash2, fbm, valueNoise } from './noise';

export const CHUNK = 16;
const VIEW_CHUNKS = 5; // -2..+2 around the player -> 10x10 chunks

const SKY_HORIZON: [number, number, number] = [244, 216, 168]; // #F4D8A8 pale sand
const FOG_START = 30;
const FOG_END = 110;

// Palette from the design bible.
const SAND: [number, number, number] = [224, 183, 126];
const SANDSTONE: [number, number, number] = [206, 154, 95];
const TERRA: [number, number, number] = [181, 98, 60];
const STRATA: [number, number, number] = [126, 66, 48];
const ROCK: [number, number, number] = [110, 95, 85];
const CACTUS: [number, number, number] = [95, 140, 79];

// Face tables: +x, -x, +y (top), -y (bottom), +z, -z.
const FACES: { dir: [number, number, number]; shade: number; corners: Array<[number, number, number]> }[] = [
  { dir: [1, 0, 0], shade: 0.74, corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { dir: [-1, 0, 0], shade: 0.74, corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { dir: [0, 1, 0], shade: 1.0, corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { dir: [0, -1, 0], shade: 0.45, corners: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]] },
  { dir: [0, 0, 1], shade: 0.85, corners: [[1, 0, 1], [0, 0, 1], [0, 1, 1], [1, 1, 1]] },
  { dir: [0, 0, -1], shade: 0.85, corners: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]] },
];

// Per-corner AO sign pairs for each face: [face][corner] = [sx, sy].
const AO_SIGN: number[][][] = [
  [[-1, -1], [-1, 1], [1, 1], [1, -1]],   // +x: local ax = -z, ay = +y
  [[1, 1], [1, -1], [-1, -1], [-1, 1]],   // -x: local ax = +z, ay = +y
  [[-1, -1], [-1, 1], [1, 1], [1, -1]],   // +y: local ax = +x, ay = +z
  [[-1, -1], [-1, 1], [1, 1], [1, -1]],   // -y: local ax = +x, ay = +z
  [[-1, -1], [-1, 1], [1, 1], [1, -1]],   // +z: local ax = +x, ay = +y
  [[1, 1], [1, -1], [-1, -1], [-1, 1]],   // -z: local ax = +x, ay = +y
];

export interface ChunkMesh {
  cx: number;
  cz: number;
  vertCount: number;
  dirty: boolean;
}

function lerp3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export class World {
  private seed: number;
  private chunks = new Map<string, Uint8Array>(); // "cx,cz" -> CHUNK*CHUNK*96
  private meshes = new Map<string, ChunkMesh>();
  private meshCache = new Map<string, Float32Array>();

  constructor(seed: number) {
    this.seed = seed | 0;
  }

  private key(cx: number, cz: number): string {
    return cx + ',' + cz;
  }

  private chunk(cx: number, cz: number): Uint8Array {
    const k = this.key(cx, cz);
    let c = this.chunks.get(k);
    if (!c) {
      c = new Uint8Array(CHUNK * CHUNK * 96);
      this.generateChunk(cx, cz, c);
      this.chunks.set(k, c);
    }
    return c;
  }

  private generateChunk(cx: number, cz: number, out: Uint8Array): void {
    const world = this.seed;
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const wx = cx * CHUNK + lx;
        const wz = cz * CHUNK + lz;

        // Terrain height: base desert floor plus one big mesa layer.
        const n1 = fbm((wx + world) * 0.012, (wz + world) * 0.012, 4);
        const n2 = fbm((wx + world) * 0.05, (wz + world) * 0.05, 3);
        let h = Math.round(26 + n1 * 26 + n2 * 4);

        const mesaMask = valueNoise((wx + world) * 0.016, (wz + world) * 0.016);
        if (mesaMask > 0.58) {
          const m = Math.min(1, (mesaMask - 0.58) / 0.2);
          const top = h + Math.round(14 * m);
          // Sharpen the flat top: anything below the lip falls back to floor.
          const rim = valueNoise((wx + world) * 0.06, (wz + world) * 0.06);
          if (rim > 0.42) h = top;
        }

        const idx = (lx * CHUNK + lz) * 96;
        for (let y = 0; y < 96; y++) {
          let id: number = B.AIR;
          if (y === 0) {
            id = B.BEDROCK;
          } else if (y <= h) {
            const depth = h - y;
            if (depth === 0) id = B.SAND;
            else if (depth <= 2) id = B.SANDSTONE;
            else {
              // Terracotta / dark-strata bands, then rock.
              const band = Math.floor(depth - 3) % 4;
              if (depth <= 12) id = band < 2 ? B.SANDSTONE : TERRA_BLOCK;
              else if (depth <= 18) id = band < 2 ? STRATA_BLOCK : TERRA_BLOCK;
              else id = ROCK_BLOCK;
            }
          }
          out[idx + y] = id;
        }

        // Scattered cacti on exposed sand.
        if (out[idx + h] === B.SAND && hash2(wx * 7 + 13, wz * 5 - world) < 0.006 && h > 4 && h + 3 < 95) {
          const n = 1 + ((hash2(wx - world, wz + 9) * 3) | 0);
          for (let i = 1; i <= n; i++) out[idx + h + i] = CACTUS_BLOCK;
        }
      }
    }

    // Guarantee spawn plateau: a 9x9 flat sand disc at the world origin.
    if (cx === 0 && cz === 0) {
      for (let lz = 0; lz < CHUNK; lz++) {
        for (let lx = 0; lx < CHUNK; lx++) {
          const dx = lx - 8, dz = lz - 8;
          if (dx * dx + dz * dz <= 20) {
            const idx = (lx * CHUNK + lz) * 96;
            for (let y = 1; y < 40; y++) out[idx + y] = B.AIR;
            for (let y = 1; y <= 30; y++) out[idx + y] = ROCK_BLOCK;
            for (let y = 31; y <= 32; y++) out[idx + y] = B.SANDSTONE;
            out[idx + 33] = B.SAND;
          }
        }
      }
    }
  }

  getBlock(wx: number, wy: number, wz: number): number {
    if (wy < 0) return B.BEDROCK;
    if (wy >= 96) return B.AIR;
    const cx = Math.floor(wx / CHUNK);
    const cz = Math.floor(wz / CHUNK);
    const lx = wx - cx * CHUNK;
    const lz = wz - cz * CHUNK;
    return this.chunk(cx, cz)[(lx * CHUNK + lz) * 96 + wy];
  }

  isSolid(wx: number, wy: number, wz: number): boolean {
    const d = blockDef(this.getBlock(wx | 0, wy | 0, wz | 0));
    return !!d && d.solid;
  }

  setBlock(wx: number, wy: number, wz: number, id: number): void {
    if (wy < 1 || wy >= 96) return;
    const cx = Math.floor(wx / CHUNK);
    const cz = Math.floor(wz / CHUNK);
    const lx = wx - cx * CHUNK;
    const lz = wz - cz * CHUNK;
    this.chunk(cx, cz)[(lx * CHUNK + lz) * 96 + wy] = id;
    this.markDirty(cx, cz);
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK - 1) this.markDirty(cx, cz + 1);
  }

  /** Highest solid block y at (wx, wz), or -1 if none. */
  surfaceY(wx: number, wz: number): number {
    for (let y = 95; y >= 0; y--) {
      if (this.isSolid(wx, y, wz)) return y;
    }
    return -1;
  }

  /** Spawn point: on the guaranteed sand plateau, facing the mesas. */
  spawn(): { x: number; y: number; z: number } {
    const y = this.surfaceY(8, 8);
    return { x: 8.5, y: (y < 0 ? 34 : y) + 1.05, z: 8.5 };
  }

  /** Ensure chunks around the player are generated + meshed; returns dirty ones. */
  sync(px: number, pz: number): ChunkMesh[] {
    const pcx = Math.floor(px / CHUNK);
    const pcz = Math.floor(pz / CHUNK);
    const dirty: ChunkMesh[] = [];
    for (let dz = -VIEW_CHUNKS + 1; dz <= VIEW_CHUNKS - 1; dz++) {
      for (let dx = -VIEW_CHUNKS + 1; dx <= VIEW_CHUNKS - 1; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        this.chunk(cx, cz); // generate if missing (also fills neighbours' borders)
        const k = this.key(cx, cz);
        let m = this.meshes.get(k);
        if (!m) {
          m = { cx, cz, vertCount: 0, dirty: true };
          this.meshes.set(k, m);
        }
        if (m.dirty) {
          this.meshData(cx, cz); // build + cache the merged vertex array (fillMesh)
          m.vertCount = Math.floor(this.meshCache.get(k)!.length / 7);
          dirty.push(m);
        }
      }
    }

    // Drop far chunks to keep memory bounded.
    for (const [k, m] of this.meshes) {
      if (Math.abs(m.cx - pcx) > VIEW_CHUNKS + 1 || Math.abs(m.cz - pcz) > VIEW_CHUNKS + 1) {
        this.meshes.delete(k);
      }
    }
    return dirty;
  }

  private markDirty(cx: number, cz: number): void {
    const m = this.meshes.get(this.key(cx, cz));
    if (m) {
      m.dirty = true;
      this.meshCache.delete(this.key(cx, cz));
    }
  }

  /** Raw interleaved vertex array for a chunk (x,y,z, nx,ny,nz, r,g,b). */
  meshData(cx: number, cz: number): Float32Array {
    const k = this.key(cx, cz);
    let arr = this.meshCache.get(k);
    if (!arr) {
      const out: number[] = [];
      this.fillMesh(cx, cz, out);
      arr = new Float32Array(out);
      this.meshCache.set(k, arr);
    }
    return arr;
  }

  private fillMesh(cx: number, cz: number, out: number[]): void {
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const wx = cx * CHUNK + lx;
        const wz = cz * CHUNK + lz;
        for (let y = 1; y < 95; y++) {
          const id = this.getBlock(wx, y, wz);
          if (id === B.AIR) continue;
          const col = blockColor(id);

          for (let f = 0; f < FACES.length; f++) {
            const face = FACES[f];
            if (this.isOpaque(wx + face.dir[0], y + face.dir[1], wz + face.dir[2])) continue;
            const ao = this.faceAO(wx, y, wz, f);

            // Aerial perspective: fade toward the sky horizon with distance.
            const dist = Math.hypot(wx - 8, wz - 8) + Math.abs(y - 30);
            const t = Math.min(1, Math.max(0, (dist - FOG_START) / (FOG_END - FOG_START)));
            const fog = lerp3(col, SKY_HORIZON, t * 0.5);
            const s = face.shade;

            for (let i = 0; i < 4; i++) {
              const cn = face.corners[i];
              out.push(
                wx + cn[0], y + cn[1], wz + cn[2],
                face.dir[0], face.dir[1], face.dir[2],
                (fog[0] / 255) * s * ao[i],
                (fog[1] / 255) * s * ao[i],
                (fog[2] / 255) * s * ao[i],
              );
            }
          }
        }
      }
    }
  }

  private isOpaque(wx: number, wy: number, wz: number): boolean {
    const d = blockDef(this.getBlock(wx, wy, wz));
    return !!d && (d.opaque === 1 || d.id === B.LEAVES);
  }

  /** Per-corner AO for a visible face (4 values, matches FACES corner order). */
  private faceAO(wx: number, y: number, wz: number, f: number): [number, number, number, number] {
    const face = FACES[f];
    // In-plane axes for this face (both perpendicular to the face normal).
    let ax: [number, number, number], ay: [number, number, number];
    if (f === 0 || f === 1) { ax = [0, 1, 0]; ay = [0, 0, 1]; }
    else if (f === 2 || f === 3) { ax = [1, 0, 0]; ay = [0, 0, 1]; }
    else { ax = [1, 0, 0]; ay = [0, 1, 0]; }

    const occ = (x: number, yy: number, z: number): boolean => this.isOpaque(x, yy, z);
    const base: [number, number, number] = [wx + face.dir[0], y + face.dir[1], wz + face.dir[2]];
    const out: [number, number, number, number] = [1, 1, 1, 1];
    const signs = AO_SIGN[f]; // per-corner sign pairs for this face
    for (let i = 0; i < 4; i++) {
      const sAx = signs[i][0]; // this corner's two in-plane neighbour signs
      const sAz = signs[i][1];
      // Two in-plane neighbour cells around this corner.
      const n1 = occ(base[0] + sAx * ax[0], base[1] + sAz * ay[1], base[2] + sAx * ax[2]);
      const n2 = occ(base[0] + sAz * ay[0], base[1] + sAx * ax[1] + sAz * ay[1], base[2] + sAz * ay[2]);
      const edge = occ(base[0] + sAx * ax[0] + sAz * ay[0],
        base[1] + sAx * ax[1] + sAz * ay[1],
        base[2] + sAx * ax[2] + sAz * ay[2]);
      if (n1 && n2) out[i] = 0.5;   // enclosed
      else if (n1 || n2) out[i] = 0.7; // one neighbour
      else if (edge) out[i] = 0.85;    // edge only
    }
    return out;
  }
}

// Extra block ids rendered as palette colours (not in the placeable registry).
const TERRA_BLOCK = 100; // terracotta band
const STRATA_BLOCK = 101; // dark strata band
const ROCK_BLOCK = 102;   // rock
const CACTUS_BLOCK = 103; // cactus

function blockColor(id: number): [number, number, number] {
  switch (id) {
    case B.SAND: return SAND;
    case B.SANDSTONE: return SANDSTONE;
    case TERRA_BLOCK: return TERRA;
    case STRATA_BLOCK: return STRATA;
    case ROCK_BLOCK: return ROCK;
    case CACTUS_BLOCK: return CACTUS;
    default: return [200, 180, 150];
  }
}
