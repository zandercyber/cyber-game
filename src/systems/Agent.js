// An AI agent helper (Augustus, and the other types in src/data/agents.js).
// Agents float around the room on a cloud and, every time they finish
// something, pick the first thing on this list:
//   1. Out of energy (types that nap): stash any cash held, then nap ("resetting credits").
//   2. Holding cash: carry it to the hamper.
//   3. A cash pile at least half full: go scoop it up.
//   4. The best-paying machine he can use: go work it until it overheats or its
//      pile fills, then take the pile to the hamper.
//   5. Any cash pile at all.
//   6. Nothing to do: hover by the hamper (with a ⚡ bubble if the power is out).
// He skips fried, overheated, full or unpowered machines and the one you're at.
// He never resets the breaker, repairs, carries boxes or shops: that's your job.
// The scene keeps a list of agents (up to MAX_AGENTS); they never pick the same machine.

import { AGENT_TYPES } from '../data/agents.js';
import { DORM } from '../data/dorm.js';
import { findPath } from './pathfinding.js';
import { gameState } from '../state/GameState.js';

const HOVER = 16; // how far his cloud floats above the floor
const FONT = 'system-ui, sans-serif';
const PARK = { x: 240, y: 610 }; // where agents hover when there's nothing to do (side by side)

export class Agent {
  /**
   * scene: the DormScene (stations, navGrid, player). type: a key of AGENT_TYPES.
   * levels: that type's shop upgrade levels. awake / nap / carried: restored from a save.
   */
  constructor(scene, { type, name, x, y, levels, awake = null, nap = 0, carried = 0, arriving = false }) {
    this.scene = scene;
    this.type = type;
    this.cfg = AGENT_TYPES[type];
    this.name = name;
    this.x = x;
    this.y = y;
    this.levels = { ...levels };
    this.stats = this.cfg.stats(this.levels);
    this.awake = awake ?? this.stats.awakeSeconds;
    this.nap = nap;
    this.carried = carried;
    this.state = nap > 0 ? 'sleeping' : 'idle';
    this.goal = null; // { kind: 'work' | 'collect' | 'stash' | 'park', station? }
    this.path = null;
    this.station = null; // the machine he's working
    this.vx = 0;
    this.vy = 0;
    this.thinkIn = 0;
    this.t = Math.random() * 10;
    this.zTimer = 0;

    this.shadow = scene.add.ellipse(x, y, 54, 14, 0x000000, 0.22);
    this.sprite = scene.add.sprite(x, y, this.cfg.texture, this.cfg.frames.front).setOrigin(0.5, 1).setScale(this.cfg.scale);
    this.bubble = scene.add.text(x, y, '⚡', { fontFamily: FONT, fontSize: '26px' }).setOrigin(0.5, 1).setVisible(false);
    this.label = scene.add.text(x, y, '', {
      fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#c4b5fd',
      backgroundColor: '#0b0e14cc', padding: { x: 6, y: 2 },
    }).setOrigin(0.5, 1).setVisible(false);
    this.stack = [];

    if (arriving) {
      // Floats in through the door.
      this.sprite.setAlpha(0);
      scene.tweens.add({ targets: this.sprite, alpha: 1, duration: 600 });
    }
  }

  setLevels(levels) {
    const before = this.stats.awakeSeconds;
    this.levels = { ...levels };
    this.stats = this.cfg.stats(this.levels);
    this.awake += this.stats.awakeSeconds - before; // an energy upgrade tops him up right away
  }

  get workRate() {
    return this.stats.workRate;
  }

  get payBonus() {
    return this.stats.payBonus;
  }

  /** The machine he's working right now, or null. */
  get workingStation() {
    return this.state === 'working' ? this.station : null;
  }

  /** One short line for the shop's Upgrades tab. */
  get status() {
    if (this.state === 'sleeping') return `Napping to reset credits: ${Math.ceil(this.nap)}s`;
    if (this.state === 'drowsy') return 'Getting sleepy…';
    if (this.state === 'working') return `Working: ${this.machineName(this.station)}`;
    if (this.goal?.kind === 'stash') return `Taking $${this.carried} to the hamper`;
    if (this.goal?.kind === 'collect') return 'Collecting a cash pile';
    if (this.goal?.kind === 'work') return `Heading to the ${this.machineName(this.goal.station)}`;
    return gameState.tripped ? 'Waiting for power' : 'Looking for work';
  }

  machineName(station) {
    const plot = this.scene.plots.find((p) => p.id === station?.plotId);
    return plot?.itemId ? this.scene.itemName(plot.itemId) : 'corner desk';
  }

  update(dt) {
    this.t += dt;
    if (this.state === 'sleeping') {
      this.nap -= dt;
      if (this.nap <= 0) {
        this.nap = 0;
        this.awake = this.stats.awakeSeconds;
        this.state = 'idle';
        this.float('Credits reset!', '#c4b5fd');
      }
    } else if (this.state === 'drowsy') {
      this.drowsyFor -= dt;
      if (this.drowsyFor <= 0) {
        this.state = 'sleeping';
        this.nap = this.cfg.napSeconds;
      }
    } else {
      if (this.cfg.naps) this.awake = Math.max(0, this.awake - dt);
      if (this.state === 'moving') this.followPath(dt);
      else if (this.state === 'working') this.keepWorking();
      else {
        this.thinkIn -= dt;
        if (this.thinkIn <= 0) {
          this.thinkIn = 0.4;
          this.think();
        }
      }
    }
    this.render(dt);
  }

  // ---------- Deciding ----------

  think() {
    if (this.tired) return this.carried > 0 ? this.goStash() : this.fallAsleep();
    if (this.carried > 0) return this.goStash();
    const pile = this.bestPile(this.cfg.collectAt);
    if (pile) return this.goTo('collect', pile);
    const machine = this.bestMachine();
    if (machine) return this.goTo('work', machine);
    const anyPile = this.bestPile(0);
    if (anyPile) return this.goTo('collect', anyPile);
    return this.park();
  }

  get tired() {
    return this.cfg.naps && this.awake <= 0;
  }

  /** Someone else (you, or another agent) is using or heading to this station. */
  taken(station) {
    const playerThere = station.near && !this.scene.player.moving;
    const otherAgent = this.scene.agents.some((a) => a !== this && (a.station === station || a.goal?.station === station));
    return playerThere || otherAgent;
  }

  canWork(station) {
    const h = station.hustle;
    return Boolean(station.plotId) && h.enabled && h.powered && !h.idle && !h.broken && !h.overheated && !h.pileFull
      && !this.taken(station);
  }

  bestMachine() {
    let best = null;
    for (const st of this.scene.stations) {
      if (!this.canWork(st)) continue;
      if (!best || st.hustle.payRate > best.hustle.payRate) best = st;
    }
    return best;
  }

  /** The biggest cash pile at least `fraction` full (any pile when 0). */
  bestPile(fraction) {
    let best = null;
    for (const st of this.scene.stations) {
      const h = st.hustle;
      if (h.pile <= 0 || h.pile < fraction * h.pileMax || this.taken(st)) continue;
      if (!best || h.pile > best.hustle.pile) best = st;
    }
    return best;
  }

  // ---------- Doing ----------

  goTo(kind, station, x = station.spot.x, y = station.spot.y) {
    const path = findPath(this.scene.navGrid, this.x, this.y, x, y);
    if (!path || path.length === 0) {
      this.thinkIn = 1; // try something else in a moment
      this.state = 'idle';
      return;
    }
    this.goal = { kind, station };
    this.path = path;
    this.state = 'moving';
  }

  goStash() {
    const { x, y } = DORM.stash;
    this.goTo('stash', null, x + 40, y + 40);
  }

  // Agents park side by side, so they don't stack on top of each other.
  park() {
    const x = PARK.x + Math.max(0, this.scene.agents.indexOf(this)) * 70;
    if (Math.hypot(this.x - x, this.y - PARK.y) < 30) {
      this.state = 'idle';
      return;
    }
    this.goTo('park', null, x, PARK.y);
  }

  fallAsleep() {
    this.goal = null;
    this.path = null;
    this.station = null;
    this.state = 'drowsy';
    this.drowsyFor = this.cfg.drowsySeconds;
    this.float('Yawn…', '#c4b5fd');
  }

  followPath(dt) {
    // Give up on a machine that stopped being usable on the way there.
    const { kind, station } = this.goal;
    if ((kind === 'work' && !this.canWork(station)) || (kind === 'collect' && (station.hustle.pile <= 0 || this.taken(station)))) {
      this.state = 'idle';
      this.goal = null;
      this.thinkIn = 0;
      return;
    }
    const target = this.path[0];
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.stats.moveSpeed * dt;
    if (dist <= step) {
      this.x = target.x;
      this.y = target.y;
      this.path.shift();
      if (this.path.length === 0) this.arrive();
      return;
    }
    this.vx = dx / dist;
    this.vy = dy / dist;
    this.x += this.vx * step;
    this.y += this.vy * step;
  }

  arrive() {
    const { kind, station } = this.goal;
    this.goal = null;
    this.path = null;
    this.state = 'idle';
    this.thinkIn = 0.15;
    if (kind === 'work' && this.canWork(station)) {
      this.station = station;
      this.state = 'working';
    } else if (kind === 'collect') {
      this.takePile(station);
    } else if (kind === 'stash' && this.carried > 0) {
      this.scene.stashFromHelper(this, this.carried);
      this.carried = 0;
    }
  }

  // Stops when the machine overheats, fills up, loses power or gets fried,
  // when you walk up to it, or when he runs out of energy.
  keepWorking() {
    const st = this.station;
    const gone = !this.scene.stations.includes(st); // shoveled
    const h = st?.hustle;
    const youAreHere = st?.near && !this.scene.player.moving;
    if (!gone && h.enabled && h.powered && !h.broken && !h.overheated && !h.pileFull && !youAreHere && !this.tired) return;
    this.station = null;
    this.state = 'idle';
    this.thinkIn = 0.2;
    if (!gone && !youAreHere) this.takePile(st);
  }

  takePile(station) {
    const amount = station.hustle.takePile();
    if (amount <= 0) return;
    this.carried += amount;
    this.float(`+$${amount}`, '#b8ffcf');
  }

  // ---------- Drawing ----------

  render(dt) {
    const sleeping = this.state === 'sleeping';
    const bob = sleeping ? Math.sin(this.t * 1.3) * 1.5 : Math.sin(this.t * 2.6) * 3;
    const top = this.y - HOVER + bob;
    this.sprite.setPosition(this.x, top).setDepth(this.y);
    this.shadow.setPosition(this.x, this.y).setDepth(this.y - 1).setScale(1 - bob / 40);

    const frames = this.cfg.frames;
    let frame = frames.front;
    let flip = false;
    if (sleeping) frame = frames.sleep[Math.floor(this.t / 0.7) % frames.sleep.length];
    else if (this.state === 'drowsy') frame = frames.drowsy;
    else if (this.state === 'working') frame = frames.side;
    else if (this.state === 'moving' && Math.abs(this.vx) > Math.abs(this.vy) * 0.6) {
      frame = frames.side;
      flip = this.vx < 0;
    }
    if (this.sprite.frame.name !== frame) this.sprite.setFrame(frame);
    this.sprite.setFlipX(flip);

    // Cash he's carrying, stacked over his head.
    const headY = top - this.sprite.displayHeight + (sleeping ? 42 : 0); // sleeping frames are shorter
    const wanted = this.carried > 0 ? Math.min(6, Math.ceil(this.carried / 10)) : 0;
    while (this.stack.length < wanted) this.stack.push(this.scene.add.image(0, 0, 'item-cash').setScale(0.8));
    while (this.stack.length > wanted) this.stack.pop().destroy();
    this.stack.forEach((s, i) => s.setPosition(this.x, headY - 6 - i * 7).setDepth(this.y + 0.5));

    // ⚡ while he waits for you to fix the power; a nap timer while asleep.
    const waiting = gameState.tripped && (this.state === 'idle' || this.goal?.kind === 'park');
    this.bubble.setVisible(waiting).setPosition(this.x + 24, headY - 2).setDepth(12450);
    this.label.setVisible(sleeping);
    if (sleeping) {
      this.label.setText(`Resetting credits ${Math.ceil(this.nap)}s`).setPosition(this.x, headY - 22).setDepth(12450);
      this.zTimer -= dt;
      if (this.zTimer <= 0) {
        this.zTimer = 0.9;
        this.floatZ(headY);
      }
    }
  }

  floatZ(y) {
    const z = this.scene.add.text(this.x + 14, y, 'z', {
      fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#dbeafe', stroke: '#0b0e14', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(12450);
    this.scene.tweens.add({
      targets: z, x: z.x + 14, y: y - 34, alpha: 0, scale: 1.5, duration: 1600, ease: 'Sine.out',
      onComplete: () => z.destroy(),
    });
  }

  float(text, color) {
    this.scene.floatText(text, this.x, this.y - 110, color);
  }

  destroy() {
    for (const o of [this.shadow, this.sprite, this.bubble, this.label, ...this.stack]) o.destroy();
    this.stack = [];
  }
}
