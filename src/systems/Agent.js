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
//
// Types with a `rogue` config (Nero) go rogue every few minutes: they race from
// machine to machine frying them until you stay right next to them for a few
// seconds. Then they're quarantined for a minute and go back to work.

import { AGENT_TYPES } from '../data/agents.js';
import { DORM } from '../data/dorm.js';
import { findPath } from './pathfinding.js';
import { gameState } from '../state/GameState.js';

const HOVER = 16; // how far his cloud floats above the floor
const FONT = 'system-ui, sans-serif';
const PARK = { x: 240, y: 610 }; // where agents hover when there's nothing to do (side by side)
const LOAD_GRACE = 5; // seconds after loading before a rogue agent can fry anything

export class Agent {
  /**
   * scene: the DormScene (stations, navGrid, player). type: a key of AGENT_TYPES.
   * levels: that type's shop upgrade levels. awake / nap / carried: restored from a save.
   */
  constructor(scene, {
    type, name, x, y, levels, awake = null, nap = 0, carried = 0, arriving = false, rogue = false, rogueIn = null, quarantine = 0,
  }) {
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

    // Going rogue (types with a rogue config).
    this.rogueCfg = this.cfg.rogue ?? null;
    this.rogueIn = rogueIn ?? this.nextRogueIn();
    this.catchProgress = 0;
    this.hackFor = 0;
    this.target = null; // the machine he's about to fry
    this.quarantine = quarantine;
    if (this.rogueCfg && quarantine > 0) this.state = 'quarantined';
    if (this.rogueCfg && rogue) this.state = 'rogue';
    this.ring = scene.add.graphics().setDepth(12440); // catch progress, quarantine field

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

  /** One short line for the shop's roster. */
  get status() {
    if (this.state === 'rogue') return 'ROGUE! Frying machines. Catch him!';
    if (this.state === 'quarantined') return `Quarantined: ${Math.ceil(this.quarantine)}s`;
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
    if (this.state === 'rogue') {
      this.updateRogue(dt);
    } else if (this.state === 'quarantined') {
      this.quarantine -= dt;
      if (this.quarantine <= 0) {
        this.quarantine = 0;
        this.state = 'idle';
        this.rogueIn = this.nextRogueIn();
        this.float('Back to work', '#5ff0ff');
      }
    } else if (this.state === 'sleeping') {
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
      if (this.rogueCfg && this.scene.playTime > LOAD_GRACE) {
        this.rogueIn -= dt;
        if (this.rogueIn <= 0) {
          this.goRogue();
          this.render(dt);
          return;
        }
      }
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
    return Boolean(station.plotId) && h.enabled && h.powered && !h.idle && !h.broken && !h.switchedOff && !h.overheated
      && !h.pileFull && !this.taken(station);
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
    if (this.stepAlongPath(this.stats.moveSpeed * dt)) this.arrive();
  }

  /** Moves along this.path by `step` pixels. Returns true on reaching the end. */
  stepAlongPath(step) {
    const target = this.path[0];
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= step) {
      this.x = target.x;
      this.y = target.y;
      this.path.shift();
      return this.path.length === 0;
    }
    this.vx = dx / dist;
    this.vy = dy / dist;
    this.x += this.vx * step;
    this.y += this.vy * step;
    return false;
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
    if (!gone && h.enabled && h.powered && !h.broken && !h.switchedOff && !h.overheated && !h.pileFull && !youAreHere && !this.tired) return;
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

  // ---------- Going rogue (Nero) ----------

  nextRogueIn() {
    const [low, high] = this.stats.rogueEvery ?? [Infinity, Infinity];
    return low + Math.random() * (high - low);
  }

  goRogue() {
    this.station = null; // walks off the job; its cash stays on the machine
    this.goal = null;
    this.path = null;
    this.target = null;
    this.hackFor = 0;
    this.catchProgress = 0;
    this.state = 'rogue';
    this.scene.sparks(this.x, this.y - 60);
    this.scene.events.emit('agent-rogue', this);
  }

  // Races between machines and fries each one, until you stay next to him long enough.
  updateRogue(dt) {
    const r = this.rogueCfg;
    const { player } = this.scene;
    const near = Math.hypot(player.x - this.x, player.y - this.y) < r.catchRange;
    this.catchProgress = near
      ? this.catchProgress + dt / r.catchSeconds
      : Math.max(0, this.catchProgress - r.catchDecay * dt);
    if (this.catchProgress >= 1) {
      this.contain();
      return;
    }

    const lost = this.target && (!this.scene.stations.includes(this.target) || this.target.hustle.broken);
    if (!this.target || lost) this.pickVictim();
    if (this.path?.length) {
      this.stepAlongPath(this.stats.moveSpeed * r.speed * dt);
      return;
    }
    if (!this.target) return; // wandering: picks a new spot next frame
    if (this.scene.playTime < LOAD_GRACE) return;
    this.hackFor += dt;
    if (this.hackFor >= r.hackSeconds) {
      const st = this.target;
      st.hustle.setBroken(true);
      const plot = this.scene.plots.find((p) => p.id === st.plotId);
      if (plot?.sprite) this.scene.sparks(plot.x, plot.sprite.y - plot.sprite.height / 2);
      this.scene.events.emit('agent-fried', this, st);
      this.target = null;
    }
  }

  // A random machine that still works; if none are left, wander to a random plot.
  pickVictim() {
    this.hackFor = 0;
    const victims = this.scene.stations.filter((st) => st.plotId && !st.hustle.broken);
    this.target = victims.length ? victims[Math.floor(Math.random() * victims.length)] : null;
    const spot = this.target?.spot ?? this.scene.plots[Math.floor(Math.random() * this.scene.plots.length)];
    const y = this.target ? spot.y : spot.y + 72;
    this.path = findPath(this.scene.navGrid, this.x, this.y, spot.x, y) ?? [];
  }

  contain() {
    this.state = 'quarantined';
    this.quarantine = this.rogueCfg.quarantineSeconds;
    this.target = null;
    this.path = null;
    this.catchProgress = 0;
    this.float('Contained!', '#5ff0ff');
    this.scene.events.emit('agent-contained', this);
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
    const rogue = this.state === 'rogue';
    const sideways = Math.abs(this.vx) > Math.abs(this.vy) * 0.6;
    if (rogue) {
      const moving = this.path?.length > 0;
      frame = moving && sideways ? frames.rogueSide : frames.rogueFront;
      flip = moving && sideways && this.vx < 0;
    } else if (this.state === 'quarantined') frame = frames.front;
    else if (sleeping) frame = frames.sleep[Math.floor(this.t / 0.7) % frames.sleep.length];
    else if (this.state === 'drowsy') frame = frames.drowsy;
    else if (this.state === 'working') frame = frames.side;
    else if (this.state === 'moving' && Math.abs(this.vx) > Math.abs(this.vy) * 0.6) {
      frame = frames.side;
      flip = this.vx < 0;
    }
    if (this.sprite.frame.name !== frame) this.sprite.setFrame(frame);
    this.sprite.setFlipX(flip);
    if (this.state === 'quarantined') this.sprite.setTint(0x7dd3fc);
    else this.sprite.clearTint();
    this.shadow.fillColor = rogue ? 0xdc2626 : 0x000000;

    // Cash he's carrying, stacked over his head.
    const headY = top - this.sprite.displayHeight + (sleeping ? 42 : 0); // sleeping frames are shorter
    const wanted = this.carried > 0 ? Math.min(6, Math.ceil(this.carried / 10)) : 0;
    while (this.stack.length < wanted) this.stack.push(this.scene.add.image(0, 0, 'item-cash').setScale(0.8));
    while (this.stack.length > wanted) this.stack.pop().destroy();
    this.stack.forEach((s, i) => s.setPosition(this.x, headY - 6 - i * 7).setDepth(this.y + 0.5));

    // ⚡ while he waits for you to fix the power; a nap timer while asleep.
    const waiting = gameState.tripped && (this.state === 'idle' || this.goal?.kind === 'park');
    this.bubble.setVisible(waiting).setPosition(this.x + 24, headY - 2).setDepth(12450);
    this.renderRogue(top, headY);
    this.label.setVisible(sleeping || rogue || this.state === 'quarantined');
    if (rogue) {
      const text = this.catchProgress > 0 ? `Containing ${Math.floor(this.catchProgress * 100)}%` : 'ROGUE! Catch him';
      this.label.setText(text).setColor(this.catchProgress > 0 ? '#5ff0ff' : '#fca5a5').setPosition(this.x, headY - 6).setDepth(12450);
    } else if (this.state === 'quarantined') {
      this.label.setText(`Quarantined ${Math.ceil(this.quarantine)}s`).setColor('#7dd3fc').setPosition(this.x, headY - 6).setDepth(12450);
    } else if (sleeping) {
      this.label.setColor('#c4b5fd');
      this.label.setText(`Resetting credits ${Math.ceil(this.nap)}s`).setPosition(this.x, headY - 22).setDepth(12450);
      this.zTimer -= dt;
      if (this.zTimer <= 0) {
        this.zTimer = 0.9;
        this.floatZ(headY);
      }
    }
  }

  // A ring that fills while you contain him; a containment field while quarantined.
  renderRogue(top, headY) {
    const g = this.ring;
    g.clear();
    if (this.state === 'rogue') {
      g.lineStyle(3, 0xf87171, 0.5 + 0.3 * Math.sin(this.t * 8));
      g.strokeEllipse(this.x, this.y, this.rogueCfg.catchRange * 1.6, this.rogueCfg.catchRange * 0.7);
      if (this.catchProgress > 0) {
        g.lineStyle(5, 0x5ff0ff, 1);
        g.beginPath();
        g.arc(this.x, top - this.sprite.displayHeight / 2, 46, -Math.PI / 2, -Math.PI / 2 + this.catchProgress * Math.PI * 2);
        g.strokePath();
      }
    } else if (this.state === 'quarantined') {
      const w = this.sprite.displayWidth + 16;
      const h = top - headY + 16;
      g.fillStyle(0x38bdf8, 0.12);
      g.fillRoundedRect(this.x - w / 2, headY - 8, w, h, 8);
      g.lineStyle(2, 0x7dd3fc, 0.7 + 0.2 * Math.sin(this.t * 3));
      g.strokeRoundedRect(this.x - w / 2, headY - 8, w, h, 8);
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
    for (const o of [this.shadow, this.sprite, this.bubble, this.label, this.ring, ...this.stack]) o.destroy();
    this.stack = [];
  }
}
