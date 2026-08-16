/**
 * CUBELAND — block & item registry.
 * Block ids 0..17 are placeable world blocks (0 = air, no def).
 * Item ids 100+ are tool/material items. Placing a block id uses its def;
 * some blocks drop item ids (grass→dirt, ores→coal/ore blocks kept as-is).
 */

export const B = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  COBBLE: 4,
  SAND: 5,
  WATER: 6,
  LOG: 7,
  LEAVES: 8,
  PLANKS: 9,
  COAL_ORE: 10,
  IRON_ORE: 11,
  TABLE: 12,
  FURNACE: 13,
  GLASS: 14,
  TORCH: 15,
  BEDROCK: 16,
  TALL_GRASS: 17,
} as const;

export const I = {
  STICK: 100,
  COAL: 101,
  INGOT: 102,
  MEAT: 103,
  CMEAT: 104,
  WOOL: 105,
  WPICK: 110,
  SPICK: 111,
  IPICK: 112,
  WAXE: 113,
  SAXE: 114,
  IAXE: 115,
  WSWORD: 116,
  SSWORD: 117,
  ISWORD: 118,
} as const;

export interface BlockDef {
  id: number;
  name: string;
  solid: boolean;   // collides with player & mobs
  opaque: number;   // sunlight-blocking (1) or passing (0); water handled separately
  emit: number;     // light emitted into the block's own cell (0..15)
  hard: number;     // seconds to mine bare-hand. Infinity = unbreakable, 0 = instant
  tier: number;     // recommended min tool tier for quick mining (0 = hand is fine)
  family: 'wood' | 'stone' | null; // which material the block is made of
  drop: number | null;             // item id dropped (null = nothing)
  tiles: { top: number; side: number; bottom: number }; // atlas tile indices
  cross?: boolean;                 // render as crossed quads (torch, tall grass)
}

const def = (d: Omit<BlockDef, 'id'> & { id: number }): BlockDef => d;

export const BLOCKS: (BlockDef | null)[] = [
  null, // AIR
  def({ id: B.GRASS, name: 'Grass', solid: true, opaque: 1, emit: 0, hard: 0.55, tier: 0, family: null, drop: B.DIRT, tiles: { top: 0, side: 1, bottom: 2 } }),
  def({ id: B.DIRT, name: 'Dirt', solid: true, opaque: 1, emit: 0, hard: 0.5, tier: 0, family: null, drop: B.DIRT, tiles: { top: 2, side: 2, bottom: 2 } }),
  def({ id: B.STONE, name: 'Stone', solid: true, opaque: 1, emit: 0, hard: 4, tier: 1, family: 'stone', drop: B.COBBLE, tiles: { top: 3, side: 3, bottom: 3 } }),
  def({ id: B.COBBLE, name: 'Cobblestone', solid: true, opaque: 1, emit: 0, hard: 4, tier: 1, family: 'stone', drop: B.COBBLE, tiles: { top: 4, side: 4, bottom: 4 } }),
  def({ id: B.SAND, name: 'Sand', solid: true, opaque: 1, emit: 0, hard: 0.45, tier: 0, family: null, drop: B.SAND, tiles: { top: 5, side: 5, bottom: 5 } }),
  def({ id: B.WATER, name: 'Water', solid: false, opaque: 0, emit: 0, hard: Infinity, tier: 0, family: null, drop: null, tiles: { top: 6, side: 6, bottom: 6 } }),
  def({ id: B.LOG, name: 'Oak Log', solid: true, opaque: 1, emit: 0, hard: 1.4, tier: 0, family: 'wood', drop: B.LOG, tiles: { top: 8, side: 7, bottom: 8 } }),
  def({ id: B.LEAVES, name: 'Leaves', solid: true, opaque: 1, emit: 0, hard: 0.25, tier: 0, family: null, drop: I.STICK, tiles: { top: 9, side: 9, bottom: 9 } }),
  def({ id: B.PLANKS, name: 'Planks', solid: true, opaque: 1, emit: 0, hard: 1.0, tier: 0, family: 'wood', drop: B.PLANKS, tiles: { top: 10, side: 10, bottom: 10 } }),
  def({ id: B.COAL_ORE, name: 'Coal Ore', solid: true, opaque: 1, emit: 0, hard: 4.5, tier: 1, family: 'stone', drop: I.COAL, tiles: { top: 11, side: 11, bottom: 11 } }),
  def({ id: B.IRON_ORE, name: 'Iron Ore', solid: true, opaque: 1, emit: 0, hard: 5.5, tier: 2, family: 'stone', drop: B.IRON_ORE, tiles: { top: 12, side: 12, bottom: 12 } }),
  def({ id: B.TABLE, name: 'Crafting Table', solid: true, opaque: 1, emit: 0, hard: 1.0, tier: 0, family: 'wood', drop: B.TABLE, tiles: { top: 13, side: 14, bottom: 10 } }),
  def({ id: B.FURNACE, name: 'Furnace', solid: true, opaque: 1, emit: 0, hard: 4, tier: 1, family: 'stone', drop: B.FURNACE, tiles: { top: 4, side: 15, bottom: 4 } }),
  def({ id: B.GLASS, name: 'Glass', solid: true, opaque: 0, emit: 0, hard: 0.2, tier: 0, family: null, drop: null, tiles: { top: 17, side: 17, bottom: 17 } }),
  def({ id: B.TORCH, name: 'Torch', solid: false, opaque: 0, emit: 14, hard: 0, tier: 0, family: null, drop: B.TORCH, tiles: { top: 18, side: 18, bottom: 18 }, cross: true }),
  def({ id: B.BEDROCK, name: 'Bedrock', solid: true, opaque: 1, emit: 0, hard: Infinity, tier: 3, family: null, drop: null, tiles: { top: 19, side: 19, bottom: 19 } }),
  def({ id: B.TALL_GRASS, name: 'Tall Grass', solid: false, opaque: 0, emit: 0, hard: 0, tier: 0, family: null, drop: null, tiles: { top: 20, side: 20, bottom: 20 }, cross: true }),
];

export interface ItemDef {
  id: number;
  name: string;
  icon: number; // atlas tile for the inventory icon
  tool?: { kind: 'pick' | 'axe' | 'sword'; tier: 1 | 2 | 3 };
}

export const ITEMS: Record<number, ItemDef> = {
  [I.STICK]: { id: I.STICK, name: 'Stick', icon: 22 },
  [I.COAL]: { id: I.COAL, name: 'Coal', icon: 23 },
  [I.INGOT]: { id: I.INGOT, name: 'Iron Ingot', icon: 24 },
  [I.MEAT]: { id: I.MEAT, name: 'Raw Meat', icon: 25 },
  [I.CMEAT]: { id: I.CMEAT, name: 'Cooked Meat', icon: 26 },
  [I.WOOL]: { id: I.WOOL, name: 'Wool', icon: 21 },
  [I.WPICK]: { id: I.WPICK, name: 'Wooden Pickaxe', icon: 27, tool: { kind: 'pick', tier: 1 } },
  [I.SPICK]: { id: I.SPICK, name: 'Stone Pickaxe', icon: 28, tool: { kind: 'pick', tier: 2 } },
  [I.IPICK]: { id: I.IPICK, name: 'Iron Pickaxe', icon: 29, tool: { kind: 'pick', tier: 3 } },
  [I.WAXE]: { id: I.WAXE, name: 'Wooden Axe', icon: 30, tool: { kind: 'axe', tier: 1 } },
  [I.SAXE]: { id: I.SAXE, name: 'Stone Axe', icon: 31, tool: { kind: 'axe', tier: 2 } },
  [I.IAXE]: { id: I.IAXE, name: 'Iron Axe', icon: 32, tool: { kind: 'axe', tier: 3 } },
  [I.WSWORD]: { id: I.WSWORD, name: 'Wooden Sword', icon: 33, tool: { kind: 'sword', tier: 1 } },
  [I.SSWORD]: { id: I.SSWORD, name: 'Stone Sword', icon: 34, tool: { kind: 'sword', tier: 2 } },
  [I.ISWORD]: { id: I.ISWORD, name: 'Iron Sword', icon: 35, tool: { kind: 'sword', tier: 3 } },
};

export function blockDef(id: number): BlockDef | null {
  return BLOCKS[id] ?? null;
}

/** Display name for any item id (block or tool). */
export function itemName(id: number): string {
  if (id < 100) return blockDef(id)?.name ?? '???';
  return ITEMS[id]?.name ?? '???';
}

/** Atlas tile to use as an inventory icon. */
export function itemIcon(id: number): number {
  if (id < 100) return blockDef(id)?.tiles.side ?? 2;
  return ITEMS[id]?.icon ?? 21;
}

export function maxStack(id: number): number {
  const it = ITEMS[id];
  if (it && it.tool) return 1; // tools don't stack
  return 64;
}

export function isTool(id: number): boolean {
  return id >= 100 && !!ITEMS[id]?.tool;
}

export function isSolid(id: number): boolean {
  return blockDef(id)?.solid === true;
}

/** True if the item can be placed as a block in the world. */
export function isPlaceable(id: number): boolean {
  if (id >= 100) return false;
  const d = blockDef(id);
  if (!d) return false;
  // water & tall grass are world-generated only
  return id !== B.WATER && id !== B.TALL_GRASS;
}

/** Mining speed multiplier by tool tier: hand, wood, stone, iron. */
const TOOL_MULT = [1, 2.8, 4.6, 7];

/**
 * Tool kind that is effective against a block's material:
 * wood blocks (log, planks) want an axe; stone-family blocks want a pick.
 * Null = no tool beats bare hands (dirt, sand, plants).
 */
function familyTool(family: 'wood' | 'stone' | null): 'axe' | 'pick' | null {
  if (family === 'wood') return 'axe';
  if (family === 'stone') return 'pick';
  return null;
}

/**
 * Seconds to fully break a block with the given held tool (null = fist).
 * Encodes "fist < wood < stone < iron": wrong kind barely helps, right kind
 * at the block's tier or better is fastest, under-tier is punishingly slow.
 */
export function breakSeconds(blockId: number, toolId: number | null): number {
  const d = blockDef(blockId);
  if (!d) return Infinity;
  if (d.hard === Infinity) return Infinity; // bedrock & water
  if (d.hard <= 0.2) return d.hard === 0 ? 0.1 : d.hard; // instant-ish plants/glass

  const tool = toolId == null ? undefined : ITEMS[toolId]?.tool;
  const kind: 'pick' | 'axe' | 'sword' | undefined = tool?.kind;

  if (!d.family) {
    // dirt/sand/plants: any real tool is a modest speed-up, swords are fists
    return d.hard / (kind && kind !== 'sword' ? 1.5 : 1);
  }

  if (!kind || kind === 'sword') return d.hard; // bare hand (slow but works)

  const want = familyTool(d.family);
  let m: number;
  if (want !== null && kind === want) {
    m = TOOL_MULT[tool!.tier] * (tool!.tier >= d.tier ? 1 : 0.45);
  } else {
    m = TOOL_MULT[tool!.tier] * 0.3; // wrong tool for the job
  }
  return d.hard / m;
}

/** Melee damage dealt by the held item (null = fist). */
export function toolDamage(toolId: number | null): number {
  if (toolId == null) return 1;
  const t = ITEMS[toolId]?.tool;
  if (!t) return 1;
  if (t.kind === 'sword') return [0, 4, 6, 8][t.tier];
  return t.tier + 1; // pick/axe as blunt weapons: 2 / 3 / 4
}

/* ---------------- furnace rules ---------------- */

/** input item id → smelted output. */
export const SMELT: Record<number, { out: number; n: number }> = {
  [B.COBBLE]: { out: B.STONE, n: 1 },
  [B.SAND]: { out: B.GLASS, n: 1 },
  [B.IRON_ORE]: { out: I.INGOT, n: 1 },
  [I.MEAT]: { out: I.CMEAT, n: 1 },
};

/** How many items each fuel item can smelt. */
export const FUEL: Record<number, number> = {
  [I.COAL]: 8,
  [B.PLANKS]: 2,
  [B.LOG]: 2,
};

/** Smelting time (seconds) per item while burning. */
export const SMELT_TIME = 1.6;

/** True if two stacks can share a slot (same id, under max stack). */
export function canStack(a: number | null, b: number): boolean {
  return a === b && maxStack(a!) > 0;
}
