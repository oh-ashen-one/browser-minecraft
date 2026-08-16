/**
 * CUBELAND — inventory, cursor-stack rules and crafting.
 * Slots: 0..8 = hotbar (matches the HUD), 9..35 = main grid.
 * Craft grid is a virtual 3x3; in "hand" mode only the inner 2x2
 * (cells 0,1,4,5) is usable. Recipes are shaped patterns plus a few
 * shapeless ones (log -> planks). Taking from the output slot consumes
 * one item per pattern cell, classic style.
 */
import { B, I, maxStack } from './blocks';

export interface Stack { id: number; n: number }

/**
 * One click on a slot. Pure function of the two stacks so both the player
 * inventory and furnace panels share exact MC-like behaviour:
 *  left:  empty slot + stack -> place; stack + empty cursor -> pick up;
 *         same id merge if it fits, else swap.
 *  right: place one; grab half of a full stack with an empty cursor.
 */
export function applyClick(
  slot: Stack | null, cursor: Stack | null, btn: 0 | 1,
): { slot: Stack | null; cursor: Stack | null } {
  if (btn === 0) {
    if (!cursor) return { slot: null, cursor: slot };
    if (!slot) return { slot: cursor, cursor: null };
    const max = maxStack(slot.id);
    if (slot.id === cursor.id && max > 1) {
      const total = slot.n + cursor.n;
      if (total <= max) return { slot: null, cursor: { id: slot.id, n: total } };
    }
    return { slot: cursor, cursor: slot }; // swap
  }
  if (btn === 1) {
    if (!cursor) {
      if (!slot) return { slot: null, cursor: null };
      const max = maxStack(slot.id);
      if (max > 1 && slot.n === max) {
        const take = Math.ceil(slot.n / 2);
        return { slot: { id: slot.id, n: slot.n - take }, cursor: { id: slot.id, n: take } };
      }
      return { slot, cursor: null };
    }
    if (!slot) {
      const rest = cursor.n > 1 ? { id: cursor.id, n: cursor.n - 1 } : null;
      return { slot: { id: cursor.id, n: 1 }, cursor: rest };
    }
    const max = maxStack(slot.id);
    if (slot.id === cursor.id && slot.n < max) {
      const add = Math.min(cursor.n, max - slot.n);
      return {
        slot: { id: slot.id, n: slot.n + add },
        cursor: add < cursor.n ? { id: cursor.id, n: cursor.n - add } : null,
      };
    }
    return { slot, cursor };
  }
  return { slot, cursor };
}

export type SlotRef =
  | { kind: 'player'; i: number }
  | { kind: 'craft'; i: number }
  | { kind: 'out' };

export interface RecipeDef {
  rows: string[]; // pattern rows, ragged allowed; '' = empty
  map: Record<string, number | number[]>;
  out: number;
  n: number;
}

function rec(rows: string[], map: Record<string, number | number[]>, out: number, n: number): RecipeDef {
  return { rows, map, out, n };
}

const TOOL_ROWS: Record<'pick' | 'axe' | 'sword', string[]> = {
  pick: ['MMM', '.S.', '.S.'],
  axe: ['MM.', 'MS.', '.S.'],
  sword: ['M', 'M', 'S'],
};

// [material(s), pickaxe id, axe id, sword id]
const MATS: Array<[number | number[], number, number, number]> = [
  [[B.PLANKS], I.WPICK, I.WAXE, I.WSWORD],
  [[B.COBBLE, B.STONE], I.SPICK, I.SAXE, I.SSWORD],
  [[I.INGOT], I.IPICK, I.IAXE, I.ISWORD],
];

export const RECIPES: RecipeDef[] = [
  rec(['P', 'P'], { P: B.PLANKS }, I.STICK, 4),                       // two planks vertical
  rec(['CC', 'CC'], { C: B.PLANKS }, B.TABLE, 1),                     // 2x2 planks
  rec(['CCC', 'CBC', 'CCC'], { C: B.COBBLE }, B.FURNACE, 1),          // cobble ring
  rec(['C', 'S'], { C: I.COAL, S: I.STICK }, B.TORCH, 4),             // coal over stick
];
for (const [m, pickId, axeId, swordId] of MATS) {
  const map: Record<string, number | number[]> = { M: m, S: I.STICK };
  RECIPES.push(rec(TOOL_ROWS.pick, map, pickId, 1));
  RECIPES.push(rec(TOOL_ROWS.axe, map, axeId, 1));
  RECIPES.push(rec(TOOL_ROWS.sword, map, swordId, 1));
}

/** Shapeless recipes: exact item multiset (total counts across the grid). */
export const SHAPELESS: Array<{ need: Array<[number, number]>; out: number; n: number }> = [
  { need: [[B.LOG, 1]], out: B.PLANKS, n: 4 },
];

/** Cells of the craft grid usable in hand mode (inner 2x2). */
export const HAND_CELLS = [0, 1, 4, 5];

export class InvModel {
  slots: (Stack | null)[] = new Array(36).fill(null);
  cursor: Stack | null = null;
  craft: (Stack | null)[] = new Array(9).fill(null);
  open3 = false;            // true when opened from a crafting table
  out: Stack | null = null;

  cellAllowed(i: number): boolean {
    return this.open3 || HAND_CELLS.includes(i);
  }

  open(table: boolean): void {
    this.open3 = table;
  }

  /** Return craft-grid items to the player and clear. */
  close(): void {
    for (let i = 0; i < 9; i++) {
      const s = this.craft[i];
      if (s) {
        const left = this.addStack(s.id, s.n);
        if (left > 0) this.cursor = { id: s.id, n: left };
      }
    }
    this.craft.fill(null);
    this.out = null;
  }

  getStack(ref: SlotRef): Stack | null {
    if (ref.kind === 'player') return this.slots[ref.i];
    if (ref.kind === 'craft') return this.craft[ref.i];
    return this.out;
  }

  private setStack(ref: SlotRef, s: Stack | null): void {
    if (ref.kind === 'player') this.slots[ref.i] = s;
    else if (ref.kind === 'craft') this.craft[ref.i] = s;
  }

  click(ref: SlotRef, btn: 0 | 1): void {
    if (ref.kind === 'out') {
      const cur = this.out;
      if (!cur) return;
      if (btn === 0) {
        const res = applyClick(cur, this.cursor, 0);
        if (res.slot === null) {
          // took the output: consume one item per occupied pattern cell
          for (let i = 0; i < 9; i++) {
            const s = this.craft[i];
            if (s) this.craft[i] = s.n > 1 ? { id: s.id, n: s.n - 1 } : null;
          }
        }
        this.cursor = res.cursor;
        this.out = this.solveOut();
      } else if (!this.cursor) {
        // right-click: take one from output
        this.cursor = { id: cur.id, n: 1 };
        for (let i = 0; i < 9; i++) {
          const s = this.craft[i];
          if (s) this.craft[i] = s.n > 1 ? { id: s.id, n: s.n - 1 } : null;
        }
        this.out = this.solveOut();
      }
      return;
    }
    const res = applyClick(this.getStack(ref), this.cursor, btn);
    if (btn === 1 && !this.cursor && res.slot) {
      // grabbed half of a full stack — keep it on the cursor (applyClick did this)
    }
    this.setStack(ref, res.slot);
    this.cursor = res.cursor;
    if (ref.kind === 'craft') this.out = this.solveOut();
  }

  /** Remove and return the stack at a slot (Q drop). */
  pop(ref: SlotRef): Stack | null {
    if (ref.kind === 'out') return null; // dropping from output not supported
    const s = this.getStack(ref);
    if (!s) return null;
    this.setStack(ref, null);
    if (ref.kind === 'craft') this.out = this.solveOut();
    return s;
  }

  /** Merge a stack into the player's 36 slots. Returns leftover count. */
  addStack(id: number, n: number): number {
    let left = n;
    const max = maxStack(id);
    for (let i = 0; i < 36 && left > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const add = Math.min(left, max - s.n);
        s.n += add; left -= add;
      }
    }
    for (let i = 0; i < 36 && left > 0; i++) {
      if (!this.slots[i]) {
        const add = Math.min(left, max);
        this.slots[i] = { id, n: add }; left -= add;
      }
    }
    return left;
  }

  /** Solve the craft grid. Order: shapeless first, then shaped (bbox-trimmed). */
  solveOut(): Stack | null {
    const g = this.craft;
    let any = false;
    let minR = 3, maxR = -1, minC = 3, maxC = -1;
    const counts = new Map<number, number>();

    for (let r = 0; r < 3; r++) for (let c2 = 0; c2 < 3; c2++) {
      const s = g[r * 3 + c2];
      if (!s) continue;
      any = true;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      if (c2 < minC) minC = c2;
      if (c2 > maxC) maxC = c2;
      counts.set(s.id, (counts.get(s.id) || 0) + s.n);
    }
    if (!any) return null;

    // shapeless: exact multiset by total count
    for (const sh of SHAPELESS) {
      let ok = counts.size === sh.need.length;
      for (const [id, n] of sh.need) {
        if ((counts.get(id) || 0) !== n) { ok = false; break; }
      }
      if (ok) return { id: sh.out, n: sh.n };
    }

    // shaped: trim grid to bounding box, exact pattern match
    const h = maxR - minR + 1;
    const w = maxC - minC + 1;
    for (const rp of RECIPES) {
      const ph = rp.rows.length;
      let pw = 0;
      for (const row of rp.rows) pw = Math.max(pw, row.length);
      if (ph !== h || pw !== w) continue;
      let ok = true;
      for (let r = 0; r < h && ok; r++) {
        for (let c2 = 0; c2 < w; c2++) {
          const cell = g[(minR + r) * 3 + (minC + c2)];
          const ch = rp.rows[r][c2] !== undefined ? rp.rows[r][c2] : '';
          if (ch === '') {
            if (cell) { ok = false; break; }
            continue;
          }
          if (!cell) { ok = false; break; }
          const allowed = rp.map[ch];
          if (typeof allowed === 'number' ? allowed !== cell.id : !allowed.includes(cell.id)) {
            ok = false; break;
          }
        }
      }
      if (ok) return { id: rp.out, n: rp.n };
    }
    return null;
  }

  refreshOut(): void {
    this.out = this.solveOut();
  }
}

/** Serialize the player inventory (36 slots) for saving. */
export function serializeSlots(slots: (Stack | null)[]): Array<[number, number] | 0> {
  return slots.map(s => (s ? [s.id, s.n] : 0));
}

export function deserializeSlots(data: Array<[number, number] | 0>): (Stack | null)[] {
  const out: (Stack | null)[] = new Array(36).fill(null);
  for (let i = 0; i < 36 && i < data.length; i++) {
    const e = data[i];
    out[i] = Array.isArray(e) ? { id: e[0], n: e[1] } : null;
  }
  return out;
}
