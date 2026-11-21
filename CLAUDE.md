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
- The dorm starts empty. Stations (`startOwned: false`) get added with `placeStation(id)` + `rebuildNavigation()` when unlocked.
- Prestige comes later. Finish the dorm section first.
