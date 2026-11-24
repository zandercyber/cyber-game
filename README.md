# Cyber Game

A tycoon-style cybersecurity simulator for the browser. Start in your dorm room, take on hustles and bug bounties, run AI agent businesses, defend your systems from attacks, and hire AI agents and pen testers as you grow.

## Status

Prototype: work hustles at the corner desk and carry the cash to your stash (the laundry basket). At $50 the laptop becomes the shop: order gear, carry the delivery box to an empty plot, and your new machines earn money (hustles, bug bounties, an AI agent business on the server rack, or AI model training on the **GPU rig**: the best pay in the dorm, but it's loud, draws 1,500 W and runs hot).

Power is the limit. Every machine draws watts, including the laptop (60 W). Go over your power supply and the lights flicker, then the breaker trips: the room goes dark and machines stop (the laptop keeps going on its battery), and the surge **fries** a machine (two if you trip it again). Stand at the breaker panel to reset it, then stand at each fried machine to repair it. Buy bigger power supplies at the shop and carry the box to the panel. Stand at a machine and use the **shovel** button (tap twice) to dig it up for 25% of its price back.

**The neighbor:** machines being worked make noise (the GPU rig and server rack most). The louder the room, the sooner your neighbor loses patience: about every 5 minutes at Low noise, 3 at Medium, 2 at High, and twice as often during quiet hours at night. They bang on the wall halfway there, then show up knocking at your window: you get 10 seconds to walk up to every machine to switch it off. If anything is still running when the countdown ends, you pay a noise fine that doubles with each complaint ($50, $100, $200...). Once they leave, walk up to your machines to switch them back on.

**Day and night:** a clock next to your cash runs a full day every 10 minutes of play. From 10 PM to 6 AM it's night: the room gets darker and it's quiet hours, so your neighbor (trying to sleep) gets annoyed twice as fast.

**Foam panels:** order them in the shop's Gear tab (3 levels, one at a time) and carry the box to the bed. They go up on the wall above it, and each level makes noise bother your neighbor 10% less, so they come over a little less often.

**Repairs:** servers (the server rack, and the GPU rig) sometimes **crash** when they finish a job, more often when they're running hot: stand at a crashed server for 3 seconds to reboot it. PCs (the laptops and the workstation) get an **update** every few minutes: stand at the machine for 3 seconds to install it. Ignore it for a minute and the machine is **outdated** and pays 25% less until you update it. Agents never fix anything: that's your job.

**Fans:** buy a box fan in the shop's **Room** tab and walk the box up to a machine to clip it on (one fan per machine, $100). That machine heats up 40% slower and cools down 50% faster, but it's a little louder while you work it (+1 noise) and the fan draws 20 W. The shop now has a **Machines** tab and a **Room** tab (power, foam panels, fans).

**Security checks:** about 1 in 5 jobs you finish yourself pops up a cybersecurity question that matches the machine (help desk, web bugs, or AI security). Right answer: double pay. Wrong or too slow (15 s): the job fails. Every answer shows a one-line explanation, and you won't see a repeat until you've seen the whole set.

**AI agents** (the shop's **Agents** tab): run up to 2, any mix (the dorm is small). **Augustus** rides a cloud, works your machines (slower than you, best-paying first), carries their cash to the hamper, and naps for 45 seconds to "reset credits" when his energy runs out. After that he stays asleep until you walk up and wake him. The first costs $300 and each extra Augustus costs double the last. Upgrades (speed, profit, energy) apply to every agent of that type.

**Nero** ($6,000) is the high-risk, high-reward agent: he works at 80% of your speed for +50% pay and never naps, but about every 5 minutes he **goes rogue**, racing between machines and frying them. Stay right next to him for 3 seconds to contain him; he's quarantined for a minute, then goes back to work. His **stability** upgrade makes it happen less often.

**Your upgrades** (the shop's **You** tab): **carry limit** (you start holding up to $100; bigger piles take more than one trip), **speed** (+10% walking per level) and **work speed** (finish jobs +20% faster per level, up to 2x; agents work slower than you: Augustus 0.5x, Nero 0.8x, a bit more with their upgrades). 5 levels each.

**Play:** https://zandercyber.github.io/cyber-game/ (after Pages is enabled)

## Controls

| Device | Move |
| --- | --- |
| Keyboard | WASD or arrow keys |
| Mouse | Click where to go, or click and drag to steer |
| Phone (landscape) | Tap where to go, or touch and drag to steer |

Tap/click-to-move finds a path around furniture.

## Saving

Progress saves automatically in your browser (localStorage) every few seconds, when you leave or close the tab, and before the game updates itself. Nothing is sent anywhere. **New game** (bottom-left, tap twice) erases it. Saves are validated on load, so an edited or corrupted save can't break the game.

## Run locally

Requires Node.js 22+.

```bash
npm install
npm run dev      # dev server with live reload
npm run build    # production build into dist/
```

Add `?debug` (or `#debug`) to the URL to see the walkable floor (green), blocked areas (red), interaction spots (yellow) and the player's feet (yellow dot). Debug keys: **B** fill empty plots, **R** clear plots, **M** +$100, **P** next power supply, **U** unlock the shop, **D** deliver all orders now, **G** hire an Augustus now, **N** hire a Nero now, **X** Nero goes rogue now, **L** the neighbor comes over now, **Q** a security question on every job, **T** skip ahead 2 hours on the clock, **F** put up the next level of foam panels now, **C** crash a server now, **V** an update on every PC now, **K** a fan on every machine now.

## Project structure

```
src/assets/      art: room backgrounds, stations, items, player sprite sheet
src/main.js      game setup (size, scaling, scenes)
src/scenes/      one scene per room (DormScene)
src/data/        room layouts (floor, obstacles, plots) and the item catalog
src/state/       shared game state: cash and power
src/scenes/UIScene.js  HUD: cash, power meter, shovel, banners, fullscreen
src/ui/ShopPanel.js    the shop screen (Gear, Agents and You tabs)
src/ui/QuestionPanel.js  the security question card (questions in src/data/questions.js)
src/systems/Agent.js   AI agent helpers (types in src/data/agents.js, Augustus's numbers in src/data/augustus.js)
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
