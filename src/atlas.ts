/**
 * CUBELAND — hand-painted 16x16 texture atlas.
 * Every tile is drawn pixel-by-pixel onto a canvas at module load, using a
 * deterministic PRNG so the world looks identical across sessions. No Mojang
 * art, no external files: grass, stone, ores, tools, even the mob skins.
 */
import { mulberry32 } from './noise';
import { itemIcon as tileForItem } from './blocks';

/** Atlas layout: 8 columns x 5 rows of 16px tiles (40 slots, 38 used). */
export const ATLAS = { cols: 8, rows: 5 };

/** Tile indices — must match the numbers used in blocks.ts. */
export const T = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, COBBLE: 4,
  SAND: 5, WATER: 6, LOG_SIDE: 7, LOG_TOP: 8, LEAVES: 9,
  PLANKS: 10, COAL_ORE: 11, IRON_ORE: 12, TABLE_TOP: 13, TABLE_SIDE: 14,
  FURNACE_OFF: 15, FURNACE_ON: 16, GLASS: 17, TORCH: 18, BEDROCK: 19,
  TALLGRASS: 20, WOOL: 21, STICK_I: 22, COAL_I: 23, INGOT_I: 24,
  MEAT_I: 25, CMEAT_I: 26, WPICK_I: 27, SPICK_I: 28, IPICK_I: 29,
  WAXE_I: 30, SAXE_I: 31, IAXE_I: 32, WSWORD_I: 33, SSWORD_I: 34, ISWORD_I: 35,
  GLOOM: 36, SHEEP: 37,
} as const;

const W = ATLAS.cols * 16; // 128
const H = ATLAS.rows * 16; // 80

type RGB = [number, number, number];
const buf = new Uint8ClampedArray(W * H * 4);
let rng: () => number = mulberry32(1);

const c = (v: number) => Math.max(0, Math.min(255, v | 0));

function buildAtlas(): HTMLCanvasElement {
  rng = mulberry32(0xc0ffee);

  const put = (t: number, x: number, y: number, r: number, g: number, b: number, a = 255) => {
    if (x < 0 || y < 0 || x > 15 || y > 15) return;
    const ox = (t % ATLAS.cols) * 16;
    const oy = Math.floor(t / ATLAS.cols) * 16;
    const i = ((oy + y) * W + (ox + x)) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  };

  // ---- natural blocks ------------------------------------------------------

  { const t = T.GRASS_TOP;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = (rng() - 0.5) * 28;
      put(t, x, y, c(110 + d), c(178 + d * 1.25), c(76 + d));
    }
    for (let i = 0; i < 16; i++) put(t, (rng() * 16) | 0, (rng() * 16) | 0, c(142 + rng() * 36), c(208 + rng() * 30), c(96));
  }

  { const t = T.DIRT;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const n = rng();
      const d = n > 0.82 ? -26 : (n < 0.15 ? 20 : (rng() - 0.5) * 24);
      put(t, x, y, c(126 + d), c(88 + d * 0.85), c(54 + d * 0.7));
    }
    for (let i = 0; i < 6; i++) put(t, (rng() * 16) | 0, (rng() * 16) | 0, c(98), c(70), c(46));
  }

  { const t = T.GRASS_SIDE;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = (rng() - 0.5) * 24;
      put(t, x, y, c(126 + d), c(88 + d * 0.85), c(54 + d * 0.7));
    }
    for (let x = 0; x < 16; x++) {
      const depth = 3 + ((rng() * 2) | 0);
      for (let y = 0; y < depth; y++) {
        const d = (rng() - 0.5) * 24;
        put(t, x, y, c(106 + d), c(172 + d * 1.25), c(72 + d));
      }
      if (rng() < 0.35) put(t, x, depth, c(98 + rng() * 18), c(160 + rng() * 20), c(64));
    }
  }

  { const t = T.STONE;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const n = Math.sin(x * 3.1 + y * 7.7) * 0.5 + (rng() - 0.5) * 0.6;
      const d = n * 18;
      put(t, x, y, c(140 + d), c(144 + d), c(148 + d));
    }
    for (let i = 0; i < 6; i++) {
      let x = (rng() * 16) | 0, y = (rng() * 16) | 0;
      for (let s = 0; s < 4; s++) {
        put(t, x & 15, y & 15, c(98 + rng() * 16), c(102 + rng() * 16), c(108 + rng() * 16));
        x += rng() < 0.5 ? 1 : -1;
        y += rng() < 0.72 ? 1 : 0;
      }
    }
  }

  { const t = T.COBBLE;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (x % 5 === 0 || y % 5 === 0) { put(t, x, y, c(84 + rng() * 12), c(87 + rng() * 12), c(92 + rng() * 12)); continue; }
      const cell = (Math.floor(x / 5) * 3 + Math.floor(y / 5)) % 4;
      const base = 120 + cell * 9;
      const edge = (x % 5 === 1 || y % 5 === 1) ? 12 : (x % 5 === 4 || y % 5 === 4) ? -18 : 0;
      const d = (rng() - 0.5) * 14 + edge;
      put(t, x, y, c(base + d), c(base + d + 3), c(base + d + 6));
    }
  }

  { const t = T.SAND;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = (rng() - 0.5) * 18 + (rng() < 0.06 ? -26 : 0);
      put(t, x, y, c(232 + d), c(217 + d), c(168 + d));
    }
  }

  { const t = T.WATER;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const band = (x + y * 3) % 7 < 2 ? -16 : 0;
      put(t, x, y, c(58 + band), c(114 + band), c(192 + band * 0.5), 168);
    }
  }

  { const t = T.LOG_SIDE;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const stripe = (x % 4 === 0 ? -22 : x % 4 === 2 ? 10 : 0);
      const d = stripe + (rng() - 0.5) * 16;
      put(t, x, y, c(110 + d), c(78 + d * 0.85), c(46 + d * 0.7));
    }
    for (let i = 0; i < 8; i++) put(t, (rng() * 16) | 0, (rng() * 16) | 0, c(74 + rng() * 12), c(50 + rng() * 10), c(30));
  }

  { const t = T.LOG_TOP;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      const d0 = Math.sqrt(dx * dx + dy * dy);
      const ring = (Math.floor(d0) % 2 === 0 ? 14 : -12);
      const edge = d0 > 6.8 ? -55 : ring + (rng() - 0.5) * 12;
      put(t, x, y, c(168 + edge), c(130 + edge * 0.9), c(84 + edge * 0.8));
    }
    put(t, 7, 7, c(120), c(92), c(58)); put(t, 8, 7, c(120), c(92), c(58));
    put(t, 7, 8, c(120), c(92), c(58)); put(t, 8, 8, c(120), c(92), c(58));
  }

  { const t = T.LEAVES;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (rng() < 0.18) continue; // holes (cutout pass)
      const dark = rng() < 0.35;
      const d = (rng() - 0.5) * 26 - (dark ? 18 : 0);
      put(t, x, y, c(64 + d), c(132 + d * 1.3), c(50 + d));
    }
    for (let i = 0; i < 8; i++) put(t, (rng() * 16) | 0, (rng() * 16) | 0, c(96), c(172), c(84));
  }

  { const t = T.PLANKS;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const seam = (y % 4 === 3) ? -46 : 0;
      const board = (Math.floor(y / 4) % 2 === 0 ? 8 : -7);
      const d = seam + board + (rng() - 0.5) * 14;
      put(t, x, y, c(186 + d), c(152 + d * 0.9), c(98 + d * 0.75));
    }
    for (let b = 0; b < 4; b++) { const ex = b % 2 === 0 ? 3 : 12; put(t, ex, b * 4 + 1, c(110), c(86), c(52)); }
  }

  const oreTile = (t: number, col: RGB, spots: number) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = (rng() - 0.5) * 18;
      put(t, x, y, c(136 + d), c(140 + d), c(144 + d));
    }
    for (let s = 0; s < spots; s++) {
      let x = 2 + ((rng() * 10) | 0), y = 2 + ((rng() * 10) | 0);
      for (let k = 0; k < 6; k++) {
        const d = (rng() - 0.5) * 28;
        put(t, x & 15, y & 15, c(col[0] + d), c(col[1] + d), c(col[2] + d));
        x += rng() < 0.5 ? 1 : (rng() < 0.75 ? -1 : 0);
        y += rng() < 0.4 ? 1 : (rng() < 0.65 ? -1 : 0);
      }
    }
  };
  oreTile(T.COAL_ORE, [40, 42, 48], 4);
  oreTile(T.IRON_ORE, [232, 180, 142], 4);

  { const t = T.TABLE_TOP;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const seam = (y % 4 === 3) ? -40 : 0;
      const d = seam + (rng() - 0.5) * 12;
      put(t, x, y, c(184 + d), c(150 + d * 0.9), c(96 + d * 0.75));
    }
    for (let i = 0; i < 16; i++) {
      put(t, i, 2, c(96), c(70), c(40)); put(t, i, 13, c(96), c(70), c(40));
      put(t, 2, i, c(96), c(70), c(40)); put(t, 13, i, c(96), c(70), c(40));
    }
  };

  { const t = T.TABLE_SIDE;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const seam = (y % 4 === 3) ? -40 : 0;
      const d = seam + (rng() - 0.5) * 14;
      put(t, x, y, c(184 + d), c(150 + d * 0.9), c(96 + d * 0.75));
    }
    put(t, 4, 7, c(92), c(68), c(38)); put(t, 5, 7, c(92), c(68), c(38)); put(t, 5, 6, c(92), c(68), c(38));
    put(t, 10, 5, c(92), c(68), c(38)); put(t, 11, 5, c(92), c(68), c(38));
    put(t, 10, 6, c(92), c(68), c(38)); put(t, 10, 7, c(92), c(68), c(38));
    for (let y = 9; y < 12; y++) put(t, 10, y, c(74), c(52), c(30));
  }

  const furnaceTile = (t: number, lit: boolean) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const cell = (Math.floor(x / 5) * 3 + Math.floor(y / 5)) % 7;
      const base = 104 + (cell * 9) % 26;
      const d = base + (rng() - 0.5) * 18 - ((x % 5 === 0 || y % 5 === 0) ? 26 : 0);
      put(t, x, y, c(d), c(d + 3), c(d + 6));
    }
    for (let y = 8; y < 14; y++) for (let x = 5; x < 12; x++) {
      if (x === 5 || x === 11 || y === 8) { put(t, x, y, c(56), c(58), c(64)); continue; }
      if (lit) {
        const f = rng();
        put(t, x, y, c(255), c(f < 0.4 ? 190 + rng() * 65 : 80 + rng() * 50), c(f < 0.45 ? 70 : 12));
      } else {
        put(t, x, y, c(36 + rng() * 10), c(32 + rng() * 8), c(30));
      }
    }
  };
  furnaceTile(T.FURNACE_OFF, false);
  furnaceTile(T.FURNACE_ON, true);

  { const t = T.GLASS;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (x === 0 || y === 0 || x === 15 || y === 15) { put(t, x, y, c(216 + rng() * 30), c(238 + rng() * 16), 255, 205); continue; }
      if (((x - y * 2) % 17 === 0) || ((x + y) % 19 === 5 && rng() < 0.4)) put(t, x, y, c(235), c(248), 255, 100);
    }
    for (let i = 3; i < 9; i++) put(t, i, 15 - i, c(244), c(252), 255, 130);
  }

  { const t = T.TORCH;
    for (let y = 6; y < 15; y++) { put(t, 7, y, c(120 + (y % 3) * 8), c(86 + (y % 3) * 6), c(48)); put(t, 8, y, c(92 + (y % 3) * 6), c(64), c(38)); }
    put(t, 7, 5, c(255), c(196), c(80)); put(t, 8, 5, c(255), c(164), c(50));
    put(t, 7, 4, c(255), c(236), c(120)); put(t, 8, 4, c(255), c(206), c(84));
    put(t, 7, 3, c(255), c(250), c(190)); put(t, 8, 3, c(255), c(240), c(150));
    put(t, 7, 6, c(255), c(140), c(40)); put(t, 8, 6, c(235), c(120), c(30));
  }

  { const t = T.BEDROCK;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const n = Math.sin(x * 5.3 + y * 7.9) * Math.cos(y * 4.1 - x * 2.3);
      const d = n > 0.4 ? 36 : (n < -0.5 ? -28 : (rng() - 0.5) * 16);
      put(t, x, y, c(92 + d), c(94 + d), c(100 + d));
    }
  }

  { const t = T.TALLGRASS;
    const blades: Array<[number, number, boolean]> = [[2, 10, false], [5, 13, true], [8, 14, false], [10, 12, true], [13, 9, false]];
    blades.forEach((b, bi) => {
      const bx = b[0], hgt = b[1], lean = b[2];
      const g0 = 138 + (bi * 17) % 26;
      for (let y = 15 - hgt; y < 16; y++) {
        const top = (y - (15 - hgt)) >= hgt - 3;
        const lx = lean && top ? 1 : 0;
        put(t, bx + lx, y, c(74 + (bi % 2) * 12), c(g0), c(56));
        if (top) put(t, bx + lx + (lean ? 1 : 0), y, c(88), c(g0 + 14 > 255 ? 255 : g0 + 14), c(64));
      }
    });
  }

  { const t = T.WOOL;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = (rng() - 0.5) * 30 + ((x + y) % 4 === 0 ? -8 : 6);
      put(t, x, y, c(232 + d), c(228 + d), c(216 + d));
    }
  }

  // ---- item icons -----------------------------------------------------------

  { const t = T.STICK_I;
    for (let s = 0; s < 10; s++) {
      const x = 3 + s, y = 12 - s;
      const d = (rng() - 0.5) * 14;
      put(t, x, y, c(152 + d), c(108 + d * 0.9), c(64));
      if (s % 3 === 1) put(t, x + 1, y, c(124), c(88), c(50));
      if (s % 3 === 2) put(t, x, y + 1, c(124), c(88), c(50));
    }
  }

  { const t = T.COAL_I;
    for (let y = 4; y < 13; y++) for (let x = 3; x < 13; x++) {
      const dx = x - 7.5, dy = y - 8;
      if (Math.sqrt(dx * dx * 1.15 + dy * dy) > 4.6) continue;
      const d = (rng() - 0.5) * 24 - (y > 8 ? 12 : 6);
      put(t, x, y, c(52 + d), c(54 + d), c(60 + d));
    }
    put(t, 5, 6, c(96), c(100), c(112)); put(t, 6, 5, c(96), c(100), c(112));
    put(t, 9, 7, c(84), c(88), c(100)); put(t, 10, 6, c(78), c(82), c(94));
  }

  { const t = T.INGOT_I;
    const rows: Array<[number, number]> = [[4, 12], [3, 12], [2, 13], [2, 13], [3, 12], [4, 11]];
    rows.forEach(([a, b2], ri) => {
      const y = 6 + ri;
      for (let x = a; x <= b2; x++) {
        let r: number, g: number, bl: number;
        if (ri === 0) { r = 238; g = 243; bl = 250; }
        else if (ri === 5) { r = 118; g = 124; bl = 136; }
        else { const d = (rng() - 0.5) * 26; r = 198 + d; g = 204 + d; bl = 212 + d; }
        put(t, x, y, c(r), c(g), c(bl));
      }
    });
    for (let x = 5; x <= 11; x++) put(t, x, 12, c(92), c(98), c(110));
    put(t, 4, 6, c(255), c(255), c(255));
  }

  { const t = T.MEAT_I;
    for (let y = 4; y < 13; y++) for (let x = 3; x < 13; x++) {
      const dx = x - 7.5, dy = y - 8;
      if (Math.sqrt(dx * dx * 1.1 + dy * dy) > 4.6) continue;
      const d = (rng() - 0.5) * 22 - 8;
      put(t, x, y, c(200 + d), c(104 + d * 0.7), c(88 + d * 0.6));
    }
    put(t, 5, 6, c(243), c(227), c(212)); put(t, 9, 5, c(243), c(227), c(212));
    put(t, 11, 9, c(243), c(227), c(212)); put(t, 6, 11, c(243), c(227), c(212));
  }

  { const t = T.CMEAT_I;
    for (let y = 4; y < 13; y++) for (let x = 3; x < 13; x++) {
      const dx = x - 7.5, dy = y - 8;
      if (Math.sqrt(dx * dx * 1.1 + dy * dy) > 4.6) continue;
      const d = (rng() - 0.5) * 20 - 6;
      put(t, x, y, c(150 + d), c(96 + d * 0.8), c(62 + d * 0.7));
    }
    put(t, 4, 6, c(188), c(128), c(86)); put(t, 7, 5, c(188), c(128), c(86)); put(t, 10, 7, c(188), c(128), c(86));
    put(t, 6, 8, c(74), c(46), c(30)); put(t, 8, 7, c(74), c(46), c(30));
    put(t, 9, 10, c(74), c(46), c(30)); put(t, 6, 10, c(74), c(46), c(30));
  }

  const headPick = (t: number, body: RGB, edgeC: RGB) => {
    for (let x = 2; x <= 13; x++) {
      const d = Math.abs(x - 7.5);
      if (d > 6) continue;
      const yTop = 2 + (d > 4 ? Math.min(3, (d - 4) | 0) : 0);
      const yBot = yTop + (d < 2 ? 3 : 2);
      for (let y = yTop; y < yBot && y < 16; y++) {
        const j = (rng() - 0.5) * 24;
        put(t, x, y, c(body[0] + j), c(body[1] + j), c(body[2] + j));
      }
    }
    for (let y = 4; y < 7; y++) {
      put(t, 2, y, c(edgeC[0]), c(edgeC[1]), c(edgeC[2]));
      put(t, 13, y, c(edgeC[0]), c(edgeC[1]), c(edgeC[2]));
    }
    for (let s = 0; s < 9; s++) {
      const x = 6 + ((s * 3) >> 3), y = 13 - s;
      const j = (rng() - 0.5) * 14;
      put(t, x, y, c(142 + j), c(98 + j * 0.8), c(56));
      put(t, x + 1, y, c(104), c(72), c(40));
    }
  };

  const headAxe = (t: number, body: RGB) => {
    for (let s = 0; s < 12; s++) {
      const x = 11 - ((s * 5) >> 3), y = 13 - s;
      put(t, x, y, c(142 + (rng() - 0.5) * 14), c(98), c(56));
    }
    for (let y = 2; y < 7; y++) for (let x = 3; x < 8; x++) {
      if ((x === 7 && y < 4) || (x === 3 && y > 5)) continue;
      const j = (rng() - 0.5) * 26 + (x < 5 ? 18 : -4);
      put(t, x, y, c(body[0] + j), c(body[1] + j), c(body[2] + j));
    }
    put(t, 3, 3, c(250), c(250), c(252)); put(t, 4, 3, c(240), c(242), c(246));
  };

  const bladeSword = (t: number, body: RGB) => {
    for (let y = 1; y < 9; y++) {
      const j = (rng() - 0.5) * 24;
      put(t, 7, y, c(body[0] + j), c(body[1] + j), c(body[2] + j));
      put(t, 8, y, c(Math.max(50, body[0] - 46 + j)), c(Math.max(50, body[1] - 42 + j)), c(Math.max(60, body[2] - 38 + j)));
    }
    put(t, 7, 1, c(250), c(252), c(255));
    for (let x = 4; x <= 11; x++) put(t, x, 9, c(126 + (rng() - 0.5) * 14), c(88), c(46));
    for (let y = 10; y < 13; y++) { put(t, 7, y, c(128), c(90), c(52)); put(t, 8, y, c(104), c(72), c(40)); }
    put(t, 7, 13, c(86), c(58), c(32)); put(t, 8, 13, c(86), c(58), c(32));
  };

  const WOODC: RGB = [172, 130, 82];
  const STONEC: RGB = [154, 160, 166];
  const IRONC: RGB = [223, 228, 234];
  headPick(T.WPICK_I, WOODC, [120, 86, 48]);
  headPick(T.SPICK_I, STONEC, [95, 100, 106]);
  headPick(T.IPICK_I, IRONC, [150, 158, 168]);
  headAxe(T.WAXE_I, WOODC);
  headAxe(T.SAXE_I, STONEC);
  headAxe(T.IAXE_I, IRONC);
  bladeSword(T.WSWORD_I, WOODC);
  bladeSword(T.SSWORD_I, STONEC);
  bladeSword(T.ISWORD_I, IRONC);

  // ---- mob skins ------------------------------------------------------------

  { const t = T.GLOOM;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let r = 58, g = 52, b = 84;
      const n = rng();
      if (n > 0.8) { r = 92; g = 86; b = 124; }
      else if (n < 0.18) { r = 30; g = 27; b = 48; }
      else { const d = (rng() - 0.5) * 36; r += d; g += d; b += d; }
      put(t, x, y, c(r), c(g), c(b));
    }
    put(t, 5, 6, c(18), c(16), c(30)); put(t, 11, 9, c(18), c(16), c(30)); put(t, 7, 12, c(18), c(16), c(30));
  }

  { const t = T.SHEEP;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let r = 238, g = 234, b = 224;
      const n = rng();
      if (n > 0.82) { r = 255; g = 254; b = 250; }
      else if (n < 0.16) { r = 198; g = 192; b = 180; }
      else { const d = (rng() - 0.5) * 34; r += d; g += d; b += d; }
      put(t, x, y, c(r), c(g), c(b));
    }
  }

  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  img.data.set(buf);
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** The painted atlas canvas (128x80), built once at module load. */
export const atlasCanvas: HTMLCanvasElement = buildAtlas();

/** UV rectangle for tile t, with a sub-pixel inset to avoid bleeding. */
export function tileUV(t: number): [number, number, number, number] {
  const col = t % ATLAS.cols;
  const row = Math.floor(t / ATLAS.cols);
  const e = 0.35 / W, ev = 0.35 / H;
  return [col / ATLAS.cols + e, row / ATLAS.rows + ev, (col + 1) / ATLAS.cols - e, (row + 1) / ATLAS.rows - ev];
}

/** Crisp inventory icon for any item id (block or tool). Cached. */
const iconCache = new Map<string, HTMLCanvasElement>();
export function itemIconCanvas(id: number, size = 34): HTMLCanvasElement {
  const key = id + ':' + size;
  const hit = iconCache.get(key);
  if (hit) return hit;
  const t = tileForItem(id);
  const col = t % ATLAS.cols, row = Math.floor(t / ATLAS.cols);
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const c2 = cv.getContext('2d')!;
  c2.imageSmoothingEnabled = false;
  c2.drawImage(atlasCanvas, col * 16, row * 16, 16, 16, 0, 0, size, size);
  iconCache.set(key, cv);
  return cv;
}

/** Average colour of a tile (for block-break particles). Cached. */
const colorCache = new Map<number, [number, number, number]>();
export function tileBaseColor(t: number): [number, number, number] {
  const hit = colorCache.get(t);
  if (hit) return hit;
  const col = t % ATLAS.cols, row = Math.floor(t / ATLAS.cols);
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) {
    const i = ((row * 16 + y) * W + (col * 16 + x)) * 4;
    if (buf[i + 3] > 80) { r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; n++; }
  }
  const out: [number, number, number] = n ? [(r / n) | 0, (g / n) | 0, (b / n) | 0] : [150, 150, 150];
  colorCache.set(t, out);
  return out;
}

/* ---------------- mining crack overlay ---------------- */

export const CRACK_STAGES = 5;
let crackCv: HTMLCanvasElement | null = null;

/** 80x16 canvas: five crack stages drawn left→right. Alpha = darkness to apply. */
export function crackAtlas(): HTMLCanvasElement {
  if (crackCv) return crackCv;
  const cv = document.createElement('canvas');
  cv.width = 80; cv.height = 16;
  const c2 = cv.getContext('2d')!;
  const img = c2.createImageData(80, 16);
  for (let s = 0; s < CRACK_STAGES; s++) {
    const rr = mulberry32(911 + s * 77);
    for (let a = 0; a < 2 + s; a++) {
      let x = 7.5 + (rr() - 0.5) * 3, y = 7.5 + (rr() - 0.5) * 3;
      let ang = rr() * Math.PI * 2;
      const steps = 4 + ((rr() * 4) | 0);
      for (let st = 0; st < steps; st++) {
        const xi = x | 0, yi = y | 0;
        if (xi >= 0 && xi < 16 && yi >= 0 && yi < 16) {
          const i = (yi * 80 + (s * 16 + xi)) * 4;
          img.data[i] = 0; img.data[i + 1] = 0; img.data[i + 2] = 0;
          if (img.data[i + 3] < 205) img.data[i + 3] = 205;
          if (rr() < 0.3) {
            const j = (yi * 80 + (s * 16 + ((xi + 1) & 15))) * 4;
            if (img.data[j + 3] < 170) img.data[j + 3] = 170;
          }
        }
        x += Math.cos(ang) * 1.5;
        y += Math.sin(ang) * 1.5;
        ang += (rr() - 0.5);
      }
    }
    if (s >= 3) {
      const fl = (s - 1) * 4;
      for (let i = 0; i < fl; i++) {
        const xi = (rr() * 16) | 0, yi = (rr() * 16) | 0;
        if (Math.abs(xi - 7.5) + Math.abs(yi - 7.5) < 8) {
          const k = (yi * 80 + (s * 16 + xi)) * 4;
          if (img.data[k + 3] < 150) img.data[k + 3] = 150;
        }
      }
    }
  }
  c2.putImageData(img, 0, 0);
  crackCv = cv;
  return cv;
}

/** UV rect for crack stage s (0..4). */
export function crackUV(s: number): [number, number, number, number] {
  const e = 0.5 / 80;
  return [s * 16 / 80 + e, 0.5 / 16, (s * 16 + 16) / 80 - e, 1 - 0.5 / 16];
}
