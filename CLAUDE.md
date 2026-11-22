# Notes for Claude

## Working rules
- Never commit to `main`. Work on a branch and open a PR; Zander reviews and merges (often from his phone).
- Keep PRs small and focused. Explain changes in plain language in the PR body, with a short "how to test" list.
- No secrets, API keys or `.env` files. This is a public repo and a static site.
- Keep dependencies minimal (Phaser + Vite). Ask before adding new packages.
- Run `npm run build` before pushing; test in a headless browser with `?debug` when touching movement or layout.

## Art pipeline
- Art comes from Gemini on a flat magenta (#FF00FF) background; Claude cuts it out, snaps pixel grids and scales it.
- Each build writes `version.json`; `src/systems/updateCheck.js` reloads players into newer deploys (GitHub Pages caches pages ~10 min).
- Art lives in `src/assets/` and is loaded with `asset('folder/file.png')` so builds hash file names (no stale browser caches).
- Player sheet `src/assets/player/zander.png`: 32x52 frames, 4 columns, drawn at 2x.
  Rows: 0 idle (down, left, right, up), 1-4 walk down/left/right/up, 5-8 carry down/left/right/up, 9 work (back view).
- Augustus sheet `src/assets/augustus/augustus.png`: 20x26 frames drawn at 3x: 0 front, 1 side (faces right; flip for left), 2 drowsy (eyes off), 3-5 sleeping on his cloud. Cut from Zander's Gemini sheets, which use a 60-pixel-wide art grid (1376/60 = 22.93 px per art pixel).
- Rooms are 1376x768 isometric-style images; world coordinates match image pixels.
- Stations are separate sprites anchored at bottom-center with a floor `footprint` polygon (see `src/data/dorm.js`).

## Game direction (agreed so far)
- Money: hustles (active tasks at stations), bug bounties, idle stations running AI agent businesses.
- Defense events pop up; unfixed systems go down for a while.
- Real cybersecurity terms and tools.
- Hires: AI agents and pen testers. Augustus (`src/systems/Augustus.js`, numbers in `src/data/augustus.js`): hired in the shop's Upgrades tab, rides his cloud, works the best-paying usable machine at `workRate` (stations get `rate`/`bonus`/`helper` in `hustle.update`), takes piles to the hamper, naps 60 s when energy runs out. He never resets the breaker, repairs, carries boxes or shops. Skips fried/overheated/full/unpowered machines and the one the player is at. The scene keeps `this.agents` (a list) so more agents can be added later. Upgrades: speed, profit, energy (5 levels, price doubles).
- Currency is cash only; cash counts once stashed in the laundry basket by the bed.
- The dorm starts empty. The corner desk is the free starter workstation and the shop screen.
- Items live in `src/data/catalog.js` (price, watts, delivery time, footprint). Install with `placeItem(itemId, plotId)`, remove with `removeItem(plotId)`, then call `rebuildNavigation()`.
- Limits are POWER (upgradable power supply, meter in the HUD; over capacity trips the breaker) and HEAT (machines heat up with use and need a cooldown; fans attach to a machine to cool it).
- Power: `POWER_TIERS`/`POWER_ITEMS` in catalog.js. The shop offers only the next tier, one order at a time; the box goes to the breaker panel (`DORM.breaker`). The starter laptop draws `STARTER_LAPTOP_WATTS` (60). Over capacity for 1.2 s (lights flicker) trips the breaker (`gameState.tripped`): machines get `hustle.powered = false`, the room dims and flickers, the shop laptop stays on battery. Each trip fries 1 random machine (2 on a re-trip right after a reset; none in the first 5 s after loading): `hustle.broken`, smoke + dark tint, repaired by standing at it 3 s with power on. Light flicker patterns stay at 2 flashes per second or fewer (photosensitivity). Reset = stand still at the panel 1.5 s; if still overloaded it re-trips and you must step away before retrying. Installing power at the panel also resets it.
- Shop: the corner laptop does hustles until stashed cash reaches $50 (`SHOP_UNLOCK_CASH`), then becomes the shop (`src/ui/ShopPanel.js`). Safety net: if broke with no earning machine, the laptop does hustles again.
- Buying: order at the shop, box appears at the door after the item's delivery time, carry it onto an empty plot to install. Each item's `earns` config (catalog.js) creates a HustleStation: 'work' (stand at it) or 'idle' (runs alone; unused now, the server rack is a work machine). Shovel: HUD button when standing at an installed item, tap twice; `shovel(plotId)` removes it and puts 25% of the price (`SHOVEL_REFUND`) in your hands as cash. Use `orderable(id)` for anything that can be ordered (machines and power).
- Hustles: `src/data/hustles.js` (jobs, heat, pile cap) and `src/systems/HustleStation.js`. Standing still at a station works it; pay goes to a desk pile; leaving picks the pile up; the stash spot banks it.
- Security questions: `src/data/questions.js` (original, Zander-reviewed bank: helpdesk / web / ai, matched to the machine's jobs). When the player (never a helper) finishes a job, 1 in 5 (`QUESTION_CHANCE`) calls `DormScene.askQuestion`; the job waits (`hustle.awaiting`) for `answerQuestion`: right = double pay, wrong or 15 s timeout = job fails. No repeats until a group's bank is used up (`questionsSeen`, saved). Card UI: `src/ui/QuestionPanel.js`. Debug key Q: a question on every job.
- Saving: `src/state/save.js` (localStorage, versioned, validated on load). When you add game state, add it to `saveProgress()`/`restoreProgress()` in DormScene and to `readSave()` checks; bump VERSION if the shape changes.
- Maintenance: servers crash and PCs need updates; the player repairs them. Energy drinks give a speed boost. The player should always be busy.
- Prestige comes later. Finish the dorm section first.
