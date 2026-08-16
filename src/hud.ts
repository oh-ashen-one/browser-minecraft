/** CUBELAND — DUSK HUD (slim). makeHud = hotbar + crosshair + hearts + time.
 *  makeInvUi is a thin delegate to the inventory UI in ./inv (US-004). */
import { itemIcon } from './blocks';
import { makeInvUi as invMake, injectInvCss, IconFn } from './inv';

export type { IconFn };
interface SlotView { id: number | null; n: number }

/** itemIcon(id) returns a NUMBER (color). Draw it into a local canvas. */
function iconFor(id: number, size: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const c2 = cv.getContext('2d');
  if (c2) {
    let col: string | null = null;
    try { const n = itemIcon(id); if (typeof n === 'number') col = '#' + (n >>> 0).toString(16).padStart(8, '0'); } catch (_e) { /* fall back */ }
    c2.clearRect(0, 0, size, size);
    if (!col) col = id % 2 ? '#C48A4E' : '#6E5F55';
    c2.fillStyle = col;
    c2.fillRect(0, 0, size, size);
    c2.fillStyle = 'rgba(255,255,255,.18)';
    c2.fillRect(0, 0, size, Math.max(1, size >> 4));
    c2.fillStyle = 'rgba(0,0,0,.3)';
    c2.fillRect(0, size - Math.max(1, size >> 4), size, Math.max(1, size >> 4));
  }
  return cv;
}

const CSS = `
#duskHud{position:fixed;inset:0;z-index:20;pointer-events:none;font-family:ui-monospace,"Cascadia Mono",Menlo,Consolas,monospace}
#duskHud .cross{position:absolute;left:50%;top:50%;width:18px;height:18px;transform:translate(-50%,-50%)}
#duskHud .cross i{position:absolute;background:#fff;box-shadow:0 0 0 1px #000}
#duskHud .cross i.h{left:7px;top:2px;width:4px;height:14px}
#duskHud .cross i.v{left:2px;top:7px;width:14px;height:4px}
#duskHud .hearts{position:absolute;left:16px;bottom:78px;display:flex}
#duskHud .hearts canvas{width:20px;height:18px;image-rendering:pixelated;margin-right:3px}
#duskHud .clock{position:absolute;left:16px;bottom:104px;color:#F0C060;font-style:italic;font-weight:700;font-size:14px;text-shadow:-1px -1px 0 #241535,1px -1px 0 #241535,-1px 1px 0 #241535,1px 1px 0 #241535}
#duskHud .clock small{color:#3FE0C5;font-style:normal;font-weight:400;letter-spacing:.3em;text-transform:uppercase;font-size:9px;margin-right:8px}
#duskHud .hint{position:absolute;top:10px;right:12px;color:#3FE0C5;font-size:10px;letter-spacing:.4em;text-transform:uppercase;text-shadow:0 1px 2px rgba(0,0,0,.8)}
#duskHud .hint b{color:#F5E3C0;font-weight:700;letter-spacing:.1em}
#duskHud .hotbar{position:absolute;left:50%;bottom:14px;transform:translateX(-50%) skewX(-3deg);display:flex;gap:4px}
#duskHud .slot{position:relative;width:52px;height:52px;background:#241535ee;border:2px solid #170c26;box-shadow:4px 4px 0 #E13F7B}
#duskHud .slot.sel{border:3px solid #F5842D;box-shadow:4px 4px 0 #E13F7B,inset 0 0 0 1px rgba(245,132,45,.5)}
#duskHud .slot .icon{position:absolute;left:50%;top:50%;transform:translate(-50%,-52%);width:36px;height:36px;image-rendering:pixelated}
#duskHud .slot .count{position:absolute;right:4px;bottom:2px;color:#F0C060;font-style:italic;font-weight:700;font-size:13px;text-shadow:-1px -1px 0 #241535,1px -1px 0 #241535,-1px 1px 0 #241535,1px 1px 0 #241535}
#duskHud .slot .key{position:absolute;left:3px;top:1px;color:#F5E3C0;font-size:9px;letter-spacing:.1em;opacity:.85}
#duskHud .toast{position:absolute;left:50%;bottom:78px;transform:translateX(-50%) skewX(-3deg);color:#F5E3C0;font-size:12px;letter-spacing:.3em;text-transform:uppercase;text-shadow:0 1px 2px rgba(0,0,0,.85)}`;

export interface Hud {
  select(i: number): void;
  setSlots(slots: SlotView[]): void;
  toast(msg: string, ms?: number): void;
  setTime(minutes: number, isNight: boolean): void;
}

export function makeHud(iconFn?: IconFn): Hud {
  const root = document.createElement('div');
  root.id = 'duskHud';
  const css = document.createElement('style');
  css.id = 'duskHudCss';
  css.textContent = CSS;
  root.appendChild(css);

  const cross = document.createElement('div');
  cross.className = 'cross';
  cross.innerHTML = '<i class="h"></i><i class="v"></i>';
  root.appendChild(cross);

  const clock = document.createElement('div');
  clock.className = 'clock';
  root.appendChild(clock);

  const hearts = document.createElement('div');
  hearts.className = 'hearts';
  for (let i = 0; i < 10; i++) { const h = document.createElement('canvas'); h.width = 20; h.height = 18; hearts.appendChild(h); }
  root.appendChild(hearts);

  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.innerHTML = '<b>W A S D</b> MOVE &middot; <b>SPACE</b> JUMP &middot; <b>E</b> INVENTORY';
  root.appendChild(hint);

  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  root.appendChild(toastEl);

  const bar = document.createElement('div');
  bar.className = 'hotbar';
  const slotEls: HTMLDivElement[] = [];
  const iconEls: HTMLCanvasElement[] = [];
  const countEls: HTMLSpanElement[] = [];
  for (let i = 0; i < 9; i++) {
    const s = document.createElement('div');
    s.className = 'slot';
    const key = document.createElement('span');
    key.className = 'key';
    key.textContent = String(i + 1);
    const icon = document.createElement('canvas');
    icon.className = 'icon';
    icon.width = 36; icon.height = 36;
    const count = document.createElement('span');
    count.className = 'count';
    s.appendChild(key); s.appendChild(icon); s.appendChild(count);
    bar.appendChild(s);
    slotEls.push(s); iconEls.push(icon); countEls.push(count);
  }
  root.appendChild(bar);

  let sel = 0;
  let toastTimer: number | null = null;
  let lastClockKey = '';

  function select(i: number): void {
    sel = Math.max(0, Math.min(8, i));
    for (let k = 0; k < 9; k++) slotEls[k].classList.toggle('sel', k === sel);
  }

  function setSlots(next: SlotView[]): void {
    for (let i = 0; i < 9; i++) {
      const s = next[i];
      if (s && s.n > 0 && s.id != null) {
        iconEls[i].style.display = '';
        const ic = (iconFn ? iconFn(s.id, 36) : iconFor(s.id, 36));
        const c2 = iconEls[i].getContext('2d');
        if (c2) { c2.clearRect(0, 0, 36, 36); if (ic) c2.drawImage(ic, 0, 0); }
        countEls[i].textContent = s.n > 1 ? String(s.n) : '';
      } else { iconEls[i].style.display = 'none'; countEls[i].textContent = ''; }
    }
  }

  function toast(msg: string, ms = 1600): void {
    if (msg) toastEl.textContent = msg;
    toastEl.style.opacity = msg ? '1' : '0';
    if (toastTimer != null) window.clearTimeout(toastTimer);
    toastTimer = msg ? window.setTimeout(() => { toastEl.style.opacity = '0'; toastTimer = null; }, ms) : null;
  }

  /** Time-of-day clock (US-005). minutes = 0..1439. */
  function setTime(minutes: number, isNight: boolean): void {
    const hh = Math.floor(minutes / 60) % 24;
    const mm = minutes % 60;
    const key = hh + ':' + mm + (isNight ? 'N' : 'D');
    if (key === lastClockKey) return; // avoid DOM churn every frame
    lastClockKey = key;
    const h2 = String(hh).padStart(2, '0');
    const m2 = String(mm).padStart(2, '0');
    clock.innerHTML = '<small>' + (isNight ? 'NIGHT' : 'DAY') + '</small>' + h2 + ':' + m2;
  }

  document.body.appendChild(root);
  injectInvCss();
  return { select, setSlots, toast, setTime };
}

export interface InvUi {
  setOpen(open: boolean): void;
  sync(m: unknown, craftResult?: { id: number; n: number } | null): void;
}

/** Thin delegate: the real inventory/crafting overlay lives in ./inv. */
export function makeInvUi(model: unknown, iconFn?: IconFn): InvUi {
  const ui = invMake(model as Parameters<typeof invMake>[0], iconFn);
  return { setOpen: ui.setOpen, sync: (m, r) => ui.sync(m as Parameters<typeof ui.sync>[0], r) };
}
