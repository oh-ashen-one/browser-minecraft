/**
 * CUBELAND — engine bootstrap.
 * Boots the WebGL render loop: golden-hour desert sky, chunked voxel world
 * (mesa strata + cacti), first-person Player with pointer-lock mouse-look,
 * WASD + Space jump + gravity. E toggles a real inventory grid with shape
 * crafting (InvModel, driven from the loop). Sets window.__CUBELAND_READY__
 * once the first frame is live so index.html hides its boot canvas.
 */
import { World } from './world';
import { Player } from './player';
import { itemIcon, itemName } from './blocks';
import { InvModel } from './inventory';
import { makeHud, makeInvUi } from './hud';

declare global {
  interface Window { __CUBELAND_READY__?: boolean; }
}

// ---------------- palette (design bible) ------------------------------------
const SKY_TOP_DAY: [number, number, number] = [127, 200, 196];   // #7FC8C4 teal
const SKY_HOR: [number, number, number] = [244, 216, 168];       // #F4D8A8 pale sand

// ---------------- maths ------------------------------------------------------
function mul(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    o[c * 4]     = a[0] * b0 + a[4] * b1 + a[8]  * b2 + a[12] * b3;
    o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9]  * b2 + a[13] * b3;
    o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    o[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return o;
}

function translate(x: number, y: number, z: number): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
}

function rotX(a: number): Float32Array {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}

function rotY(a: number): Float32Array {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}

function perspective(fovy: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovy / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect; m[5] = f; m[10] = (far + near) / (near - far); m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

// ---------------- WebGL helpers ---------------------------------------------
function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('shader: ' + (gl.getShaderInfoLog(sh) || ''));
  return sh;
}

function program(gl: WebGLRenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + (gl.getProgramInfoLog(p) || ''));
  return p;
}

function drawQuad(gl: WebGLRenderingContext, prog: WebGLProgram): void {
  const buf = gl.createBuffer();
  if (!buf) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0.5, 0.5, 0.5, 1, -1, 0.5, 0.5, 0.5, 1, 1, 0.5, 0.5, 0.5, -1, 1, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aP');
  const aCol = gl.getAttribLocation(prog, 'aC');
  if (aPos >= 0) { gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 20, 0); }
  if (aCol >= 0) { gl.enableVertexAttribArray(aCol); gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 20, 8); }
  gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
  if (aPos >= 0) gl.disableVertexAttribArray(aPos);
  if (aCol >= 0) gl.disableVertexAttribArray(aCol);
  gl.deleteBuffer(buf);
}

// ---------------- shaders ----------------------------------------------------
const VS_WORLD = `
attribute vec3 aP; attribute vec3 aN; attribute vec3 aC;
uniform mat4 uMVP;
varying vec3 vC; varying float vD;
void main() { gl_Position = uMVP * vec4(aP, 1.0); vC = aC; vD = gl_Position.w; }
`;

const FS_WORLD = `
precision mediump float;
varying vec3 vC; varying float vD;
uniform vec3 uFog; uniform float uFnear; uniform float uFfar;
void main() {
  float f = clamp((vD - uFnear) / (uFfar - uFnear), 0.0, 1.0);
  f = f * f;
  gl_FragColor = vec4(mix(vC, uFog, f), 1.0);
}
`;

const VS_QUAD = `
attribute vec2 aP; attribute vec3 aC;
varying vec3 vC;
void main() { gl_Position = vec4(aP, 0.0, 1.0); vC = aC; }
`;

const FS_SUN = `
precision mediump float;
varying vec3 vC;
uniform vec2 uSP; uniform vec2 uRes; uniform float uR;
void main() {
  vec2 d = (gl_FragCoord.xy - uSP) / uRes;
  float a = smoothstep(uR, 0.0, length(d)) * 0.85;
  gl_FragColor = vec4(vC * a, a);
}
`;

// ---------------- game -------------------------------------------------------
const GRAVITY = 24;        // blocks/s^2 (design bible)
const JUMP_V = 8.4;        // ~1.25 block jump
const WALK_SPEED = 4.6;
const SENS = 0.0023;
const EYE = 1.62;
const PRAD = 0.3;

function boot(): void {
  const glcEl = document.getElementById('gl') as HTMLCanvasElement | null;
  if (!glcEl) return;
  const glc = glcEl;

  let ctx: WebGLRenderingContext | null =
    (glc.getContext('webgl', { antialias: false }) as WebGLRenderingContext | null) ||
    (glc.getContext('experimental-webgl') as unknown as WebGLRenderingContext | null);
  if (!ctx) { console.error('CUBELAND: WebGL unavailable'); return; }
  const gl = ctx;

  const world = new World(1337);
  const player = new Player();

  let sp: { x: number; y: number; z: number };
  try { sp = world.spawn(); } catch (_e) { sp = { x: 8.5, y: 34.05, z: 8.5 }; }
  player.x = sp.x; player.y = sp.y + EYE; player.z = sp.z;
  player.yaw = Math.PI * 0.75;   // face out over the mesas
  player.pitch = -0.12;

  const inv = new InvModel();      // inventory model, driven from the loop
  // Icon contract: itemIcon(id) returns a NUMBER (color). Draw it into a
  // local canvas and hand the CANVAS to the HUD. Never assign the number
  // to an HTMLCanvasElement.
  const iconDraw = (id: number, size: number): HTMLCanvasElement => {
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const c2 = cv.getContext('2d');
    if (c2) {
      let col: string | null = null;
      try { const n = itemIcon(id); if (typeof n === 'number') col = '#' + (n >>> 0).toString(16).padStart(8, '0'); } catch (_e) { /* fall back */ }
      if (!col) col = id % 2 ? '#C48A4E' : '#6E5F55';
      c2.fillStyle = col;
      c2.fillRect(0, 0, size, size);
    }
    return cv;
  };
  const hud = makeHud(iconDraw);
  const invUi = makeInvUi(inv, iconDraw);

  const keys: Record<string, boolean> = {};
  let locked = false;
  let ready = false;
  let inventoryOpen = false;

  // ---- shaders / programs ---------------------------------------------------
  const pWorld = program(gl, VS_WORLD, FS_WORLD);
  const uMVPw = gl.getUniformLocation(pWorld, 'uMVP');
  const uFogc = gl.getUniformLocation(pWorld, 'uFog');
  const uFnear = gl.getUniformLocation(pWorld, 'uFnear');
  const uFfar = gl.getUniformLocation(pWorld, 'uFfar');
  const aPw = gl.getAttribLocation(pWorld, 'aP');
  const aNw = gl.getAttribLocation(pWorld, 'aN');
  const aCw = gl.getAttribLocation(pWorld, 'aC');

  const pSky = program(gl, VS_QUAD, `
    precision mediump float; varying vec3 vC; uniform vec2 uRes;
    void main() {
      float y = (gl_FragCoord.y / uRes.y);
      vec3 top = ${JSON.stringify(SKY_TOP_DAY)};
      vec3 hor = ${JSON.stringify(SKY_HOR)};
      gl_FragColor = vec4(mix(hor, top, pow(y, 0.85)), 1.0);
    }`);
  const uResSky = gl.getUniformLocation(pSky, 'uRes');

  const pSun = program(gl, VS_QUAD, FS_SUN);
  const uResSun = gl.getUniformLocation(pSun, 'uRes');
  const uSP = gl.getUniformLocation(pSun, 'uSP');
  const uR = gl.getUniformLocation(pSun, 'uR');

  // Chunk buffers: one interleaved VBO per chunk (x,y,z, nx,ny,nz, r,g,b).
  const glBufs = new Map<string, WebGLBuffer | undefined>();

  function uploadChunk(cx: number, cz: number): void {
    const k = cx + ',' + cz;
    let b = glBufs.get(k);
    if (!b) { const nb = gl.createBuffer(); if (!nb) return; b = nb; glBufs.set(k, nb); }
    const data = world.meshData(cx, cz);
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    if (data.length) gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  }

  // ---- input -----------------------------------------------------------------
  function toggleInventory(): void {
    if (inventoryOpen) closeInventory(); else openInventory();
  }

  function openInventory(): void {
    if (inventoryOpen) return;
    inventoryOpen = true;
    document.exitPointerLock();
    invUi.setOpen(true);
  }

  function closeInventory(): void {
    if (!inventoryOpen) return;
    inventoryOpen = false;
    inv.absorbBench();   // bench stacks return to the grid before closing
    invUi.setOpen(false);
  }

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
    // E toggles the inventory grid.
    if (e.code === 'KeyE') { e.preventDefault(); toggleInventory(); return; }
    // Escape closes the inventory.
    if (e.code === 'Escape' && inventoryOpen) { e.preventDefault(); closeInventory(); return; }
    // Hotbar select 1-9.
    if (e.code >= 'Digit1' && e.code <= 'Digit9') { inv.sel = parseInt(e.code.slice(5), 10) - 1; }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  glc.addEventListener('click', () => { if (!locked && !inventoryOpen) glc.requestPointerLock(); });

  document.addEventListener('pointerlockchange', () => { locked = (document.pointerLockElement === glc); });

  document.addEventListener('mousemove', (e) => {
    if (!locked || inventoryOpen) return;
    player.yaw -= e.movementX * SENS;
    player.pitch -= e.movementY * SENS;
    const lim = Math.PI / 2 - 0.01;
    if (player.pitch > lim) player.pitch = lim;
    if (player.pitch < -lim) player.pitch = -lim;
  });

  // ---- resize -----------------------------------------------------------------
  function fit(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    glc.width = Math.max(2, Math.floor(window.innerWidth * dpr));
    glc.height = Math.max(2, Math.floor(window.innerHeight * dpr));
  }
  window.addEventListener('resize', fit);
  fit();

  // ---- physics -----------------------------------------------------------------
  function collideAxis(p: Player, axis: 'x' | 'y' | 'z', delta: number): void {
    if (delta === 0) return;
    const nx = p.x + (axis === 'x' ? delta : 0);
    const ny = p.y + (axis === 'y' ? delta : 0);
    const nz = p.z + (axis === 'z' ? delta : 0);

    const x0 = Math.floor(nx - PRAD), x1 = Math.floor(nx + PRAD);
    const y0 = Math.floor(ny - EYE), y1 = Math.floor(ny);
    const z0 = Math.floor(nz - PRAD), z1 = Math.floor(nz + PRAD);

    for (let bx = x0; bx <= x1; bx++) {
      for (let by = y0; by <= y1; by++) {
        for (let bz = z0; bz <= z1; bz++) {
          if (!world.isSolid(bx, by, bz)) continue;
          if (axis === 'y') {
            if (delta < 0) { p.y = by + 1; p.vy = 0; p.onGround = true; }
            else { p.y = by - EYE - 0.001; p.vy = 0; }
          } else if (axis === 'x') {
            p.x = delta > 0 ? bx - PRAD - 0.001 : bx + 1 + PRAD + 0.001;
            p.vx = 0;
          } else {
            p.z = delta > 0 ? bz - PRAD - 0.001 : bz + 1 + PRAD + 0.001;
            p.vz = 0;
          }
          return;
        }
      }
    }
    p.x = nx; p.y = ny; p.z = nz;
  }

  function stepPlayer(dt: number): void {
    if (inventoryOpen) return; // freeze the world while the grid is open

    const fwdX = -Math.sin(player.yaw), fwdZ = -Math.cos(player.yaw);
    const rgtX = Math.cos(player.yaw), rgtZ = -Math.sin(player.yaw);

    let mx = 0, mz = 0;
    if (keys['KeyW']) { mx += fwdX; mz += fwdZ; }
    if (keys['KeyS']) { mx -= fwdX; mz -= fwdZ; }
    if (keys['KeyD']) { mx += rgtX; mz += rgtZ; }
    if (keys['KeyA']) { mx -= rgtX; mz -= rgtZ; }
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx = (mx / len) * WALK_SPEED; mz = (mz / len) * WALK_SPEED; }

    player.vx = mx;
    player.vz = mz;
    player.onGround = false;

    if (keys['Space'] && world.isSolid(Math.floor(player.x), Math.floor(player.y - EYE), Math.floor(player.z))) {
      player.vy = JUMP_V;
    }

    player.vy -= GRAVITY * dt;   // gravity + terminal fall clamp
    if (player.vy < -40) player.vy = -40;

    collideAxis(player, 'x', player.vx * dt);
    collideAxis(player, 'z', player.vz * dt);
    collideAxis(player, 'y', player.vy * dt);

    // Safety net: never fall out of the world.
    if (player.y < -20) {
      const s = world.surfaceY(Math.floor(player.x), Math.floor(player.z));
      if (s >= 0) { player.y = s + 2; player.vy = 0; }
      else { player.x = sp.x; player.y = sp.y + EYE; player.z = sp.z; player.vy = 0; }
    }
  }

  // ---- render -------------------------------------------------------------------
  function drawWorld(mat: Float32Array): void {
    gl.useProgram(pWorld);
    if (uMVPw) gl.uniformMatrix4fv(uMVPw, false, mat);
    if (uFogc) gl.uniform3f(uFogc, SKY_HOR[0] / 255, SKY_HOR[1] / 255, SKY_HOR[2] / 255);
    if (uFnear) gl.uniform1f(uFnear, 60);
    if (uFfar) gl.uniform1f(uFfar, 128);

    for (const [k] of glBufs) {
      const b = glBufs.get(k);
      if (!b) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      const size = gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE);
      if (!size) continue;

      const count = size / 36;
      if (aPw >= 0) { gl.enableVertexAttribArray(aPw); gl.vertexAttribPointer(aPw, 3, gl.FLOAT, false, 36, 0); }
      if (aNw >= 0) { gl.enableVertexAttribArray(aNw); gl.vertexAttribPointer(aNw, 3, gl.FLOAT, false, 36, 12); }
      if (aCw >= 0) { gl.enableVertexAttribArray(aCw); gl.vertexAttribPointer(aCw, 3, gl.FLOAT, false, 36, 24); }
      gl.drawArrays(gl.TRIANGLES, 0, count);

      if (aPw >= 0) gl.disableVertexAttribArray(aPw);
      if (aNw >= 0) gl.disableVertexAttribArray(aNw);
      if (aCw >= 0) gl.disableVertexAttribArray(aCw);
    }
  }

  function drawSky(proj: Float32Array, viewRot: Float32Array): void {
    const mvp = mul(proj, viewRot); // (kept: matrix path identical to before)
    gl.useProgram(pSky);
    if (uResSky) gl.uniform2f(uResSky, glc.width, glc.height);
    drawQuad(gl, pSky);
  }

  function drawSun(proj: Float32Array, viewRot: Float32Array): void {
    // Sun fixed in world space, low over the mesas (golden hour).
    const wx = 140, wy = 58, wz = -90;
    const view = mul(viewRot, translate(-player.x, -(player.y - EYE), -player.z));
    const vp = mul(proj, view);
    const cx = (vp[0] * wx + vp[4] * wy + vp[8] * wz + vp[12]) / (vp[3] * wx + vp[7] * wy + vp[11] * wz + vp[15]);
    const cy = (vp[5] * wx + vp[9] * wy + vp[13] * wz + vp[15]) / (vp[3] * wx + vp[7] * wy + vp[11] * wz + vp[15]);
    if (cx < -2 || cx > 2 || cy < -2 || cy > 2) return; // behind camera
    gl.useProgram(pSun);
    if (uResSun) gl.uniform2f(uResSun, glc.width, glc.height);
    if (uSP) gl.uniform2f(uSP, (cx * 0.5 + 0.5) * glc.width, (cy * 0.5 + 0.5) * glc.height);
    if (uR) gl.uniform1f(uR, Math.min(glc.width, glc.height) * 0.34);
    drawQuad(gl, pSun);
  }

  // ---- main loop -------------------------------------------------------------------
  let last = performance.now();
  let fpsT = last, fpsN = 0;

  function frame(now: number): void {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;

    // InvModel is driven from the loop: re-resolve the craft result each frame
    // so the output slot stays live as the bench changes.
    if (inventoryOpen) invUi.sync(inv);

    stepPlayer(dt);

    // Keep the chunk ring around the player built + meshed.
    let dirty: { cx: number; cz: number }[] = [];
    try { dirty = world.sync(player.x, player.z); } catch (_e) { dirty = []; }
    for (const m of dirty) uploadChunk(m.cx, m.cz);

    // Drop buffers that left the view ring.
    const pcx = Math.floor(player.x / 16), pcz = Math.floor(player.z / 16);
    for (const [k, b] of glBufs) {
      const parts = k.split(',');
      if (Math.abs(parseInt(parts[0], 10) - pcx) > 8 || Math.abs(parseInt(parts[1], 10) - pcz) > 8) {
        if (b) gl.deleteBuffer(b);
        glBufs.delete(k);
      }
    }

    // Camera matrices: FOV 75 (design bible).
    const aspect = glc.width / Math.max(1, glc.height);
    const proj = perspective((75 * Math.PI) / 180, aspect, 0.1, 400);
    const eyeY = player.y - EYE;
    const viewRot = mul(rotX(player.pitch), rotY(-player.yaw));
    const view = mul(viewRot, translate(-player.x, -eyeY, -player.z));
    const mvp = mul(proj, view);

    gl.viewport(0, 0, glc.width, glc.height);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);

    // Sky + sun (depth write off, drawn first).
    gl.depthMask(false);
    drawSky(proj, viewRot);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    drawSun(proj, viewRot);
    gl.disable(gl.BLEND);
    gl.depthMask(true);

    drawWorld(mvp);

    // HUD: hotbar mirrors the first nine inventory slots; held-item name.
    hud.setSlots(inv.hotbarView());
    const held = inv.slots[inv.sel];
    if (held) hud.toast(itemName(held.id), 1);

    fpsN++;
    if (now - fpsT > 500) {
      const fps = Math.round((fpsN * 1000) / (now - fpsT));
      fpsT = now; fpsN = 0;
      const dbg = document.getElementById('debug');
      if (dbg) {
        dbg.textContent =
          'CUBELAND  fps ' + fps + '\n' +
          'x ' + player.x.toFixed(1) + '  y ' + eyeY.toFixed(1) + '  z ' + player.z.toFixed(1) + '\n' +
          (inventoryOpen ? 'inventory open — E or Esc to close' : (locked ? 'pointer locked — WASD move · Space jump · E inventory' : 'click to capture the mouse'));
      }
    }

    // First live frame: signal the engine is ready so index.html hides bootCv.
    if (!ready) {
      ready = true;
      window.__CUBELAND_READY__ = true;
      const boot = document.getElementById('bootCv');
      if (boot) boot.remove();
    }
  }

  requestAnimationFrame(frame);
}

boot();
