/**
 * CUBELAND — DUSK hotbar HUD.
 * All DOM is created here in TypeScript (no index.html markup): 9 skewed plum
 * slots, orange selected border, item icons + counts, key hints, and a small
 * toast for feedback.
 */
import { itemName } from './blocks';

export interface HotbarSlot {
  id: number | null; // item/block id, null = empty
  n: number;         // stack size (0 when empty)
}

export interface Hud {
  select(i: number): void;
  setSlots(slots: HotbarSlot[]): void;
  toast(msg: string, ms?: number): void;
}

export function makeHud(): Hud {
  const root = document.createElement('div');
  root.id = 'duskHud';

  const css = document.createElement('style');
  css.textContent = `
#duskHud { position: fixed; inset: 0; z-index: 20; pointer-events: none; font-family: ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace; }
#duskHud .hud-hint { position: absolute; top: 10px; right: 12px; color: #3FE0C5; font-size: 10px; letter-spacing: .4em; text-transform: uppercase; text-shadow: 0 1px 2px rgba(0,0,0,.8); }
#duskHud .hud-hint b { color: #F5E3C0; font-weight: 700; letter-spacing: .1em; }
#duskHud .hud-name { position: absolute; left: 50%; bottom: 78px; transform: translateX(-50%) skewX(-3deg); color: #F5E3C0; font-size: 12px; letter-spacing: .3em; text-transform: uppercase; text-shadow: 0 1px 2px rgba(0,0,0,.85); }
#duskHud .hud-toast { position: absolute; left: 50%; bottom: 112px; transform: translateX(-50%) skewX(-3deg); background: #241535; border: 2px solid #170c26; box-shadow: 4px 4px 0 #E13F7B; color: #F5E3C0; font-size: 12px; letter-spacing: .12em; padding: 5px 14px; opacity: 0; transition: opacity .25s; }
#duskHud .hud-toast.on { opacity: 1; }
#duskHud .hotbar { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%) skewX(-3deg); display: flex; gap: 4px; }
#duskHud .slot { position: relative; width: 52px; height: 52px; background: #241535ee; border: 2px solid #170c26; box-shadow: 4px 4px 0 #E13F7B; }
#duskHud .slot.sel { border: 3px solid #F5842D; box-shadow: 4px 4px 0 #E13F7B, inset 0 0 0 1px rgba(245,132,45,.5); }
#duskHud .slot .icon { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-52%); width: 36px; height: 36px; image-rendering: pixelated; }
#duskHud .slot .count { position: absolute; right: 4px; bottom: 2px; color: #F0C060; font-style: italic; font-weight: 700; font-size: 13px; text-shadow: -1px -1px 0 #241535, 1px -1px 0 #241535, -1px 1px 0 #241535, 1px 1px 0 #241535; }
#duskHud .slot .key { position: absolute; left: 3px; top: 1px; color: #F5E3C0; font-size: 9px; letter-spacing: .1em; opacity: .85; }
`;
  root.appendChild(css);

  const hint = document.createElement('div');
  hint.className = 'hud-hint';
  hint.innerHTML = '<b>LMB</b> MINE &middot; <b>RMB</b> PLACE &middot; <b>1&ndash;9</b> HOTBAR';
  root.appendChild(hint);

  const nameEl = document.createElement('div');
  nameEl.className = 'hud-name';
  root.appendChild(nameEl);

  const toastEl = document.createElement('div');
  toastEl.className = 'hud-toast';
  root.appendChild(toastEl);

  const bar = document.createElement('div');
  bar.className = 'hotbar';
  root.appendChild(bar);

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
    icon.width = 36;
    icon.height = 36;
    const count = document.createElement('span');
    count.className = 'count';
    s.appendChild(key);
    s.appendChild(icon);
    s.appendChild(count);
    bar.appendChild(s);
    slotEls.push(s);
    iconEls.push(icon);
    countEls.push(count);
  }

  let sel = 0;
  let toastTimer: number | null = null;

  function select(i: number): void {
    sel = Math.max(0, Math.min(8, i));
    for (let k = 0; k < 9; k++) slotEls[k].classList.toggle('sel', k === sel);
    const s = slots[sel];
    nameEl.textContent = s && s.n > 0 ? itemName(s.id!) : '';
  }

  let slots: HotbarSlot[] = new Array(9).fill(null).map(() => ({ id: null, n: 0 }));

  function setSlots(next: HotbarSlot[]): void {
    slots = next;
    for (let i = 0; i < 9; i++) {
      const s = next[i];
      if (s && s.n > 0) {
        iconEls[i].style.display = '';
        countEls[i].textContent = s.n > 1 ? String(s.n) : '';
      } else {
        iconEls[i].style.display = 'none';
        countEls[i].textContent = '';
      }
    }
    select(sel);
  }

  function toast(msg: string, ms = 1600): void {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    if (toastTimer != null) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.classList.remove('on');
      toastTimer = null;
    }, ms);
  }

  document.body.appendChild(root);
  return { select, setSlots, toast };
}
