# Cyber Game

A tycoon-style cybersecurity simulator for the browser. Start in your dorm room, take on hustles and bug bounties, run AI agent businesses, defend your systems from attacks, and hire AI agents and pen testers as you grow.

## Status

Movement prototype: walk around the dorm room. No gameplay yet.

**Play:** https://zandercyber.github.io/cyber-game/ (after Pages is enabled)

## Controls

| Device | Move |
| --- | --- |
| Keyboard | WASD or arrow keys |
| Mouse | Click and drag anywhere |
| Phone | Touch and drag anywhere (landscape) |

## Run locally

Requires Node.js 22+.

```bash
npm install
npm run dev      # dev server with live reload
npm run build    # production build into dist/
```

Add `?debug` (or `#debug`) to the URL to see the walkable floor (green), blocked areas (red) and the player's feet (yellow dot).

## Project structure

```
public/assets/   art: room backgrounds, stations, player sprite sheet
src/main.js      game setup (size, scaling, scenes)
src/scenes/      one scene per room (DormScene)
src/data/        room layouts: floor shape, obstacles, station positions
src/systems/     player movement, joystick, collision helpers
```

## Tech

- [Phaser 4](https://phaser.io/) game engine
- Vite for local development and minified builds (no source maps)
- GitHub Actions deploys to GitHub Pages on every merge to `main`

## Workflow

- `main` is protected: every change lands through a pull request.
- No secrets in this repo. The game is a static site and needs no API keys.
- Dependabot opens monthly PRs for package and Actions updates.

## License

All rights reserved. No license is granted to copy, modify, or redistribute this code or its art.
