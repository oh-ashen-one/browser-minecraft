/**
 * CUBELAND — voxel world core.
 * Infinite chunked terrain from a seed: continents, hill ridges, beaches,
 * ocean floors, forests (deterministic global tree lattice), spongy caves,
 * ore veins. Sunlight is per-column; block light (torches + lit furnaces)
 * propagates by BFS over 3x3-chunk regions. Every mutation tracks mesh
 * dirtiness, per-column sunlight refresh and a save-replay edit list so the
 * exact world can be rebuilt from {seed, edits}.
 */
import { B, blockDef } from './blocks';
import { h2, fbm2, fbm3, vnoise3, hashSeed, smoothstep } from './noise';

export const CS = 16;      // chunk size on X/Z
export const HEIGHT = 80;  // world height in blocks
export const SEA = 32;     // sea level (base y of the top water row)

export function chunkKey(cx: number, cz: number): string { return cx + ',' + cz; }
export function posKey(x: number, y: number, z: number): string { return x + ',' + y + ',' + z; }

export class Chunk {
  cx: number; cz: number;
  data = new Uint8Array(CS * CS * HEIGHT); // block ids, column-major
  sun = new Uint8Array(CS * CS * HEIGHT);  // sunlight 0..15 per cell
  blt = new Uint8Array(CS * CS * HEIGHT);  // block light 0..15 per cell
  needsMesh = true;

  constructor(cx: number, cz: number) { this.cx = cx; this.cz = cz; }

  /** local index: (z16 * 16 + x16) * HEIGHT + y */
  i(x: number, z: number, y: number): number { return (z * CS + x) * HEIGHT + y; }
}

export interface FurnaceState {
  inId: number | null; inN: number;
  outId: number | null; outN: number;
  fuelId: number | null; fuelUnits: number; // remaining smelts as float
  prog: number;                             // seconds into current smelt
}

export interface WorldSave {
  seed: string;
  edits: number[][]; // [x, y, z, id]...
  furnaces: Record<string, FurnaceState>;
}

export class World {
  seedStr: string;
  seed: number;

  chunks = new Map<string, Chunk>();
  private heightCache = new Map<string, number>();

  /** replayable edits: "x,y,z" -> id (save/restore) */
  edits = new Map<string, number>();
  furnaces = new Map<string, FurnaceState>();

  /** chunkKey -> count of light-emitting blocks in that chunk */
  private emitCnt = new Map<string, number>();
  /** world positions of emitters ("x,y,z") */
  private emitters = new Set<string>();

  /** chunkKeys whose mesh must be (re)built — drained by the game each frame */
  dirty = new Set<string>();
  /** region centers "cx,cz" whose block-light BFS is queued */
  private pendingLight = new Set<string>();

  private spawn: { x: number; y: number; z: number; yaw: number } | null = null;

  constructor(seedStr: string) {
    this.seedStr = seedStr;
    this.seed = hashSeed(seedStr);
  }

  /* ---------------- terrain (pure functions of the seed) --------------- */

  private heightRaw(x: number, z: number): number {
    const c = fbm2(x * 0.0016, z * 0.0016, this.seed + 900, 4) * 2 - 1; // continents ~[-1,1]
    const e = fbm2(x * 0.0075 + 31, z * 0.0075 - 17, this.seed + 411, 4); // hill energy
    const hill = smoothstep(0.52, 0.96, e);
    let h = 27 + c * 10;          // ~17..37
    h += hill * (16 + e * 16);    // ridges up to ~+30
    return Math.floor(Math.max(2, Math.min(HEIGHT - 6, h)));
  }

  /** Highest solid block base y for a column (cached). */
  heightAt(x: number, z: number): number {
    const k = x + ',' + z;
    let v = this.heightCache.get(k);
    if (v === undefined) {
      v = this.heightRaw(x, z);
      this.heightCache.set(k, v);
    }
    return v;
  }

  private treeDensity(x: number, z: number, h: number): number {
    if (h < SEA + 2) return 0;            // no trees underwater / beach
    if (h > 48) return 0.05;              // rocky tops are sparse
    const t = fbm2(x * 0.01 + 517, z * 0.01 - 233, this.seed + 808, 3);
    const base = t > 0.56 ? 0.24 : 0.07;  // dense forest pockets vs meadow scatter
    return base * smoothstep(SEA + 1, SEA + 6, h);
  }

  /** Deterministic tree occupying lattice cell (centres at c*3+1). Pure. */
  private treeAtCell(ccx: number, ccz: number): { h: number; gy: number } | null {
    const tx = ccx * 3 + 1, tz = ccz * 3 + 1;
    const gy = this.heightAt(tx, tz);
    if (gy < SEA + 2 || gy >= HEIGHT - 8) return null;
    if (h2(ccx, ccz, this.seed + 777) >= this.treeDensity(tx, tz, gy)) return null;
    const th = 4 + ((h2(ccx, ccz, this.seed + 31) * 3) | 0); // trunk height 4..6
    return { h: th, gy };
  }

  /* ---------------- chunk generation ----------------------------------- */

  getChunk(cx: number, cz: number): Chunk {
    const k = chunkKey(cx, cz);
    let ch = this.chunks.get(k);
    if (!ch) {
      ch = new Chunk(cx, cz);
      this.chunks.set(k, ch);
      this.genChunk(ch);
      this.queuePossibleLight(cx, cz);
    }
    return ch;
  }

  /** Non-creating lookup (used by the mesher / streamer). */
  chunkAt(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  unload(k: string): void {
    this.chunks.delete(k);
    this.emitCnt.delete(k);
    this.dirty.delete(k);
  }

  private genChunk(ch: Chunk): void {
    this.emitCnt.set(chunkKey(ch.cx, ch.cz), 0); // nature spawns no emitters
    for (let lz = 0; lz < CS; lz++) {
      for (let lx = 0; lx < CS; lx++) {
        this.genColumn(ch, ch.cx * CS + lx, ch.cz * CS + lz);
      }
    }
    this.stampTrees(ch);
    for (let lz = 0; lz < CS; lz++) {
      for (let lx = 0; lx < CS; lx++) this.sunPass(ch, lx, lz);
    }
    ch.needsMesh = true;
  }

  private genColumn(ch: Chunk, wx: number, wz: number): void {
    const lx = wx - ch.cx * CS;
    const lz = wz - ch.cz * CS;
    const h = this.heightAt(wx, wz);
    const sandy = h <= SEA + 1; // ocean floor / beach rim

    // cliff check: steepest 1-block rise among the 8 neighbours
    let dh = 0;
    for (let ax = -1; ax <= 1; ax++) {
      for (let az = -1; az <= 1; az++) {
        if (ax === 0 && az === 0) continue;
        dh = Math.max(dh, Math.abs(h - this.heightAt(wx + ax, wz + az)));
      }
    }
    const cliff = !sandy && dh >= 3;

    for (let y = 0; y <= h; y++) {
      let id: number;
      if (y === h)             id = sandy ? B.SAND : cliff ? B.STONE : B.GRASS;
      else if (y >= h - 3)     id = sandy ? B.SAND : cliff ? B.STONE : B.DIRT;
      else if (y === 0)        id = B.BEDROCK;
      else if (y < 4 && h2(wx + y * 31, wz - y * 17, this.seed + 12) > 0.5) id = B.BEDROCK;
      else {
        id = B.STONE;
        if (y < 46 && vnoise3(wx * 0.25, y * 0.34, wz * 0.25, this.seed + 7) > 0.68) id = B.COAL_ORE;
        else if (y < 30 && vnoise3(wx * 0.22, y * 0.30, wz * 0.22, this.seed + 77) > 0.67) id = B.IRON_ORE;
      }
      ch.data[ch.i(lx, lz, y)] = id;
    }

    // fill water up to sea level
    for (let y = h + 1; y <= SEA && y < HEIGHT; y++) ch.data[ch.i(lx, lz, y)] = B.WATER;

    // spongy caves: cheap gate first, then real 3D noise where likely
    for (let y = 3; y <= h; y++) {
      const b = ch.data[ch.i(lx, lz, y)];
      if (b !== B.STONE && b !== B.COAL_ORE && b !== B.IRON_ORE) continue;
      if (h2(wx + y * 37, wz - y * 19, this.seed + 55) < 0.52) continue;
      const n1 = fbm3(wx * 0.08, y * 0.125, wz * 0.08, this.seed + 31, 3);
      const n2 = vnoise3(wx * 0.045, y * 0.06, wz * 0.045, this.seed + 91);
      if (n1 > 0.62 || n2 > 0.74) ch.data[ch.i(lx, lz, y)] = B.AIR;
    }

    // decorative tall grass on exposed meadow tops
    const top = ch.data[ch.i(lx, lz, h)];
    if (top === B.GRASS && h + 1 < HEIGHT && h2(wx, wz, this.seed + 555) < 0.14) {
      ch.data[ch.i(lx, lz, h + 1)] = B.TALL_GRASS;
    }
  }

  /** Stamp every tree whose trunk/leaf volume can intersect this chunk. */
  private stampTrees(ch: Chunk): void {
    const x0 = ch.cx * CS, z0 = ch.cz * CS;
    for (let ccx = Math.floor((x0 - 5) / 3); ccx * 3 + 1 <= x0 + CS + 2; ccx++) {
      for (let ccz = Math.floor((z0 - 5) / 3); ccz * 3 + 1 <= z0 + CS + 2; ccz++) {
        const t = this.treeAtCell(ccx, ccz);
        if (!t) continue;
        this.stampTree(ch, ccx * 3 + 1, ccz * 3 + 1, t.gy, t.h);
      }
    }
  }

  private stampTree(ch: Chunk, tx: number, tz: number, gy: number, th: number): void {
    const top = gy + th;

    // leaf blob (AIR-only writes, clipped to this chunk)
    for (let k = -1; k <= 2; k++) {
      const ly = top + k;
      if (ly < 0 || ly >= HEIGHT) continue;
      const r = k <= 1 ? 2 : 1;
      for (let ox = -r; ox <= r; ox++) {
        for (let oz = -r; oz <= r; oz++) {
          if (Math.abs(ox) === 2 && Math.abs(oz) === 2 && k < 1) continue; // rounded corners
          const wx = tx + ox, wz = tz + oz;
          const lx = wx - ch.cx * CS, lz = wz - ch.cz * CS;
          if (lx < 0 || lx >= CS || lz < 0 || lz >= CS) continue;
          if (h2(wx + ly * 13, wz - ly * 7, this.seed + 911) < 0.2) continue; // speckled canopy
          const i = ch.i(lx, lz, ly);
          if (ch.data[i] === B.AIR) ch.data[i] = B.LEAVES;
        }
      }
    }

    // trunk (centre column, if inside this chunk)
    const lx = tx - ch.cx * CS;
    const lz = tz - ch.cz * CS;
    if (lx < 0 || lx >= CS || lz < 0 || lz >= CS) return;
    for (let y = gy + 1; y <= top && y < HEIGHT; y++) {
      const i = ch.i(lx, lz, y);
      if (ch.data[i] === B.AIR) ch.data[i] = B.LOG;
    }
  }

  /* ---------------- lighting ------------------------------------------- */

  /** Sunlight is purely per-column: carry a sky value downward; opaque
   *  blocks cut it, water attenuates by 2. (Leaves block; glass/crosses pass.) */
  private sunPass(ch: Chunk, lx: number, lz: number): void {
    let s = 15;
    for (let y = HEIGHT - 1; y >= 0; y--) {
      const i = ch.i(lx, lz, y);
      ch.sun[i] = s;
      const b = ch.data[i];
      if (b === B.WATER) {
        if (s > 0) s = Math.max(0, s - 2);
      } else if (b !== B.AIR) {
        const d = blockDef(b);
        if (d && d.opaque === 1) s = 0;
      }
    }
  }

  /** BFS block light over the 3x3-chunk region centred on (cx,cz). */
  private blightBFS(cx: number, cz: number): void {
    const xMin = (cx - 1) * CS, zMin = (cz - 1) * CS;
    const span = CS * 3;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const c = this.chunks.get(chunkKey(cx + dx, cz + dz));
        if (!c) return; // region incomplete — caller queues us for later
        c.blt.fill(0);
      }
    }

    const qx: number[] = [], qy: number[] = [], qz: number[] = [];
    for (const pk of this.emitters) {
      const p = pk.split(',');
      const ex = +p[0], ey = +p[1], ez = +p[2];
      if (ex < xMin || ex >= xMin + span || ez < zMin || ez >= zMin + span) continue;
      const ch = this.chunks.get(chunkKey(Math.floor(ex / CS), Math.floor(ez / CS)))!;
      const i = ch.i(ex - ch.cx * CS, ez - ch.cz * CS, ey);
      const d = blockDef(ch.data[i]);
      let lvl = (d && d.emit > 0) ? d.emit : 0;
      const f = this.furnaces.get(pk);
      if (f && f.fuelUnits > 0.5) lvl = Math.max(lvl, 13); // burning furnace glow
      if (lvl > ch.blt[i]) {
        ch.blt[i] = lvl;
        qx.push(ex); qy.push(ey); qz.push(ez);
      }
    }

    let head = 0;
    while (head < qx.length) {
      const x = qx[head], y = qy[head], z = qz[head]; head++;
      const chC = this.chunks.get(chunkKey(Math.floor(x / CS), Math.floor(z / CS)))!;
      const l = chC.blt[chC.i(x - chC.cx * CS, z - chC.cz * CS, y)];
      const nl = l - 1;
      if (nl < 1) continue;

      const nb = [
        [x + 1, y, z], [x - 1, y, z], [x, y + 1, z],
        [x, y - 1, z], [x, y, z + 1], [x, y, z - 1],
      ];
      for (const n of nb) {
        const nx = n[0], ny = n[1], nz = n[2];
        if (ny < 0 || ny >= HEIGHT) continue;
        const chN = this.chunks.get(chunkKey(Math.floor(nx / CS), Math.floor(nz / CS)));
        if (!chN) continue; // region edge — re-lit once the region is whole
        const li = chN.i(nx - chN.cx * CS, nz - chN.cz * CS, ny);
        const b = chN.data[li];
        if (b !== B.AIR && b !== B.WATER) {
          const bd = blockDef(b);
          if (bd && bd.opaque === 1) continue; // solids block light
        }
        if (nl > chN.blt[li]) {
          chN.blt[li] = nl;
          qx.push(nx); qy.push(ny); qz.push(nz);
        }
      }
    }
  }

  private allNine(cx: number, cz: number): boolean {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (!this.chunks.has(chunkKey(cx + dx, cz + dz))) return false;
      }
    }
    return true;
  }

  private regionHasEmitters(cx: number, cz: number): boolean {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if ((this.emitCnt.get(chunkKey(cx + dx, cz + dz)) || 0) > 0) return true;
      }
    }
    return false;
  }

  private queuePossibleLight(cx: number, cz: number): void {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const kx = cx + dx, kz = cz + dz;
        if (this.allNine(kx, kz) && this.regionHasEmitters(kx, kz)) {
          this.pendingLight.add(chunkKey(kx, kz));
        }
      }
    }
  }

  /** Run any queued block-light BFS whose region is complete. Call each frame. */
  flushLight(): void {
    if (this.pendingLight.size === 0) return;
    for (const k of Array.from(this.pendingLight)) {
      const p = k.split(',');
      const cx = +p[0], cz = +p[1];
      if (this.regionHasEmitters(cx, cz)) {
        if (this.allNine(cx, cz)) {
          this.blightBFS(cx, cz);
          this.pendingLight.delete(k);
        }
      } else {
        this.pendingLight.delete(k); // nothing to do; future edits trigger directly
      }
    }
  }

  /* ---------------- block access / mutation ---------------------------- */

  /** Read a block; auto-generates the chunk (player-facing calls). */
  block(x: number, y: number, z: number): number {
    if (y < 0) return B.BEDROCK;
    if (y >= HEIGHT) return B.AIR;
    const ch = this.getChunk(Math.floor(x / CS), Math.floor(z / CS));
    return ch.data[ch.i(x - ch.cx * CS, z - ch.cz * CS, y)];
  }

  /** Read a block without generating (mesher AO / light sampling). */
  peek(x: number, y: number, z: number): number {
    if (y < 0) return B.BEDROCK;
    if (y >= HEIGHT) return B.AIR;
    const ch = this.chunkAt(Math.floor(x / CS), Math.floor(z / CS));
    if (!ch) return B.AIR;
    return ch.data[ch.i(x - ch.cx * CS, z - ch.cz * CS, y)];
  }

  /**
   * Place/remove a block. Refreshes column sunlight, marks nearby meshes
   * dirty, drops unsupported cross-blocks above, and re-lights the 3x3
   * region (or queues it) when emitters are involved. `quiet` skips the
   * immediate BFS — used while replaying saved edits, then flushLight.
   */
  setBlock(x: number, y: number, z: number, id: number, quiet = false): void {
    if (y < 0 || y >= HEIGHT) return;
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const ch = this.getChunk(cx, cz);
    const lx = x - cx * CS, lz = z - cz * CS;
    const i = ch.i(lx, lz, y);
    const old = ch.data[i];
    if (old === id) return;
    ch.data[i] = id;

    this.edits.set(posKey(x, y, z), id);

    // unsupported cross-blocks fall
    if (id === B.AIR && y + 1 < HEIGHT) {
      const above = ch.data[i + 1];
      if (above === B.TORCH || above === B.TALL_GRASS) {
        ch.data[i + 1] = B.AIR;
        this.edits.set(posKey(x, y + 1, z), B.AIR);
      }
    }

    // furnace contents die with the block (game collects the drops)
    if (old === B.FURNACE && id !== B.FURNACE) this.furnaces.delete(posKey(x, y, z));

    // emitter bookkeeping
    const wasE = old === B.TORCH || old === B.FURNACE;
    const isE = id === B.TORCH || id === B.FURNACE;
    if (wasE !== isE) {
      const ck = chunkKey(cx, cz);
      this.emitCnt.set(ck, Math.max(0, (this.emitCnt.get(ck) || 0) + (isE ? 1 : -1)));
      const pk = posKey(x, y, z);
      if (isE) this.emitters.add(pk); else this.emitters.delete(pk);
    }

    // sunlight for the changed column (cheap, always correct)
    this.sunPass(ch, lx, lz);

    // dirty the chunk and any that share a border with it
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) this.dirty.add(chunkKey(cx + dx, cz + dz));
    }

    if (!quiet && this.regionHasEmitters(cx, cz)) {
      if (this.allNine(cx, cz)) this.blightBFS(cx, cz);
      else this.pendingLight.add(chunkKey(cx, cz));
    }
  }

  /* ---------------- furnaces ------------------------------------------- */

  furnaceAt(x: number, y: number, z: number): FurnaceState {
    const k = posKey(x, y, z);
    let f = this.furnaces.get(k);
    if (!f) {
      f = { inId: null, inN: 0, outId: null, outN: 0, fuelId: null, fuelUnits: 0, prog: 0 };
      this.furnaces.set(k, f);
    }
    return f;
  }

  furnaceLit(x: number, y: number, z: number): boolean {
    const f = this.furnaces.get(posKey(x, y, z));
    return !!f && f.fuelUnits > 0.5;
  }

  /* ---------------- spawn search --------------------------------------- */

  /**
   * Find a grassy hill near the origin that overlooks water with forest in
   * view — "spawn on a hill at golden hour". Pure: no chunks required.
   */
  findSpawn(): { x: number; y: number; z: number; yaw: number } {
    if (this.spawn) return this.spawn;

    const dirs: Array<[number, number]> = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [0.7, 0.7], [0.7, -0.7], [-0.7, 0.7], [-0.7, -0.7],
    ];

    let bx = 0, bz = 0, bh = this.heightAt(0, 0);
    let fx = 0, fz = -1;
    let best = -Infinity;

    for (let x = -48; x <= 48; x += 2) {
      for (let z = -48; z <= 48; z += 2) {
        const h = this.heightAt(x, z);
        if (h < SEA + 3 || h > SEA + 15) continue; // want a hill, not a cliff

        let water = 0;
        let wdx = 0, wdz = -1, wd = 99;
        for (const d of dirs) {
          for (let t = 6; t <= 24; t += 3) {
            const nx = x + Math.round(d[0] * t);
            const nz = z + Math.round(d[1] * t);
            if (this.heightAt(nx, nz) < SEA) { // that column is underwater → water visible
              const w = 1 - t / 30;
              if (w > water) { water = w; wdx = d[0]; wdz = d[1]; wd = t; }
              break;
            }
          }
        }

        let forest = 0;
        const pcx = Math.floor((x - 1) / 3), pcz = Math.floor((z - 1) / 3);
        for (let a = -2; a <= 2; a++) {
          for (let b = -2; b <= 2; b++) {
            if (this.treeAtCell(pcx + a, pcz + b)) forest++;
          }
        }

        const score = water * 3 + forest * 0.15 - (Math.abs(x) + Math.abs(z)) * 0.004;
        if (score > best) {
          best = score; bx = x; bz = z; bh = h;
          fx = wdx / (wd > 0 ? Math.hypot(wdx, wdz) || 1 : 1);
          fz = wdz / (wd > 0 ? Math.hypot(wdx, wdz) || 1 : 1);
        }
      }
    }

    if (best < 0) {
      // fallback: nearest decent grassy spot outward from origin
      outer: for (let r = 2; r <= 64; r += 2) {
        for (let a = -r; a <= r; a += 4) {
          const xs: number[] = [a, -a], zs: number[] = [a, -a];
          for (const sx of xs) for (const sz of zs) {
            const h = this.heightAt(sx, sz);
            if (h >= SEA + 3 && h <= SEA + 15) { bx = sx; bz = sz; bh = h; break outer; }
          }
        }
      }
    }

    // face the water: forward=(-sin yaw, -cos yaw) horizontally → yaw = atan2(-dx, -dz)
    const yaw = Math.atan2(-fx, -fz);
    this.spawn = { x: bx + 0.5, y: bh + 1, z: bz + 0.5, yaw };
    return this.spawn;
  }

  /* ---------------- save / restore -------------------------------------- */

  serialize(): WorldSave {
    const edits: number[][] = [];
    this.edits.forEach((id, k) => {
      const p = k.split(',');
      edits.push([+p[0], +p[1], +p[2], id]);
    });
    return { seed: this.seedStr, edits, furnaces: Object.fromEntries(this.furnaces) };
  }

  /** Replay saved edits quietly, then queue the affected light regions. */
  applyRestored(edits: number[][], furnaces: Record<string, FurnaceState>): void {
    for (const e of edits) this.setBlock(e[0], e[1], e[2], e[3], true);
    for (const [k, f] of Object.entries(furnaces)) this.furnaces.set(k, f);
    const centers = new Set<string>();
    for (const e of edits) {
      const cx = Math.floor(e[0] / CS), cz = Math.floor(e[2] / CS);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        centers.add(chunkKey(cx + dx, cz + dz));
      }
    }
    for (const k of centers) this.pendingLight.add(k);
  }
}
