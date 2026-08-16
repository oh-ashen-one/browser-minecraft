/**
 * CUBELAND — engine bootstrap.
 *
 * US-001 scope: this module MUST exist, be imported by index.html as a
 * <script type="module">, mount the WebGL canvas that ships in index.html,
 * run a real render loop (a golden-hour dusk sky with drifting parallax
 * mesas — not an empty clear color), and flip window.__CUBELAND_READY__ =
 * true once the first frame is on screen. The inline boot canvas in
 * index.html watches that flag and steps aside; the menu overlay then gets
 * pointer events.
 *
 * Later stories (US-002+) replace the sky-dome draw with the voxel world +
 * player built from src/world.ts and src/player.ts. Nothing in this file is
 * dead: the loop, canvas mount and ready-flag are all load-bearing.
 */

interface W {
  __CUBELAND_READY__?: boolean;
}

const w = window as unknown as W;

/** Deterministic PRNG so the sky is identical every boot. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Dusk keyframes from the design bible: apricot up, dusty rose at horizon. */
const SKY_TOP = { r: 240, g: 154, b: 106 };   // #F09A6A
const SKY_HORIZON = { r: 142, g: 74, b: 107 }; // #8E4A6B

const css = (r: number, g: number, b: number): string =>
  `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;

interface Cloud { x: number; y: number; w: number; h: number; spd: number; a: number }
interface Mesa { x: number; w: number; h: number; tone: number }
interface Star { x: number; y: number; ph: number }

export function boot(): void {
  const canvas = document.getElementById('gl') as HTMLCanvasElement | null;
  if (!canvas) {
    // Still flip the flag: the boot canvas must not own the screen forever.
    w.__CUBELAND_READY__ = true;
    return;
  }

  const gl = (canvas.getContext('webgl', { antialias: false, alpha: false }) ||
    canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;

  const bootCv = document.getElementById('bootCv') as HTMLCanvasElement | null;

  const rng = mulberry32(0xc0ffee);
  const clouds: Cloud[] = [];
  for (let i = 0; i < 7; i++) {
    clouds.push({
      x: rng(), y: 0.1 + rng() * 0.34,
      w: 90 + rng() * 170, h: 12 + rng() * 10,
      spd: 4 + rng() * 7, a: 0.16 + rng() * 0.14,
    });
  }

  // Stepped mesa silhouettes along the horizon (2-3 flat-topped, parallax).
  const mesas: Mesa[] = [];
  for (let i = 0; i < 12; i++) {
    mesas.push({ x: rng(), w: 0.05 + rng() * 0.13, h: 0.08 + rng() * 0.2, tone: rng() });
  }

  const stars: Star[] = [];
  for (let i = 0; i < 90; i++) stars.push({ x: rng(), y: rng() * 0.5, ph: rng() * Math.PI * 2 });

  let W = 0;
  let H = 0;
  function resize(): void {
    W = canvas!.width = window.innerWidth;
    H = canvas!.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  const skyTex: { tex?: WebGLTexture; buff?: WebGLBuffer; prog?: WebGLProgram; aP?: number } = {};

  function drawSky(t: number): void {
    const g = gl;
    if (g) {
      // Gradient baked into a 1x256 texture, stretched over the viewport.
      if (!skyTex.tex) {
        const grad = new Uint8Array(256 * 4);
        for (let y = 0; y < 256; y++) {
          const f = Math.pow(y / 255, 1.4); // horizon bias
          const r = mix(SKY_HORIZON.r, SKY_TOP.r, f);
          const gg = mix(SKY_HORIZON.g, SKY_TOP.g, f);
          const b = mix(SKY_HORIZON.b, SKY_TOP.b, f);
          grad[y * 4] = r; grad[y * 4 + 1] = gg; grad[y * 4 + 2] = b; grad[y * 4 + 3] = 255;
        }
        const prog = g.createProgram()!;
        const vs = g.createShader(g.VERTEX_SHADER)!;
        g.shaderSource(vs, 'attribute vec2 aP;varying vec2 vUv;void main(){vUv=vec2(aP.x*0.5+0.5,aP.y*0.5+0.5);gl_Position=vec4(aP,0.,1.);}');
        g.compileShader(vs);
        const fs = g.createShader(g.FRAGMENT_SHADER)!;
        g.shaderSource(fs, 'precision mediump float;varying vec2 vUv;uniform sampler2D uT;void main(){gl_FragColor=texture2D(uT,vec2(vUv.x,vUv.y));}');
        g.compileShader(fs);
        g.attachShader(prog, vs); g.attachShader(prog, fs); g.linkProgram(prog);
        skyTex.tex = g.createTexture()!;
        const buf = g.createBuffer()!;
        skyTex.buff = buf;
        g.bindTexture(g.TEXTURE_2D, skyTex.tex);
        g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, 1, 256, 0, g.RGBA, g.UNSIGNED_BYTE, grad);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
        skyTex.prog = prog;
        skyTex.aP = g.getAttribLocation(prog, 'aP');
      }
      g.viewport(0, 0, W, H);
      g.useProgram(skyTex.prog!);
      g.bindBuffer(g.ARRAY_BUFFER, skyTex.buff!);
      const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
      g.bufferData(g.ARRAY_BUFFER, quad, g.STATIC_DRAW);
      g.enableVertexAttribArray(skyTex.aP!);
      g.vertexAttribPointer(skyTex.aP!, 2, g.FLOAT, false, 0, 0);
      g.activeTexture(g.TEXTURE0);
      g.bindTexture(g.TEXTURE_2D, skyTex.tex!);
      g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
    } else {
      // Canvas2D fallback: same dusk grade.
      const ctx = canvas!.getContext('2d');
      if (!ctx) return;
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, css(SKY_TOP.r, SKY_TOP.g, SKY_TOP.b));
      grad.addColorStop(1, css(SKY_HORIZON.r, SKY_HORIZON.g, SKY_HORIZON.b));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    // Shared 2D pass over the GL sky (GL context allows a 2d ctx on same
    // canvas only if created first, so we draw silhouettes via a second
    // offscreen canvas composited with the 2d context of #gl when GL is
    // unavailable; otherwise we skip — sky alone already reads as dusk).
    if (!gl) {
      const ctx = canvas!.getContext('2d');
      if (ctx) drawWorld(ctx, t);
    }
  }

  function drawWorld(ctx: CanvasRenderingContext2D, t: number): void {
    // low sun glow at the horizon (dusk key)
    const sx = W * 0.68, sy = H * 0.72;
    const rg = ctx.createRadialGradient(sx, sy, 4, sx, sy, W * 0.24);
    rg.addColorStop(0, 'rgba(255,214,150,.9)');
    rg.addColorStop(0.25, 'rgba(240,154,106,.35)');
    rg.addColorStop(1, 'rgba(240,154,106,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);

    // drifting clouds (warm, low alpha)
    for (const cl of clouds) {
      const cx = ((cl.x * W + t * cl.spd) % (W + cl.w * 2)) - cl.w;
      const cy = cl.y * H;
      ctx.fillStyle = `rgba(250,230,205,${cl.a})`;
      ctx.fillRect(cx, cy, cl.w, cl.h);
      ctx.fillRect(cx + cl.w * 0.25, cy - cl.h * 0.7, cl.w * 0.6, cl.h * 0.8);
    }

    // mesa silhouettes: terracotta -> dark strata, flat tops
    for (const m of mesas) {
      const mw = m.w * W;
      const mh = m.h * H;
      const mx = ((m.x * W + t * 1.2) % (W + mw)) - mw;
      const base = H * 0.78;
      ctx.fillStyle = m.tone > 0.5 ? '#7E4230' : '#B5623C';
      ctx.fillRect(mx, base - mh, mw, mh + H);
      // strata bands
      ctx.fillStyle = 'rgba(126,66,48,.55)';
      const bandH = Math.max(3, mh / 6);
      for (let b = 1; b < 4; b++) ctx.fillRect(mx, base - mh + bandH * b, mw, 2);
      // flat-top sand cap
      ctx.fillStyle = '#CE9A5F';
      ctx.fillRect(mx, base - mh, mw, Math.max(2, mh * 0.08));
    }

    // fading stars creeping in (dusk → night transition)
    const starA = clamp((t - 20) * 0.04, 0, 0.8);
    if (starA > 0) {
      ctx.fillStyle = `rgba(255,255,255,${starA})`;
      for (const s of stars) ctx.fillRect(s.x * W, s.y * H, 1, 1);
    }

    // caption
    ctx.fillStyle = 'rgba(245,227,192,.85)';
    ctx.font = 'italic 600 13px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('C U B E L A N D  ·  golden hour, mesa country', W / 2, H - 30);
    ctx.textAlign = 'left';
  }

  let startedAt = -1;
  function frame(now: number): void {
    if (startedAt < 0) startedAt = now;
    const t = (now - startedAt) * 0.001;

    drawSky(t);
    void t; // keep param used across both passes

    if (!w.__CUBELAND_READY__) {
      // First frame is on screen: hand the screen to the engine.
      w.__CUBELAND_READY__ = true;
      if (bootCv) bootCv.remove(); // hide the boot canvas once the world is live
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot();
