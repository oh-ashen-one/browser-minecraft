/**
 * CUBELAND — inventory model + crafting recipes (US-004).
 *
 * InvModel owns the 27-slot grid (rows 3-5 mirror the hotbar, keys 1-9) and
 * a 3x3 crafting bench. Recipes are shape-based: planks, sticks, crafting
 * table, wood/stone pickaxe, axe and shovel, torch. The 3x3 bench is trimmed
 * and compared against each recipe in all rotations + mirrors, so a 2x1 pair
 * of logs crafts planks wherever it sits on the grid.
 */
import { B, itemName } from './blocks';

/** One stack: item id + count. null = empty slot. */
export interface Stack { id: number; n: number }

/** A resolved craft result. `cost` is a 3x3 grid of item ids (0 = free cell). */
export interface CraftResult { id: number; n: number; cost: number[][] }

type Cell = Stack | null;
export type Grid3x3 = [Cell, Cell, Cell, Cell, Cell, Cell, Cell, Cell, Cell];

/**
 * Item ids from the frozen block table, with the same fallbacks the engine
 * used before so crafting keeps working if an id is ever missing.
 */
const LOG = (B as Record<string, number | undefined>)['LOG'] ?? 8;
const PLANKS = (B as Record<string, number | undefined>)['PLANKS'] ?? 10;
const STICK = (B as Record<string, number | undefined>)['STICK'] ?? 100;
const COBBLE = (B as Record<string, number | undefined>)['COBBLE'] ?? 4;
const TABLE = (B as Record<string, number | undefined>)['CRAFTING'] ?? 13;
const TORCH = (B as Record<string, number | undefined>)['TORCH'] ?? 18;
const COAL = (B as Record<string, number | undefined>)['COAL'] ?? 23;
const WPICK = (B as Record<string, number | undefined>)['WOOD_PICK'] ?? 27;
const SPICK = (B as Record<string, number | undefined>)['STONE_PICK'] ?? 28;
const WAXE = (B as Record<string, number | undefined>)['WOOD_AXE'] ?? 30;
const SAXE = (B as Record<string, number | undefined>)['STONE_AXE'] ?? 31;
const WSHOVEL = (B as Record<string, number | undefined>)['WOOD_SHOVEL'] ?? 36;
const SSHOVEL = (B as Record<string, number | undefined>)['STONE_SHOVEL'] ?? 37;

function rot90(g: number[][]): number[][] {
  const n = g.length;
  const o: number[][] = [];
  for (let y = 0; y < n; y++) { o.push([]); for (let x = 0; x < g.length; x++) o[y].push(g[g.length - 1 - x][y]); }
  return o;
}

function mirrorX(g: number[][]): number[][] { return g.map(r => r.slice().reverse()); }

function sameGrid(a: number[][], b: number[][]): boolean {
  if (a.length !== b.length) return false;
  for (let y = 0; y < a.length; y++) {
    if (a[y].length !== b[y].length) return false;
    for (let x = 0; x < a[y].length; x++) if (a[y][x] !== b[y][x]) return false;
  }
  return true;
}

function trim(g: number[][]): number[][] {
  const rows = g.filter(r => r.some(v => v !== 0));
  if (!rows.length) return [];
  const cols = rows[0].length;
  const out: number[][] = [];
  for (let x = 0; x < cols; x++) {
    const col: number[] = [];
    for (let y = 0; y < rows.length; y++) col.push(rows[y][x]);
    if (col.some(v => v !== 0)) out.push(col);
  }
  return out;
}

/** All normalized variants of a grid: 4 rotations x mirror, trimmed. */
function variants(g: number[][]): number[][][] {
  const out: number[][][] = [];
  let cur = g;
  for (let r = 0; r < 4; r++) {
    const t1 = trim(cur);
    if (t1.length) out.push(t1.map(row => row.slice()));
    const t2 = trim(mirrorX(cur));
    if (t2.length) out.push(t2.map(row => row.slice()));
    cur = rot90(cur);
  }
  return out;
}

interface Recipe { id: number; n: number; cost: number[][] }

/** The recipe table: planks, sticks, table, tools (wood + stone), torch. */
export const RECIPES: Array<{ shape: number[][]; out: Recipe }> = [
  { shape: [[LOG], [LOG]],                                   out: { id: PLANKS, n: 4, cost: [[0, LOG], [0, LOG]] } },
  { shape: [[PLANKS], [PLANKS]],                             out: { id: STICK, n: 4, cost: [[0, PLANKS], [0, PLANKS]] } },
  { shape: [[PLANKS, PLANKS], [PLANKS, PLANKS]],             out: { id: TABLE, n: 1, cost: [[0, PLANKS, PLANKS], [0, PLANKS, PLANKS], [0, 0, 0]] } },
  { shape: [[PLANKS, PLANKS, PLANKS], [0, STICK, 0]],        out: { id: WPICK, n: 1, cost: [[PLANKS, PLANKS, PLANKS], [0, STICK, 0], [0, 0, 0]] } },
  { shape: [[COBBLE, COBBLE, COBBLE], [0, STICK, 0]],        out: { id: SPICK, n: 1, cost: [[COBBLE, COBBLE, COBBLE], [0, STICK, 0], [0, 0, 0]] } },
  { shape: [[PLANKS, PLANKS], [PLANKS, STICK]],              out: { id: WAXE, n: 1, cost: [[PLANKS, PLANKS], [PLANKS, STICK]] } },
  { shape: [[COBBLE, COBBLE], [COBBLE, STICK]],              out: { id: SAXE, n: 1, cost: [[COBBLE, COBBLE], [COBBLE, STICK]] } },
  { shape: [[PLANKS], [STICK]],                              out: { id: WSHOVEL, n: 1, cost: [[0, PLANKS], [0, STICK]] } },
  { shape: [[COBBLE], [STICK]],                              out: { id: SSHOVEL, n: 1, cost: [[0, COBBLE], [0, STICK]] } },
  { shape: [[COAL], [PLANKS]],                               out: { id: TORCH, n: 4, cost: [[COAL], [PLANKS]] } },
];

const RECIPE_VARIANTS: number[][][][] = RECIPES.map(r => variants(r.shape));

/**
 * InvModel — driven from the game loop. slots[0..8] are the hotbar;
 * bench is the 3x3 crafting grid. sel = selected hotbar slot (0-8).
 */
export class InvModel {
  slots: Cell[] = new Array<Cell>(27).fill(null);
  bench: Grid3x3 = [null, null, null, null, null, null, null, null, null];
  sel = 0;

  /** Stack in hotbar slot i (slots 0-8), or null. */
  hot(i: number): Cell { return i >= 0 && i < 9 ? this.slots[i] : null; }

  /** Stack in bench cell i (0-8, row-major), or null. */
  benchAt(i: number): Cell { return i >= 0 && i < 9 ? this.bench[i] : null; }

  /** Grant a stack: merge into same-id stacks, then first empty slot. */
  add(id: number, n: number): boolean {
    const max = 64;
    let left = n;
    for (const s of this.slots) { if (left <= 0) break; if (s && s.id === id && s.n < max) { const t = Math.min(max - s.n, left); s.n += t; left -= t; } }
    for (const s of this.bench) { if (left <= 0) break; if (s && s.id === id && s.n < max) { const t = Math.min(max - s.n, left); s.n += t; left -= t; } }
    for (let i = 0; i < this.slots.length && left > 0; i++) { if (!this.slots[i]) { this.slots[i] = { id, n: Math.min(max, left) }; left -= this.slots[i]!.n; } }
    for (let i = 0; i < this.bench.length && left > 0; i++) { if (!this.bench[i]) { this.bench[i] = { id, n: Math.min(max, left) }; left -= this.bench[i]!.n; } }
    return left <= 0;
  }

  /** Move a stack between slots/bench. Returns true when anything changed. */
  move(from: 'slots' | 'bench', i: number, to: 'slots' | 'bench', j: number): boolean {
    const src = from === 'slots' ? this.slots[i] : this.bench[i];
    if (!src) return false;
    const dstArr = to === 'slots' ? this.slots : this.bench;
    const dstIdx = j < 0 || j >= (to === 'slots' ? this.slots.length : 9) ? -1 : j;
    if (dstIdx >= 0 && dstArr[dstIdx] && dstArr[dstIdx]!.id === src.id) {
      const d = dstArr[dstIdx]!;
      if (d.n < 64) { const t = Math.min(64 - d.n, src.n); d.n += t; src.n -= t; }
      if (src.n <= 0) { if (from === 'slots') this.slots[i] = null; else this.bench[i] = null; }
      return true;
    }
    if (dstIdx >= 0 && !dstArr[dstIdx]) { dstArr[dstIdx] = src; if (from === 'slots') this.slots[i] = null; else this.bench[i] = null; return true; }
    if (dstIdx >= 0) { const tmp = dstArr[dstIdx]; dstArr[dstIdx] = src; if (from === 'slots') { this.slots[i] = tmp; } else { this.bench[i] = tmp; } return true; }
    return false;
  }

  /** Resolve the bench against RECIPES. null when nothing matches. */
  craft(): CraftResult | null {
    const g: number[] = this.bench.map(s => (s ? s.id : 0));
    const grid: number[][] = [g.slice(0, 3), g.slice(3, 6), g.slice(6, 9)];
    const benchV = variants(grid);
    for (let r = 0; r < RECIPES.length; r++) {
      const rv = RECIPE_VARIANTS[r];
      if (!rv.some(v => benchV.some(bv => sameGrid(bv, v)))) continue;
      const out = RECIPES[r].out;
      for (let y = 0; y < out.cost.length; y++) {
        for (let x = 0; x < out.cost[y].length; x++) {
          const need = out.cost[y][x];
          if (need === 0) continue;
          const have = g[y * 3 + x];
          if (have !== need) return null; // shape matched but a required cell is wrong: stop
        }
      }
      return { id: out.id, n: out.n, cost: out.cost };
    }
    return null;
  }

  /** Consume one craft: subtract the cost cells from the bench. */
  consume(cost: number[][]): void {
    for (let y = 0; y < cost.length; y++) {
      for (let x = 0; x < cost[y].length; x++) {
        if (cost[y][x] === 0) continue;
        const i = y * 3 + x;
        const s = this.bench[i];
        if (s) { s.n -= 1; if (s.n <= 0) this.bench[i] = null; }
      }
    }
  }

  /** True when the bench holds a stack that must be moved before closing. */
  benchHasItems(): boolean { return this.bench.some(s => s != null); }

  /** Push every bench stack into the main grid (used when closing). */
  absorbBench(): void { for (const s of this.bench) if (s) this.add(s.id, s.n); for (let i = 0; i < 9; i++) this.bench[i] = null; }

  /** Read-only hotbar view for the HUD. */
  hotbarView(): Array<{ id: number | null; n: number }> {
    const out: Array<{ id: number | null; n: number }> = [];
    for (let i = 0; i < 9; i++) { const s = this.slots[i]; out.push(s ? { id: s.id, n: s.n } : { id: null, n: 0 }); }
    return out;
  }

  name(i: number): string { const s = this.slots[i]; return s ? itemName(s.id) : ''; }
}

/** Human-readable recipe list, shown at the top of the inventory panel. */
export function recipeHelp(): string[] {
  return [
    '2 LOG -> 4 PLANKS',
    '2 PLANKS -> 4 STICKS',
    '4 PLANKS (2x2) -> CRAFTING TABLE',
    '3 TOP + STICK -> PICKAXE (PLANKS OR COBBLE)',
    '2x2 L + STICK -> AXE',
    '1 HEAD + STICK -> SHOVEL',
    'COAL ON PLANKS -> 4 TORCHES',
  ];
}
