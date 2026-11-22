# Cyber Game

A tycoon-style cybersecurity simulator for the browser. Start in your dorm room, take on hustles and bug bounties, run AI agent businesses, defend your systems from attacks, and hire AI agents and pen testers as you grow.

## Status

Prototype: work hustles at the corner desk, carry the cash to your stash (the laundry basket), and watch the machine's heat. Buying gear comes next.

**Play:** https://zandercyber.github.io/cyber-game/ (after Pages is enabled)

## Controls

| Device | Move |
| --- | --- |
| Keyboard | WASD or arrow keys |
| Mouse | Click where to go, or click and drag to steer |
| Phone (landscape) | Tap where to go, or touch and drag to steer |

Tap/click-to-move finds a path around furniture.

## Run locally

Requires Node.js 22+.

```bash
npm install
npm run dev      # dev server with live reload
npm run build    # production build into dist/
```

Add `?debug` (or `#debug`) to the URL to see the walkable floor (green), blocked areas (red), interaction spots (yellow) and the player's feet (yellow dot). Debug keys: **B** fill empty plots, **R** clear plots, **M** +$100, **P** next power supply.

## Project structure

```
src/assets/      art: room backgrounds, stations, items, player sprite sheet
src/main.js      game setup (size, scaling, scenes)
src/scenes/      one scene per room (DormScene)
src/data/        room layouts (floor, obstacles, plots) and the item catalog
src/state/       shared game state: cash and power
src/scenes/UIScene.js  HUD: cash, power meter, fullscreen
src/systems/     player movement, joystick, collision and pathfinding
```

## Tech

- [Phaser 4](https://phaser.io/) game engine
- Vite for local development and minified builds (no source maps)
- GitHub Actions deploys to GitHub Pages on every merge to `main`
- The game checks `version.json` on load and when you return to the tab, and reloads itself into a newer deploy

## Workflow

- `main` is protected: every change lands through a pull request.
- No secrets in this repo. The game is a static site and needs no API keys.
- Dependabot opens monthly PRs for package and Actions updates.

## License

All rights reserved. No license is granted to copy, modify, or redistribute this code or its art.
