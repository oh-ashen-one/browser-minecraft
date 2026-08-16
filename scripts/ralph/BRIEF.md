# CUBELAND — design bible

A playable browser Minecraft-like. Vite + TypeScript. Named CUBELAND.
This is a YouTube demo. A spinning cube or an empty WebGL clear-color is a fail.

## The one-line vision

**Painted-desert voxel world at golden hour.** Not generic green-grass Minecraft — warm sandstone mesas, terracotta strata, teal sky. Every screenshot should look color-graded.

## Palette (use these exact values)

- Sky day: `#7FC8C4` (teal) → horizon `#F4D8A8` (pale sand)
- Sky dusk: `#F09A6A` (apricot) → `#8E4A6B` (dusty rose)
- Sky night: `#171A2E` (indigo) → horizon `#2E2440`; stars = 1px white dots
- Blocks: sand `#E0B77E`, sandstone `#CE9A5F`, terracotta `#B5623C`, dark strata `#7E4230`, rock `#6E5F55`, cactus-green `#5F8C4F`, wood `#8A5A33`, planks `#C48A4E`, torchglow `#FFB65C`
- Fog color always equals current sky horizon color — world melts into sky, no hard far-plane edge
- Night mob "the Husk": matte black `#0E0C12` body, two `#FFB65C` ember eyes — silhouette-first design

## Feel numbers (game juice — use these exact values)

- FOV 75°, sprint FOV kick to 82° over 150ms
- Head bob: ±0.05 blocks at 2.2Hz while walking, none in air
- Gravity 24 blocks/s², jump velocity 8.4 (≈1.25 block jump), terminal fall 40
- Break time 350-700ms by block hardness; punch-swing animation every 250ms while holding
- Break particles: 10-14 cubes of the block's color, 300ms life, gravity-affected
- Block place/break: 30ms screen-shake ≤1px, subtle
- Day cycle 120s full loop; torch = warm point light radius 6 blocks

## HUD & UI — the DUSK system (proven in Dusk Riders / Dusk Skaters)

- Panels: deep plum `#241535` at ~92% opacity, SKEWED 2-4° (parallelogram), 2px darker-plum border, hot-pink `#E13F7B` hard offset shadow (4px, NO blur). No border-radius, no glassmorphism.
- Display type (title, "PAUSED", death screen): heavy ITALIC ALL-CAPS, cream `#F5E3C0`, hard hot-pink drop shadow offset 4-6px no blur
- Label type: light weight, HUGE letterspacing (0.4em+), teal `#3FE0C5`, all-caps
- Data numerals (health, time, block counts): bold italic, gold `#F0C060`, tabular
- Key hints: "W A S D MOVE · SPACE JUMP" pattern — bold key, light action
- Crosshair: 5px plus-sign, white, 1px black outline
- Hotbar: 9 skewed plum slots bottom-center, selected slot thick `#F5842D` orange border
- Hearts/hunger: pixel-drawn on canvas (not emoji, not SVG icon libs)
- Title screen: "CUBELAND" huge cream-italic with pink hard shadow over the live world slowly panning at dusk; teal letterspaced sub-line "A POCKET WORLD — BUILT AT GOLDEN HOUR"; one orange skewed "CLICK TO PLAY" pulsing at 0.8Hz
- Pause/results screens: centered skewed panel, stat rows divided by 1px teal hairlines, right-aligned gold values

## Must-haves (unchanged)

- `index.html` includes `<script type="module" src="/src/main.ts">`
- `src/main.ts` boots the game and sets `window.__CUBELAND_READY__ = true`
- First-person voxel world with a real render loop
- Pointer-lock look + WASD move + space jump + gravity
- Break (hold) and place (right click) with a visible hotbar 1-9
- E opens inventory. Crafting table recipes for planks, sticks, table, tools, torch
- Accelerated day/night. One hostile (the Husk) that appears at night
- Hide any boot canvas once the world is live
- HUD: crosshair, hotbar, health or hunger, time of day
- Terrain: layered mesa strata (sand → sandstone → terracotta bands → rock) with 2-3 flat-topped mesas visible from spawn, scattered cacti — not a flat plane, not random noise soup

`npx tsc --noEmit` must stay green after every story.

## Rendering techniques (proven in reference games — implement these, they are cheap)

- **Vertex AO**: darken block-face corners where neighbors occlude (bake into vertex colors at mesh build). THE technique that makes voxels read as solid — non-negotiable for US-002.
- **Fog = sky horizon color**, always: world melts into sky, no hard far edge.
- **Aerial perspective**: distant mesas lerp toward the horizon color by distance.
- **Chunked greedy/merged meshes**, one draw per chunk — never one draw per block.
- **Day/night grading**: ambient light color follows the sky (day `#FFF4E0`, dusk `#F09A6A`, night `#2E3560`); torches are warm point lights that matter at night.
- **Hold 60fps by trading resolution, never features** (render-scale governor if needed).
