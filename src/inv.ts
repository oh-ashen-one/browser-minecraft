/**
 * CUBELAND — inventory + crafting UI (US-004).
 * Extracted from hud.ts: InvView class with its craft method, the recipe grid,
 * and the E-toggle wiring surface. DUSK styling per the design bible.
 */

export interface Stack { id: number; n: number }

/** Canonical icon signature — the ONLY shape inv.ts and main.ts agree on.
 *  The function creates a canvas, draws the block color, and RETURNS THE CANVAS. */
export type IconFn = (id: number, size: number) => HTMLCanvasElement;

/** Minimal view of the inventory model that the UI needs. */
export interface InvView {
  slots: (Stack | null)[];
  bench: (Stack | null)[];
  sel: number;
}

/** Full model shape the UI drives (InvModel from inventory.ts implements it). */
export interface InvCtrl extends InvView {
  add(id: number, n: number): void;
}

interface Recipe { out: number; n: number; need: [number, number][] }
const MAXSTACK = 64;

/** Crafting recipes (shape matters, position does not). */
export const RECIPES: Recipe[] = [
  { out: 10, n: 4, need: [[2, 2]] },            // 2 LOG -> 4 PLANKS
  { out: 100, n: 4, need: [[10, 2]] },          // 2 PLANKS -> 4 STICKS
  { out: 101, n: 1, need: [[10, 4]] },          // 2x2 PLANKS -> CRAFTING TABLE
  { out: 102, n: 1, need: [[3, 3], [100, 2]] }, // stone + sticks -> PICK
  { out: 103, n: 1, need: [[10, 3], [100, 2]] },// planks + sticks -> AXE
  { out: 104, n: 1, need: [[3, 2], [100, 2]] }, // stone + sticks -> SHOVEL
  { out: 105, n: 4, need: [[4, 1], [10, 1]] },  // COAL + PLANKS -> 4 TORCHES
];

function idOf(key: string, fb: number): number {
  const r = (globalThis as unknown as Record<string, unknown>)['__CUBELAND_B__'];
  if (r && typeof r === 'object') { const v = (r as Record<string, unknown>)[key]; if (typeof v === 'number') return v; }
  return fb;
}

/** Always returns the canvas it draws (never a number). */
export function iconFor(id: number, size: number, custom?: IconFn): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const c2 = cv.getContext('2d');
  if (c2) {
    try {
      let src: HTMLCanvasElement | null = null;
      if (custom) src = custom(id, size);
      else { const n = (window as unknown as Record<string, unknown>)['__CUBELAND_ICON__']; if (typeof n === 'function') { const r = (n as IconFn)(id, size); if (r instanceof HTMLCanvasElement) src = r; } }
      if (!src) { c2.fillStyle = id % 2 ? '#C48A4E' : '#6E5F55'; c2.fillRect(0, 0, size, size); }
      else { c2.clearRect(0, 0, size, size); c2.drawImage(src, 0, 0, size, size); }
    } catch (_e) { /* fall through */ }
  }
  return cv;
}

function itemName(id: number): string {
  try {
    const n = (window as unknown as Record<string, unknown>)['__CUBELAND_NAME__'];
    if (typeof n === 'function') { const r = (n as (i: number) => string)(id); if (r) return r; }
  } catch (_e) { /* ignore */ }
  return 'ITEM ' + id;
}

/** Full inventory/crafting model: slots, bench, sel + its own craft method. */
export class InvModel {
  slots: (Stack | null)[];
  bench: (Stack | null)[] = new Array(9).fill(null);
  sel = 0;

  constructor() { this.slots = new Array(27).fill(null); }

  add(id: number, n: number): void {
    for (let i = 0; i < this.slots.length; i++) { const s = this.slots[i]; if (s && s.id === id && s.n < MAXSTACK) { const t = Math.min(n, MAXSTACK - s.n); s.n += t; n -= t; if (n <= 0) return; } }
    for (let i = 0; i < this.slots.length; i++) { if (!this.slots[i]) { const t = Math.min(n, MAXSTACK); this.slots[i] = { id, n: t }; n -= t; if (n <= 0) return; } }
  }

  absorbBench(): void { for (let i = 0; i < this.bench.length; i++) { const s = this.bench[i]; if (s) { this.add(s.id, s.n); this.bench[i] = null; } } }

  hotbarView(): { id: number | null; n: number }[] {
    return this.slots.slice(0, 9).map((s) => (s ? { id: s.id, n: s.n } : { id: null, n: 0 }));
  }

  /** Resolve the bench against RECIPES; return the output stack or null. */
  craft(): { id: number; n: number } | null {
    const have = new Map<number, number>();
    for (const s of this.bench) if (s) have.set(s.id, (have.get(s.id) || 0) + s.n);
    for (const r of RECIPES) {
      let ok = true;
      for (const [id, need] of r.need) if ((have.get(id) || 0) < need) { ok = false; break; }
      if (!ok) continue;
      for (const [id, need] of r.need) { const left = have.get(id)! - need; if (left <= 0) have.delete(id); else have.set(id, left); }
      this.clearBench(have);
      return { id: r.out, n: r.n };
    }
    return null;
  }

  private clearBench(keep: Map<number, number>): void {
    for (let i = 0; i < this.bench.length; i++) { const s = this.bench[i]; if (!s) continue; const left = (keep.get(s.id) || 0); keep.set(s.id, Math.max(0, left - s.n)); this.bench[i] = null; }
    let i = 0;
    for (const [id, n] of keep) if (n > 0 && i < this.bench.length) { this.bench[i] = { id, n }; i++; }
  }

  /** Move a stack from the bench into the grid (first empty, then merge). */
  moveBench(i: number): void {
    const s = this.bench[i]; if (!s) return;
    for (let j = 0; j < this.slots.length; j++) { if (!this.slots[j]) { this.bench[i] = null; this.slots[j] = s; return; } }
    for (let j = 0; j < this.slots.length; j++) { const d = this.slots[j]; if (d && d.id === s.id) { const room = MAXSTACK - d.n; const t = Math.min(room, s.n); if (t > 0) { d.n += t; s.n -= t; } if (s.n <= 0) this.bench[i] = null; return; } }
  }

  /** Swap two stacks between the bench and the grid. */
  swap(a: 'bench' | 'slots', ai: number, b: 'bench' | 'slots', bi: number): void {
    const A = a === 'bench' ? this.bench : this.slots;
    const Bv = b === 'bench' ? this.bench : this.slots;
    if (A[ai] && Bv[bi] && A[ai].id === Bv[bi].id) {
      const room = Math.min(MAXSTACK - Bv[bi].n, A[ai].n);
      if (room > 0) { Bv[bi]!.n += room; A[ai]!.n -= room; if (A[ai]!.n <= 0) A[ai] = null; return; }
    }
    const tmp = A[ai]; A[ai] = Bv[bi]; Bv[bi] = tmp;
  }

  /** Right-click: take half (or one) of a stack into the grid. */
  takeHalf(from: 'bench' | 'slots', i: number): void {
    const src = from === 'bench' ? this.bench : this.slots;
    const s = src[i]; if (!s) return;
    const take = s.n > 1 ? Math.ceil(s.n / 2) : 1;
    for (let j = 0; j < this.slots.length; j++) {
      if (!this.slots[j]) { s.n -= take; if (s.n <= 0) src[i] = null; this.slots[j] = { id: s.id, n: take }; return; }
      if (this.slots[j]!.id === s.id) { const room = MAXSTACK - this.slots[j]!.n; const t = Math.min(room, take); if (t > 0) { this.slots[j]!.n += t; s.n -= t; if (s.n <= 0) src[i] = null; } return; }
    }
  }
}

/** Build the inventory/crafting overlay and wire it to an InvView/InvModel. */
export function makeInvUi(model: InvView, iconFn?: IconFn): { setOpen(o: boolean): void; sync(m: InvView, craftResult?: { id: number; n: number } | null): void } {
  const PLANKS_ID = idOf('PLANKS', 10);
  const STICK_ID = idOf('STICK', 100);

  const mount = document.createElement('div');
  mount.style.display = 'none';

  const back = document.createElement('div');
  back.className = 'inv-back';

  const panel = document.createElement('div');
  panel.className = 'inv-panel';

  const title = document.createElement('h2');
  title.className = 'inv-title';
  title.textContent = 'Inventory';
  panel.appendChild(title);

  const sub = document.createElement('p');
  sub.className = 'inv-sub';
  sub.textContent = 'craft bench · shape matters, position does not';
  panel.appendChild(sub);

  const craftWrap = document.createElement('div');
  craftWrap.className = 'craft-wrap';

  const cgrid = document.createElement('div');
  cgrid.className = 'cgrid';

  const arrow = document.createElement('span');
  arrow.className = 'craft-arrow';
  arrow.textContent = '\u2192';

  const outSlot = document.createElement('div');
  outSlot.className = 'slot cout';

  const benchEls: HTMLDivElement[] = [];
  for (let i = 0; i < 9; i++) benchEls.push(makeSlotEl(36, cgrid));
  craftWrap.appendChild(cgrid);
  craftWrap.appendChild(arrow);
  craftWrap.appendChild(outSlot);
  panel.appendChild(craftWrap);

  const divider = document.createElement('div');
  divider.className = 'inv-divider';
  panel.appendChild(divider);

  const mainInv = document.createElement('div');
  mainInv.className = 'maininv';
  const mainEls: HTMLDivElement[] = [];
  for (let i = 0; i < 27; i++) mainEls.push(makeSlotEl(30, mainInv));
  panel.appendChild(mainInv);

  const help = document.createElement('div');
  help.className = 'inv-help';
  help.innerHTML = '<b>E</b> close &middot; <b>LMB</b> move stack &middot; <b>RMB</b> one / half'
    + '<br><b>2 LOG</b>&rarr;4 PLANKS &middot; <b>2 PLANKS</b>&rarr;4 STICKS &middot; <b>2x2 PLANKS</b>&rarr;TABLE'
    + '<br><b>PICK / AXE / SHOVEL</b> head + stick &middot; <b>COAL + PLANKS</b>&rarr;4 TORCHES';
  panel.appendChild(help);

  back.appendChild(panel);
  mount.appendChild(back);
  document.body.appendChild(mount);

  function paintSlot(el: HTMLDivElement, s: Stack | null): void {
    const icon = el.querySelector('canvas.icon') as HTMLCanvasElement;
    const count = el.querySelector('.count');
    if (!icon) return;
    const c2 = icon.getContext('2d');
    if (c2) c2.clearRect(0, 0, icon.width, icon.height);
    if (!s) { if (count) count.textContent = ''; return; }
    const ic = iconFor(s.id, icon.width, iconFn);
    if (c2) c2.drawImage(ic, 0, 0);
    if (count) count.textContent = s.n > 1 ? String(s.n) : '';
  }

  function onSlotClick(from: 'bench' | 'slots', i: number): void {
    const st = model;
    if (st instanceof InvModel) {
      if (from === 'bench') st.moveBench(i);
      else for (let j = 0; j < 9; j++) { if (!st.bench[j]) { st.swap('slots', i, 'bench', j); return; } }
      return;
    }
    const stack = (from === 'bench' ? st.bench : st.slots)[i];
    if (!stack) return;
    for (let j = 0; j < st.slots.length; j++) { if (!st.slots[j]) { doSwap(st, from, i, 'slots', j); return; } }
    for (let j = 0; j < st.slots.length; j++) { const d = st.slots[j]; if (d && d.id === stack.id) { doSwap(st, from, i, 'slots', j); return; } }
    for (let j = 0; j < 9; j++) { if (!st.bench[j] && !(from === 'bench' && j === i)) { doSwap(st, from, i, 'bench', j); return; } }
  }

  function onSlotRight(from: 'bench' | 'slots', i: number): void {
    const st = model;
    if (st instanceof InvModel) { st.takeHalf(from, i); return; }
    const src = from === 'bench' ? st.bench : st.slots;
    const stack = src[i]; if (!stack) return;
    const take = stack.n > 1 ? Math.ceil(stack.n / 2) : 1;
    for (let j = 0; j < st.slots.length; j++) {
      if (!st.slots[j]) { src[i]!.n -= take; if (src[i]!.n <= 0) src[i] = null; st.slots[j] = { id: stack.id, n: take }; return; }
    }
  }

  for (let i = 0; i < 9; i++) {
    const el = benchEls[i];
    el.addEventListener('click', () => onSlotClick('bench', i));
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); onSlotRight('bench', i); });
  }
  for (let i = 0; i < 27; i++) {
    const el = mainEls[i];
    if (i < 9) el.classList.add('hb');
    el.addEventListener('click', () => onSlotClick('slots', i));
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); onSlotRight('slots', i); });
  }

  // Output click: call the model's own craft() (InvView has no craft member;
  // the real one lives on InvModel, so guard for it).
  outSlot.addEventListener('click', () => {
    const m = model as InvCtrl & { craft?: () => { id: number; n: number } | null };
    if (typeof m.craft !== 'function') return;
    const r = m.craft();
    if (r && typeof m.add === 'function') m.add(r.id, r.n);
  });

  let open = false;
  function setOpen(o: boolean): void {
    if (o === open) return;
    open = o;
    mount.style.display = o ? 'block' : 'none';
  }

  function sync(m: InvView, craftResult?: { id: number; n: number } | null): void {
    for (let i = 0; i < 9; i++) paintSlot(benchEls[i], m.bench[i]);
    for (let i = 0; i < 27; i++) { paintSlot(mainEls[i], m.slots[i]); mainEls[i].classList.toggle('sel', i < 9 && i === m.sel); }
    paintSlot(outSlot, craftResult ? { id: craftResult.id, n: craftResult.n } : null);
    outSlot.classList.toggle('can', !!craftResult);
  }

  // Starting kit so the bench is never empty: a few planks + sticks.
  const mc = model as InvCtrl;
  if (typeof mc.add === 'function') { mc.add(PLANKS_ID, 8); mc.add(STICK_ID, 4); }

  return { setOpen, sync };
}

function makeSlotEl(iconSize: number, parent: HTMLElement): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'slot';
  const icon = document.createElement('canvas');
  icon.className = 'icon';
  icon.width = iconSize; icon.height = iconSize;
  const count = document.createElement('span');
  count.className = 'count';
  el.appendChild(icon);
  el.appendChild(count);
  parent.appendChild(el);
  return el;
}

function doSwap(m: InvView, a: 'bench' | 'slots', ai: number, b: 'bench' | 'slots', bi: number): void {
  const A = a === 'bench' ? m.bench : m.slots;
  const Bv = b === 'bench' ? m.bench : m.slots;
  if (A[ai] && Bv[bi] && A[ai].id === Bv[bi].id) {
    const room = Math.min(MAXSTACK - Bv[bi].n, A[ai].n);
    if (room > 0) { Bv[bi]!.n += room; A[ai]!.n -= room; if (A[ai]!.n <= 0) A[ai] = null; return; }
  }
  const tmp = A[ai]; A[ai] = Bv[bi]; Bv[bi] = tmp;
}

/** Inject the DUSK styling once (shared by the hotbar in hud.ts and this overlay). */
export function injectInvCss(): void {
  if ((document.getElementById('duskHud') as HTMLElement | null)?.querySelector?.('#invStyles')) return;
  if (document.getElementById('invStyles')) return;
  const css = document.createElement('style');
  css.id = 'invStyles';
  css.textContent = `
#duskHud .slot { position: relative; width: 52px; height: 52px; background: #241535ee; border: 2px solid #170c26; box-shadow: 4px 4px 0 #E13F7B; }
#duskHud .slot.sel { border: 3px solid #F5842D; box-shadow: 4px 4px 0 #E13F7B, inset 0 0 0 1px rgba(245,132,45,.5); }
#duskHud .slot .icon { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-52%); width: 36px; height: 36px; image-rendering: pixelated; pointer-events: none; }
#duskHud .slot .count { position: absolute; right: 4px; bottom: 2px; color: #F0C060; font-style: italic; font-weight: 700; font-size: 13px; text-shadow: -1px -1px 0 #241535, 1px -1px 0 #241535, -1px 1px 0 #241535, 1px 1px 0 #241535; }
#duskHud .slot .key { position: absolute; left: 3px; top: 1px; color: #F5E3C0; font-size: 9px; letter-spacing: .1em; opacity: .85; }
.inv-back { position: fixed; inset: 0; z-index: 35; background: rgba(12,6,20,.5); pointer-events: auto; }
.inv-panel { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-52%) skewX(-3deg); background: rgba(36,21,53,.92); border: 2px solid #170c26; box-shadow: 4px 4px 0 #E13F7B; padding: 18px 22px 14px; pointer-events: auto; font-family: ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace; }
.inv-panel .inv-title { color: #F5E3C0; font-style: italic; font-weight: 700; text-transform: uppercase; letter-spacing: .18em; font-size: 20px; text-shadow: 4px 4px 0 #E13F7B; margin-bottom: 2px; }
.inv-panel .inv-sub { color: #3FE0C5; font-size: 9px; letter-spacing: .4em; text-transform: uppercase; margin-bottom: 12px; }
.inv-panel .craft-wrap { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
.inv-panel .cgrid { display: grid; grid-template-columns: repeat(3, 46px); gap: 2px; }
.inv-panel .craft-arrow { color: #F0C060; font-style: italic; font-weight: 700; font-size: 22px; }
.inv-panel .cout { width: 50px !important; height: 50px !important; cursor: pointer; }
.inv-panel .cout.can { border-color: #F5842D; box-shadow: 4px 4px 0 #E13F7B, inset 0 0 0 2px rgba(245,132,45,.7); }
.inv-panel .inv-divider { height: 1px; background: #3FE0C5; opacity: .45; margin: 12px 0 8px; }
.inv-panel .maininv { display: grid; grid-template-columns: repeat(9, 46px); gap: 2px; }
.inv-panel .maininv .slot { width: 46px; height: 46px; }
.inv-panel .maininv .slot .icon { width: 30px; height: 30px; }
.inv-panel .maininv .slot.hb { border-color: #2f1a4d; }
.inv-panel .maininv .slot.sel { border: 3px solid #F5842D; }
.inv-panel .inv-help { margin-top: 10px; color: #8f7bb0; font-size: 9px; letter-spacing: .14em; text-transform: uppercase; line-height: 1.7; }
.inv-panel .inv-help b { color: #F0C060; }
`;
  document.head.appendChild(css);
}
