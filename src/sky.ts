/**
 * CUBELAND — day/night cycle (US-005).
 * Self-contained time-of-day engine: accelerated 120s loop, color-graded sky
 * (day teal -> dusk apricot -> night indigo), sun + moon, a star field at
 * night, and the ambient light grade the world shader multiplies by.
 * Fog always equals the current sky horizon color so the world melts into it.
 */

export interface RGB { r: number; g: number; b: number }

const DAY = 120; // full day/night loop, seconds (design bible)

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function smooth(t: number): number { return t * t * (3 - 2 * t); }
function mixC(a: RGB, b: RGB, t: number): RGB {
  return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) };
}

function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// Sky keyframes (design-bible palette). t = seconds into the 120s loop.
const K: { t: number; top: RGB; hor: RGB; amb: RGB }[] = [
  { t: 0,   top: hex('#7FC8C4'), hor: hex('#F4D8A8'), amb: hex('#FFF4E0') }, // morning
  { t: 26,  top: hex('#7FC8C4'), hor: hex('#F4D8A8'), amb: hex('#FFF4E0') }, // day
  { t: 38,  top: hex('#F09A6A'), hor: hex('#8E4A6B'), amb: hex('#F09A6A') }, // dusk
  { t: 48,  top: hex('#171A2E'), hor: hex('#2E2440'), amb: hex('#2E3560') }, // night
  { t: 88,  top: hex('#171A2E'), hor: hex('#2E2440'), amb: hex('#2E3560') }, // deep night
  { t: 98,  top: hex('#F09A6A'), hor: hex('#8E4A6B'), amb: hex('#F09A6A') }, // dawn
  { t: 112, top: hex('#7FC8C4'), hor: hex('#F4D8A8'), amb: hex('#FFF4E0') }, // morning
  { t: 120, top: hex('#7FC8C4'), hor: hex('#F4D8A8'), amb: hex('#FFF4E0') },
];

function hash(n: number): number { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

const STARS = 160;
export const starField: Float32Array = new Float32Array(STARS * 4);
for (let i = 0; i < STARS; i++) {
  starField[i * 4] = hash(i + 1);          // x (0..1 screen)
  starField[i * 4 + 1] = hash(i + 50);     // y (0..1 screen, from top)
  starField[i * 4 + 2] = hash(i + 90);     // size factor
  starField[i * 4 + 3] = hash(i + 130);    // twinkle phase
}

export class DayNight {
  /** seconds into the loop; starts at golden hour (t=30, just before dusk). */
  time = 30;
  skyTop: RGB = K[0].top;
  horizon: RGB = K[0].hor;
  ambient: RGB = K[0].amb;
  fog: RGB = K[0].hor;      // always equals horizon (design bible)
  nightAmount = 0;          // 0 day .. 1 deep night (drives stars + spawns)
  sunDir: [number, number, number] = [0.6, 0.5, -0.4];
  moonDir: [number, number, number] = [-0.6, -0.5, 0.4];

  constructor() { this.update(0); }

  update(dt: number): void {
    if (dt > 0) this.time = (this.time + dt * (120 / DAY)) % DAY;
    const t = this.time;

    let i = 0;
    while (i < K.length - 1 && t >= K[i + 1].t) i++;
    const a = K[i], b = K[Math.min(i + 1, K.length - 1)];
    const span = Math.max(0.001, b.t - a.t);
    let f = (t - a.t) / span;
    if (f < 0) f = 0; else if (f > 1) f = 1;
    const e = smooth(f);

    this.skyTop = mixC(a.top, b.top, e);
    this.horizon = mixC(a.hor, b.hor, e);
    this.ambient = mixC(a.amb, b.amb, e);
    this.fog = this.horizon;

    // Sun arcs across the sky; opposite side is the moon.
    const ang = ((t - 30) / DAY) * Math.PI * 2; // noon-ish at t=60
    const sx = Math.cos(ang), sy = Math.sin(ang);
    this.sunDir = [sx * 0.8, sy, -0.5];
    this.moonDir = [-sx * 0.8, -sy, 0.5];

    // nightAmount: 1 during deep night, ramps at dusk/dawn (t in [40..92] is dark).
    const dark = t >= 40 && t <= 92;
    if (dark) this.nightAmount = 1;
    else if (t >= 34 && t < 40) this.nightAmount = smooth((t - 34) / 6);
    else if (t > 92 && t <= 98) this.nightAmount = smooth((98 - t) / 6);
    else this.nightAmount = 0;
  }

  /** Wall-clock-ish "time of day" in minutes for the HUD (0..1439). */
  get timeMinutes(): number { return Math.floor((this.time / DAY) * 1440); }

  isNight(): boolean { return this.nightAmount > 0.5; }
}

// ---------------- GL quad painters (screen-space, depth off) -----------------

const VS_QUAD = `
attribute vec2 aP; attribute vec3 aC;
varying vec3 vC;
void main() { gl_Position = vec4(aP, 0.0, 1.0); vC = aC; }
`;

const FS_SKY = `
precision mediump float;
varying vec3 vC; // unused, keep varying for attribute match
uniform vec3 uTop; uniform vec3 uHor; uniform vec2 uRes;
void main() {
  float y = gl_FragCoord.y / max(1.0, uRes.y);
  vec3 col = mix(uHor, uTop, pow(y, 0.85));
  gl_FragColor = vec4(col, 1.0);
}
`;

const FS_STAR = `
precision mediump float;
varying vec3 vC;
uniform vec2 uRes; uniform vec4 uS0; uniform vec4 uS1;
void main() {
  vec2 uv = gl_FragCoord.xy / max(1.0, uRes.x);
  float d0 = length(uv - vec2(uS0.x, uS0.y));
  float d1 = length(uv - vec2(uS1.x, uS1.y));
  float r0 = (uS0.z * 1.6 + 0.4) / max(1.0, uRes.x);
  float r1 = (uS1.z * 1.6 + 0.4) / max(1.0, uRes.x);
  float a = smoothstep(r0, r0 * 0.2, d0) * uS0.w
          + smoothstep(r1, r1 * 0.2, d1) * uS1.w;
  gl_FragColor = vec4(vec3(0.95, 0.97, 1.0) * a, a);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('sky shader: ' + (gl.getShaderInfoLog(sh) || ''));
  return sh;
}

function program(gl: WebGLRenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('sky link: ' + (gl.getProgramInfoLog(p) || ''));
  return p;
}

export class SkyRenderer {
  private gl: WebGLRenderingContext;
  private pSky: WebGLProgram;
  private pStar: WebGLProgram;
  private buf: WebGLBuffer | null = null;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.pSky = program(gl, VS_QUAD, FS_SKY);
    this.pStar = program(gl, VS_QUAD, FS_STAR);
  }

  private quad(): void {
    const gl = this.gl;
    if (!this.buf) this.buf = gl.createBuffer();
    const b = this.buf;
    if (!b) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 0, 0, 0.5, 0.5, 1, -1, 0.5, 0.5, 0.5, 1, -1, 0.5]), gl.STATIC_DRAW);
    const aP = gl.getAttribLocation(this.cur(), 'aP');
    if (aP >= 0) { gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 20, 0); }
    const aC = gl.getAttribLocation(this.cur(), 'aC');
    if (aC >= 0) { gl.enableVertexAttribArray(aC); gl.vertexAttribPointer(aC, 3, gl.FLOAT, false, 20, 8); }
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    if (aP >= 0) gl.disableVertexAttribArray(aP);
    if (aC >= 0) gl.disableVertexAttribArray(aC);
  }

  private cur(): WebGLProgram { return this.lastP || this.pSky; }
  private lastP: WebGLProgram | null = null;

  /** Paint the vertical sky gradient (call with depth mask off). */
  drawSky(dn: DayNight, w: number, h: number): void {
    const gl = this.gl;
    this.lastP = this.pSky;
    gl.useProgram(this.pSky);
    const uTop = gl.getUniformLocation(this.pSky, 'uTop');
    const uHor = gl.getUniformLocation(this.pSky, 'uHor');
    const uRes = gl.getUniformLocation(this.pSky, 'uRes');
    if (uTop) gl.uniform3f(uTop, dn.skyTop.r / 255, dn.skyTop.g / 255, dn.skyTop.b / 255);
    if (uHor) gl.uniform3f(uHor, dn.horizon.r / 255, dn.horizon.g / 255, dn.horizon.b / 255);
    if (uRes) gl.uniform2f(uRes, w, h);
    this.quad();
  }

  /** Paint up to two stars per call; advance i by 2. Returns new index. */
  drawStars(dn: DayNight, w: number, h: number, i: number): number {
    if (dn.nightAmount <= 0.02) return i;
    const gl = this.gl;
    if (i + 1 >= STARS) return i;
    this.lastP = this.pStar;
    gl.useProgram(this.pStar);
    const uRes = gl.getUniformLocation(this.pStar, 'uRes');
    if (uRes) gl.uniform2f(uRes, w, h);
    const tw = 0.55 + 0.45 * Math.sin(dn.time * 2.1 + starField[i * 4 + 3] * 6.28);
    const a = dn.nightAmount * tw;
    const s0a = starField[i * 4] / w, s0b = starField[i * 4 + 1] / h;
    const s1a = starField[(i + 1) * 4] / w, s1b = starField[(i + 1) * 4 + 1] / h;
    const uS0 = gl.getUniformLocation(this.pStar, 'uS0');
    const uS1 = gl.getUniformLocation(this.pStar, 'uS1');
    if (uS0) gl.uniform4f(uS0, s0a, s0b, starField[i * 4 + 2], a);
    if (uS1) gl.uniform4f(uS1, s1a, s1b, starField[(i + 1) * 4 + 2], a);
    this.quad();
    return i + 2;
  }

  dispose(): void {
    const gl = this.gl;
    if (this.buf) gl.deleteBuffer(this.buf);
  }
}

/** Project a world direction to screen NDC center (x,y in -1..1) using viewRot+proj. */
export function dirToScreen(
  proj: Float32Array, viewRot: Float32Array, d: [number, number, number]
): { x: number; y: number } | null {
  // viewRot * dir (point at infinity): translation rows are zero for rotation.
  const x = d[0], y = d[1], z = d[2];
  const vx = viewRot[0] * x + viewRot[4] * y + viewRot[8] * z;
  const vy = viewRot[1] * x + viewRot[5] * y + viewRot[9] * z;
  const vz = viewRot[2] * x + viewRot[6] * y + viewRot[10] * z;
  if (vz >= -0.02) return null; // behind / too close to horizon
  const wx = proj[0] * vx + proj[4] * vy + proj[8] * vz;
  const wy = proj[1] * vx + proj[5] * vy + proj[9] * vz;
  const ww = proj[3] * vx + proj[7] * vy + proj[11] * vz;
  if (ww === 0) return null;
  const cx = wx / ww, cy = wy / ww;
  if (cx < -1.3 || cx > 1.3 || cy < -1.3 || cy > 1.3) return null;
  return { x: cx, y: cy };
}

/** Small warm/cool disk (sun or moon) at a screen position. */
export function drawOrb(
  gl: WebGLRenderingContext, prog: WebGLProgram, uSP: WebGLUniformLocation | null,
  uR: WebGLUniformLocation | null, uRes: WebGLUniformLocation | null,
  aP: number, w: number, h: number, cxNdc: number, cyNdc: number, color: RGB, radiusPx: number
): void {
  // Reuse a shared quad buffer via a tiny inline path.
  gl.useProgram(prog);
  if (uRes) gl.uniform2f(uRes, w, h);
  if (uSP) gl.uniform2f(uSP, (cxNdc * 0.5 + 0.5) * w, (cyNdc * 0.5 + 0.5) * h);
  if (uR) gl.uniform1f(uR, radiusPx);
  const buf = gl.createBuffer();
  if (!buf) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, color.r / 255, color.g / 255, color.b / 255,
    0.5, 0.5, color.r / 255, color.g / 255, color.b / 255,
    -1, 0.5, color.r / 255, color.g / 255, color.b / 255,
    0.5, -1, color.r / 255, color.g / 255, color.b / 255]), gl.STATIC_DRAW);
  if (aP >= 0) { gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 20, 0); }
  const aC = gl.getAttribLocation(prog, 'aC');
  if (aC >= 0) { gl.enableVertexAttribArray(aC); gl.vertexAttribPointer(aC, 3, gl.FLOAT, false, 20, 8); }
  gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
  if (aP >= 0) gl.disableVertexAttribArray(aP);
  if (aC >= 0) gl.disableVertexAttribArray(aC);
  gl.deleteBuffer(buf);
}

export const FS_ORB = `
precision mediump float;
varying vec3 vC;
uniform vec2 uSP; uniform vec2 uRes; uniform float uR;
void main() {
  vec2 d = (gl_FragCoord.xy - uSP) / max(1.0, uRes.x);
  float a = smoothstep(uR, 0.0, length(d)) * 0.9;
  gl_FragColor = vec4(vC * a, a);
}
`;

export function makeOrbProgram(gl: WebGLRenderingContext): { prog: WebGLProgram; uSP: WebGLUniformLocation | null; uR: WebGLUniformLocation | null; uRes: WebGLUniformLocation | null; aP: number } {
  const prog = program(gl, VS_QUAD, FS_ORB);
  return {
    prog,
    uSP: gl.getUniformLocation(prog, 'uSP'),
    uR: gl.getUniformLocation(prog, 'uR'),
    uRes: gl.getUniformLocation(prog, 'uRes'),
    aP: gl.getAttribLocation(prog, 'aP'),
  };
}
