/** CUBELAND — block-break particles + punch swing (US-006). */

export interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number; size: number;
  r: number; g: number; b: number;
}

const MAX = 128;
const GRAV = 24; // blocks/s^2 (matches player gravity)

export class Particles {
  private list: Particle[] = [];
  swingT = 0; // >0 while the punch arc is visible

  burst(x: number, y: number, z: number, color: [number, number, number]): void {
    const n = 10 + ((Math.random() * 5) | 0); // 10-14 cubes
    for (let i = 0; i < n && this.list.length < MAX; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.4 + Math.random() * 2.6;
      this.list.push({
        x: x + (Math.random() - 0.5) * 0.7,
        y: y + (Math.random() - 0.5) * 0.7,
        z: z + (Math.random() - 0.5) * 0.7,
        vx: Math.cos(a) * sp,
        vy: 1.6 + Math.random() * 2.4,
        vz: Math.sin(a) * sp,
        life: 0.3 + Math.random() * 0.15, // ~300ms
        maxLife: 0.45,
        size: 0.07 + Math.random() * 0.08,
        r: color[0] / 255, g: color[1] / 255, b: color[2] / 255,
      });
    }
  }

  /** Trigger the punch-swing animation (250ms arc). */
  swing(): void { this.swingT = 0.25; }

  step(dt: number): void {
    if (this.swingT > 0) this.swingT = Math.max(0, this.swingT - dt);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) { this.list.splice(i, 1); continue; }
      p.vy -= GRAV * dt;
      if (p.vy < -12) p.vy = -12;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }
  }

  /** Interleaved cubes: x,y,z,nx,ny,nz,r,g,b (9 floats) — same layout as world/mob meshes. */
  mesh(): Float32Array {
    if (this.list.length === 0) return new Float32Array(0);
    const out: number[] = [];
    for (const p of this.list) {
      const s = p.size;
      const fade = Math.max(0, Math.min(1, p.life / (p.maxLife * 0.5)));
      const r = p.r * fade, g = p.g * fade, b = p.b * fade;
      const x0 = p.x - s, x1 = p.x + s, y0 = p.y - s, y1 = p.y + s, z0 = p.z - s, z1 = p.z + s;
      const push = (verts: number[][]) => { for (const v of verts) out.push(v[0], v[1], v[2], v[3], v[4], v[5], r, g, b); };
      // +x
      push([[x1, y0, z1, 1, 0, 0], [x1, y1, z1, 1, 0, 0], [x1, y1, z0, 1, 0, 0],
            [x1, y0, z1, 1, 0, 0], [x1, y1, z0, 1, 0, 0], [x1, y0, z0, 1, 0, 0]]);
      // -x
      push([[x0, y0, z0, -1, 0, 0], [x0, y1, z0, -1, 0, 0], [x0, y1, z1, -1, 0, 0],
            [x0, y0, z0, -1, 0, 0], [x0, y1, z1, -1, 0, 0], [x0, y0, z1, -1, 0, 0]]);
      // +y
      push([[x0, y1, z1, 0, 1, 0], [x1, y1, z1, 0, 1, 0], [x1, y1, z0, 0, 1, 0],
            [x0, y1, z1, 0, 1, 0], [x1, y1, z0, 0, 1, 0], [x0, y1, z0, 0, 1, 0]]);
      // -y
      push([[x0, y0, z0, 0, -1, 0], [x1, y0, z0, 0, -1, 0], [x1, y0, z1, 0, -1, 0],
            [x0, y0, z0, 0, -1, 0], [x1, y0, z1, 0, -1, 0], [x0, y0, z1, 0, -1, 0]]);
      // +z
      push([[x0, y0, z1, 0, 0, 1], [x1, y0, z1, 0, 0, 1], [x1, y1, z1, 0, 0, 1],
            [x0, y0, z1, 0, 0, 1], [x1, y1, z1, 0, 0, 1], [x0, y1, z1, 0, 0, 1]]);
      // -z
      push([[x1, y0, z0, 0, 0, -1], [x0, y0, z0, 0, 0, -1], [x0, y1, z0, 0, 0, -1],
            [x1, y0, z0, 0, 0, -1], [x0, y1, z0, 0, 0, -1], [x1, y1, z0, 0, 0, -1]]);
    }
    return new Float32Array(out);
  }

  /** 0..1 progress of the current swing (for camera FOV kick / arm). */
  get swingProgress(): number { return this.swingT > 0 ? 1 - this.swingT / 0.25 : 0; }
}
