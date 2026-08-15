# CUBELAND

A playable browser Minecraft-like. Vite + TypeScript. Named CUBELAND.

This is a YouTube demo. A spinning cube or an empty WebGL clear-color is a fail.

Must-haves:
- `index.html` includes `<script type="module" src="/src/main.ts">`
- `src/main.ts` boots the game and sets `window.__CUBELAND_READY__ = true`
- First-person voxel world with a real render loop
- Pointer-lock look + WASD move + space jump + gravity
- Break (hold) and place (right click) with a visible hotbar 1-9
- E opens inventory. Crafting table recipes for planks, sticks, table, tools, torch
- Accelerated day/night. One hostile that appears at night
- Hide any boot canvas once the world is live
- HUD: crosshair, hotbar, health or hunger, time of day
- Art direction: chunky pixels, readable block colors, a title that feels like a game, not a CodePen

`npx tsc --noEmit` must stay green after every story.
