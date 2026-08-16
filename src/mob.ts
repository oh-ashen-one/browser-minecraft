/**
 * CUBELAND — the Husk (one hostile night mob).
 * Matte-black silhouette with ember eyes. Spawns at night, walks toward the player.
 */

// Local types (no ./gl-types import — that module does not exist).
export interface MobPos { x: number; y: number; z: number }

// Packed color helpers (colors here are 0xRRGGBB numbers).
function chR(c: number): number { return (c >> 16) & 255; }
function chG(c: number): number { return (c >> 8) & 255; }
function chB(c: number): number { return c & 255; }

// Design-bible palette for the Husk.
const HUSK_BODY = 0x0E0C12;   // matte black
const HUSK_EYE  = 0xFFB65C;   // ember eyes

export interface WorldApi {
  isSolid(x: number, y: number, z: number): boolean;
  surfaceY(x: number, z: number): number;
}

export interface PlayerApi {
  x: number; y: number; z: number;
}

export class Husk {
  x = 0; y = 0; z = 0;
  vy = 0;
  yaw = 0;
  alive = true;
  onGround = false;

  private world: WorldApi | null = null;
  private player: PlayerApi | null = null;

  constructor() {
    // Spawn position set by main.ts via spawnAt().
  }

  /** Bind to the world and player references. */
  bind(world: WorldApi, player: PlayerApi): void {
    this.world = world;
    this.player = player;
  }

  /** Place the Husk at a given world position. */
  spawnAt(x: number, y: number, z: number): void {
    this.x = x; this.y = y; this.z = z;
    this.vy = 0;
    this.alive = true;
    // Face the player.
    if (this.player) {
      const dx = this.player.x - x;
      const dz = this.player.z - z;
      this.yaw = Math.atan2(dx, dz);
    }
  }

  /**
   * Step the Husk: simple gravity + walk toward player.
   */
  step(dt: number): void {
    if (!this.alive || !this.world || !this.player) return;

    const p = this.player;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const dist = Math.hypot(dx, dz);

    // Walk toward the player at ~2.2 blocks/s.
    const speed = 2.2;
    if (dist > 0.5) {
      this.yaw = Math.atan2(dx, dz);
      const vx = (dx / dist) * speed;
      const vz = (dz / dist) * speed;

      // X axis.
      let nx = this.x + vx * dt;
      if (!this.world.isSolid(Math.floor(nx), Math.floor(this.y - 0.5), Math.floor(this.z))) {
        this.x = nx;
      }
      // Z axis.
      let nz = this.z + vz * dt;
      if (!this.world.isSolid(Math.floor(this.x), Math.floor(this.y - 0.5), Math.floor(nz))) {
        this.z = nz;
      }
    }

    // Gravity.
    this.vy -= 24 * dt;
    if (this.vy < -40) this.vy = -40;

    let ny = this.y + this.vy * dt;
    if (this.world.isSolid(Math.floor(this.x), Math.floor(ny - 0.5), Math.floor(this.z))) {
      if (this.vy < 0) { this.y = Math.floor(ny - 0.5) + 1.5; this.vy = 0; this.onGround = true; }
      else { this.y = Math.floor(ny - 0.5) + 1; this.vy = 0; }
    } else {
      this.y = ny;
      this.onGround = false;
    }

    // Safety: if we fall out of the world, respawn near the player.
    if (this.y < -20) {
      const sx = Math.floor(p.x + 8);
      const sz = Math.floor(p.z + 8);
      const sy = this.world.surfaceY(sx, sz);
      if (sy >= 0) { this.x = sx + 0.5; this.y = sy + 1.5; this.z = sz + 0.5; this.vy = 0; }
      else { this.alive = false; }
    }
  }

  /**
   * Build the Husk's mesh as interleaved float vertices.
   * Each vertex: x, y, z, nx, ny, nz, r, g, b (9 floats = 36 bytes).
   * Body is a simple box; eyes are two small bright quads.
   */
  mesh(): Float32Array {
    const verts: number[] = [];

    // Body box (0.5 wide, 1.6 tall, 0.3 deep) centered on this.x, standing at this.y.
    const by = this.y - 1.6;

    const r = chR(HUSK_BODY) / 255;
    const g = chG(HUSK_BODY) / 255;
    const b = chB(HUSK_BODY) / 255;

    // Front face (facing +z in local, rotated by yaw).
    const cx = this.x, cy = by + 0.8, cz = this.z;
    const cosY = Math.cos(this.yaw), sinY = Math.sin(this.yaw);

    function rot(px: number, py: number, pz: number): [number, number, number] {
      const rx = px * cosY + pz * sinY;
      const rz = -px * sinY + pz * cosY;
      return [cx + rx, cy + py, cz + rz];
    }

    function quad(p1: [number, number, number], p2: [number, number, number], p3: [number, number, number], p4: [number, number, number], nrm: [number, number, number]): void {
      for (const p of [p1, p2, p3]) verts.push(p[0], p[1], p[2], nrm[0], nrm[1], nrm[2], r, g, b);
      for (const p of [p1, p3, p4]) verts.push(p[0], p[1], p[2], nrm[0], nrm[1], nrm[2], r, g, b);
    }

    // Six faces of the body box. Each face: 4 corner tuples [x, y, z].
    const hw = 0.25, hh = 0.8, hd = 0.15;
    const corners: [number, number, number][][] = [
      // front (+z)
      [[-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd]],
      // back (-z)
      [[hw, -hh, -hd], [-hw, -hh, -hd], [-hw, hh, -hd], [hw, hh, -hd]],
      // right (+x)
      [[hw, -hh, hd], [hw, -hh, -hd], [hw, hh, -hd], [hw, hh, hd]],
      // left (-x)
      [[-hw, -hh, -hd], [-hw, -hh, hd], [-hw, hh, hd], [-hw, hh, -hd]],
      // top (+y)
      [[-hw, hh, hd], [hw, hh, hd], [hw, hh, -hd], [-hw, hh, -hd]],
      // bottom (-y)
      [[-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd]],
    ];
    const normals: [number, number, number][] = [
      [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]
    ];

    for (let i = 0; i < 6; i++) {
      const c = corners[i];
      const n = normals[i];
      quad(rot(c[0][0], c[0][1], c[0][2]), rot(c[1][0], c[1][1], c[1][2]), rot(c[2][0], c[2][1], c[2][2]), rot(c[3][0], c[3][1], c[3][2]), n);
    }

    // Ember eyes: two small quads on the front face.
    const er = chR(HUSK_EYE) / 255;
    const eg = chG(HUSK_EYE) / 255;
    const eb = chB(HUSK_EYE) / 255;
    const eyeY = hh - 0.18; // near the top of the body
    const eyeZ = hd + 0.01; // slightly in front

    function rotEye(px: number, py: number, pz: number): [number, number, number] {
      const rx = px * cosY + pz * sinY;
      const rz = -px * sinY + pz * cosY;
      return [cx + rx, cy + py, cz + rz];
    }

    // Left eye.
    {
      const s = 0.06;
      const p1: [number, number, number] = rotEye(-0.1 - s, eyeY, eyeZ);
      const p2: [number, number, number] = rotEye(-0.1 + s, eyeY, eyeZ);
      const p3: [number, number, number] = rotEye(-0.1 + s, eyeY + s, eyeZ);
      const p4: [number, number, number] = rotEye(-0.1 - s, eyeY + s, eyeZ);
      const n: [number, number, number] = [0, 0, 1];
      for (const p of [p1, p2, p3]) verts.push(p[0], p[1], p[2], n[0], n[1], n[2], er, eg, eb);
      for (const p of [p1, p3, p4]) verts.push(p[0], p[1], p[2], n[0], n[1], n[2], er, eg, eb);
    }
    // Right eye.
    {
      const s = 0.06;
      const p1: [number, number, number] = rotEye(0.1 - s, eyeY, eyeZ);
      const p2: [number, number, number] = rotEye(0.1 + s, eyeY, eyeZ);
      const p3: [number, number, number] = rotEye(0.1 + s, eyeY + s, eyeZ);
      const p4: [number, number, number] = rotEye(0.1 - s, eyeY + s, eyeZ);
      const n: [number, number, number] = [0, 0, 1];
      for (const p of [p1, p2, p3]) verts.push(p[0], p[1], p[2], n[0], n[1], n[2], er, eg, eb);
      for (const p of [p1, p3, p4]) verts.push(p[0], p[1], p[2], n[0], n[1], n[2], er, eg, eb);
    }

    return new Float32Array(verts);
  }
}
