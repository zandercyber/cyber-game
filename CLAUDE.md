# Notes for Claude

## Working rules
- Never commit to `main`. Work on a branch and open a PR; Zander reviews and merges (often from his phone).
- Keep PRs small and focused. Explain changes in plain language in the PR body, with a short "how to test" list.
- No secrets, API keys or `.env` files. This is a public repo and a static site.
- Keep dependencies minimal (Phaser + Vite). Ask before adding new packages.
- Run `npm run build` before pushing; test in a headless browser with `?debug` when touching movement or layout.

## Art pipeline
- Art comes from Gemini on a flat magenta (#FF00FF) background; Claude cuts it out, snaps pixel grids and scales it.
- Player sheet `public/assets/player/zander.png`: 32x52 frames, 4 columns, drawn at 2x.
  Rows: 0 idle (down, left, right, up), 1-4 walk down/left/right/up, 5-8 carry down/left/right/up, 9 work (back view).
- Rooms are 1376x768 isometric-style images; world coordinates match image pixels.
- Stations are separate sprites anchored at bottom-center with a floor `footprint` polygon (see `src/data/dorm.js`).

## Game direction (agreed so far)
- Money: hustles (active tasks at stations), bug bounties, idle stations running AI agent businesses.
- Defense events pop up; unfixed systems go down for a while.
- Real cybersecurity terms and tools.
- Hires: AI agents and pen testers.
- Currency is cash only; cash counts once stashed in the laundry basket by the bed.
- The dorm starts empty. The corner desk is the free starter workstation and the shop screen.
- Items live in `src/data/catalog.js` (price, watts, delivery time, footprint). Install with `placeItem(itemId, plotId)`, remove with `removeItem(plotId)`, then call `rebuildNavigation()`.
- Limits are POWER (upgradable power supply, meter in the HUD; over capacity trips the breaker) and HEAT (machines heat up with use and need a cooldown; fans attach to a machine to cool it).
- Buying: order at the shop, box appears at the door after a delay (15s cheap to ~2min big), carry it to a plot. Shovel removes an item for 25% back.
- Maintenance: servers crash and PCs need updates; the player repairs them. Energy drinks give a speed boost. The player should always be busy.
- Prestige comes later. Finish the dorm section first.
