import { B, isSolid } from './blocks';
import { clamp } from './noise';
import type { World } from './world';

const EYE = 1.62, HW = 0.3, BH = 1.8;
const G = 26, JV = 8.4, MF = -38;
const SU = 1.05, SE = 0.0026;

export class Keys {
  private h = new Set<string>();
  private mx = 0;
  private my = 0;
  lmb = false; rmb = false;
  private e = new Set<number>();
  onWheel: ((d: number) => void) | null = null;
  sprintLatch = false;
  private lw = 0;
  cv: HTMLCanvasElement;

  constructor(cv: HTMLCanvasElement) {
    this.cv = cv;
    window.addEventListener('keydown', e => {
      if (this.inI()) return;
      this.h.add(e.code);
      if (e.code === 'Space' && this.locked()) e.preventDefault();
      if (e.code === 'KeyW' && !e.repeat) {
        const n = performance.now();
        if (n - this.lw < 280) this.sprintLatch = true;
        this.lw = n;
      }
    });
    window.addEventListener('keyup', e => { this.h.delete(e.code); if (e.code === 'KeyW') this.sprintLatch = false; });
    window.addEventListener('blur', () => { this.h.clear(); this.lmb = this.rmb = false; this.e.clear(); });
    window.addEventListener('mousemove', e => { if (!this.locked()) return; this.mx += e.movementX; this.my += e.movementY; });
    window.addEventListener('mousedown', e => {
      if (!this.locked()) return;
      if (e.button === 0) { this.lmb = true; this.e.add(0); }
      if (e.button === 2) { this.rmb = true; this.e.add(2); }
    });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.lmb = false; if (e.button === 2) this.rmb = false; });
    window.addEventListener('wheel', e => { if (!this.locked()) return; e.preventDefault(); this.onWheel?.(e.deltaY > 0 ? 1 : -1); }, { passive: false });
    window.addEventListener('contextmenu', e => { if (this.locked()) e.preventDefault(); });
  }

  private inI() {
    const a = document.activeElement;
    return a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement;
  }

  locked() { return document.pointerLockElement === this.cv; }
  down(c: string) { return this.h.has(c); }
  takeMouse(): [number, number] { const r: [number, number] = [this.mx, this.my]; this.mx = 0; this.my = 0; return r; }
  takeClick(b: number) { if (this.e.has(b)) { this.e.delete(b); return true; } return false; }
}

export interface RayHit { x: number; y: number; z: number; nx: number; ny: number; nz: number; dist: number; }

export class Player {
  pos = { x: 0, y: 0, z: 0 };
  vel = { x: 0, y: 0, z: 0 };
  yaw = 0; pitch = -0.1;
  onGround = false; inWater = false; headInWater = false; sneaking = false; sprinting = false;

  constructor(public keys: Keys, x: number, y: number, z: number, yaw: number) {
    this.pos.x = x; this.pos.y = y; this.pos.z = z; this.yaw = yaw;
  }

  reset(x: number, y: number, z: number, yaw: number, pitch = -0.1) {
    this.pos.x = x; this.pos.y = y; this.pos.z = z;
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = yaw; this.pitch = pitch; this.onGround = false;
  }

  eye(): [number, number, number] { return [this.pos.x, this.pos.y + EYE, this.pos.z]; }

  forward(): [number, number, number] {
    const yaw = this.yaw, fp = Math.cos(this.pitch);
    return [-Math.cos(Math.PI / 2 - yaw) * fp, Math.cos(Math.PI / 2 - this.pitch), -Math.cos(yaw) * fp];
  }

  update(dt: number, w: World) {
    const k = this.keys;
    const [mdx, mdy] = k.takeMouse();
    this.yaw -= mdx * SE;
    this.pitch = clamp(this.pitch - mdy * SE, -1.55, 1.55);

    const f = (k.down('KeyW') ? 1 : 0) - (k.down('KeyS') ? 1 : 0);
    const s = (k.down('KeyD') ? 1 : 0) - (k.down('KeyA') ? 1 : 0);
    this.sneaking = k.down('ShiftLeft') || k.down('ShiftRight');
    const ws = !this.sneaking && (k.down('ControlLeft') || k.sprintLatch) && (f !== 0 || s !== 0);
    this.sprinting = ws;

    const cy = Math.cos(this.yaw), fx = Math.cos(Math.PI / 2 - this.yaw);
    let wx = -fx * f + cy * s, wz = -cy * f - fx * s;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }

    const sp = this.inWater ? (ws ? 4.6 : 3) : this.sneaking ? 1.9 : (ws ? 6.4 : 4.3);
    const gr = this.onGround;
    const ac = this.inWater ? 5 : (gr ? 14 : 4.5);
    const tt = Math.min(1, ac * dt);
    this.vel.x += (wx * sp - this.vel.x) * tt;
    this.vel.z += (wz * sp - this.vel.z) * tt;

    if (this.inWater) {
      const tv = k.down('Space') ? 3.6 : (this.sneaking ? -2.8 : -1.4);
      this.vel.y += (tv - this.vel.y) * Math.min(1, 5 * dt);
    } else {
      this.vel.y = Math.max(this.vel.y - G * dt, MF);
      if (k.down('Space') && gr) this.vel.y = JV;
    }

    this.onGround = false;
    if (!this.ax(w, 'x', this.vel.x * dt, gr)) this.vel.x = 0;
    if (!this.ax(w, 'z', this.vel.z * dt, gr)) this.vel.z = 0;
    if (!this.ax(w, 'y', this.vel.y * dt, gr)) { if (this.vel.y < 0) this.onGround = true; this.vel.y = 0; }

    const px = Math.floor(this.pos.x), pz = Math.floor(this.pos.z);
    this.inWater = w.block(px, Math.floor(this.pos.y + 0.4), pz) === B.WATER ||
      w.block(px, Math.floor(this.pos.y + 1.2), pz) === B.WATER;
    this.headInWater = w.block(px, Math.floor(this.pos.y + EYE), pz) === B.WATER;
  }

  private col(w: World): boolean {
    const p = this.pos;
    const x0 = Math.floor(p.x - HW + 1e-4), x1 = Math.floor(p.x + HW - 1e-4);
    const y0 = Math.floor(p.y + 1e-4), y1 = Math.floor(p.y + BH - 1e-4);
    const z0 = Math.floor(p.z - HW + 1e-4), z1 = Math.floor(p.z + HW - 1e-4);
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++)
          if (isSolid(w.block(x, y, z))) return true;
    return false;
  }

  private ax(w: World, a: 'x' | 'y' | 'z', m: number, gr: boolean): boolean {
    if (m === 0) return true;
    const p = this.pos, ov = p[a];
    p[a] += m;
    if (!this.col(w)) return true;
    p[a] = ov;
    if (a === 'y') return false;
    if (gr && !this.sneaking) {
      const c = Math.floor(p.y) + 1;
      if (c >= p.y && c - p.y <= SU) {
        const oy = p.y;
        p.y = c + 0.002;
        p[a] += m;
        if (!this.col(w)) { this.onGround = true; return true; }
        p.y = oy;
      }
    }
    return false;
  }

  /** DDA raycast from the eye. Returns the hit block cell + face normal, or null. */
  raycast(w: World, mx = 5.3): RayHit | null {
    const o = this.eye(), d = this.forward();
    let x = Math.floor(o[0]), y = Math.floor(o[1]), z = Math.floor(o[2]);
    const sx = d[0] > 0 ? 1 : -1, sy = d[1] > 0 ? 1 : -1, sz = d[2] > 0 ? 1 : -1;
    const adx = Math.abs(d[0]) || 1e-9, ady = Math.abs(d[1]) || 1e-9, adz = Math.abs(d[2]) || 1e-9;
    let tx = (sx > 0 ? x + 1 - o[0] : o[0] - x) / adx;
    let ty = (sy > 0 ? y + 1 - o[1] : o[1] - y) / ady;
    let tz = (sz > 0 ? z + 1 - o[2] : o[2] - z) / adz;

    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < 256 && t <= mx; i++) {
      if (t > mx) break;
      const id = w.block(x, y, z);
      if (id !== B.AIR && id !== B.WATER) {
        return { x, y, z, nx, ny, nz, dist: t };
      }
      if (tx <= ty && tx <= tz) { x += sx; t = tx; nx = -sx; ny = 0; nz = 0; tx += 1 / adx; }
      else if (ty <= tz) { y += sy; t = ty; nx = 0; ny = -sy; nz = 0; ty += 1 / ady; }
      else { z += sz; t = tz; nx = 0; ny = 0; nz = -sz; tz += 1 / adz; }
    }
    return null;
  }
}
