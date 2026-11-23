import * as Phaser from 'phaser';
import { DORM } from '../data/dorm.js';
import {
  ITEMS, POWER_TIERS, POWER_ITEMS, SMALL_IMAGES, SHOVEL_REFUND, STARTER_LAPTOP_WATTS, orderable,
} from '../data/catalog.js';
import { makeWalkableCheck, translatePolygon, centerY, pointInPolygon } from '../systems/geometry.js';
import { Joystick } from '../systems/Joystick.js';
import { Player, createPlayerAnimations } from '../systems/Player.js';
import { DEBUG } from '../systems/debug.js';
import { buildGrid, findPath } from '../systems/pathfinding.js';
import { gameState } from '../state/GameState.js';
import { asset } from '../systems/assets.js';
import { HustleStation } from '../systems/HustleStation.js';
import {
  HELPDESK_JOBS, BOUNTY_JOBS, AGENT_JOBS, HEAT, STARTER_DESK_PILE_MAX, SHOP_UNLOCK_CASH,
} from '../data/hustles.js';
import { readSave, writeSave } from '../state/save.js';
import { Agent } from '../systems/Agent.js';
import { Neighbor } from '../systems/Neighbor.js';
import {
  AGENT_TYPES, AGENT_TYPE_IDS, AGENT_LEVEL_MAX, MAX_AGENTS, agentName, hirePrice, isAgentType, noAgentLevels,
} from '../data/agents.js';
import { QUESTIONS, QUESTION_CHANCE, QUESTION_GROUPS, groupForJobs } from '../data/questions.js';
import { PLAYER_UPGRADES, PLAYER_MAX_LEVEL, playerStats, noPlayerLevels } from '../data/playerUpgrades.js';

const ACCENT = 0x5ff0ff;
const FONT = 'system-ui, sans-serif';
const JOB_LISTS = { helpdesk: HELPDESK_JOBS, bounty: BOUNTY_JOBS, agents: AGENT_JOBS };
// Where delivery boxes land, relative to the delivery spot by the door.
const BOX_OFFSETS = [[0, 12], [-58, 32], [58, 32], [-30, 62], [30, 62], [0, 92]];
const BOX_REACH = 52;
const DOOR_DROP = 60; // walk this close to the door spot with a box to set it back down
const DOOR_LEAVE = 140; // ...after first walking at least this far away (so you don't drop it as you pick it up)
const TRIP_DELAY = 1.2; // seconds over the limit (lights flickering) before the breaker trips
const RESET_SECONDS = 1.5; // how long you stand at the panel to reset it
const DIM = 0.32; // how dark the room gets while the power is out
const LOAD_GRACE = 5; // seconds: a save that's over the limit trips on load, but fries nothing
// Light flicker patterns: [ms from start, darkness]. Kept to 2 flashes a
// second at most, so the flicker stays safe for players sensitive to flashing.
const BROWNOUT = [[0, 0.22], [160, 0.03], [600, 0.26], [760, 0.03]]; // over the limit, about to trip
const OUTAGE_FLICKER = [[0, 0.14], [120, DIM], [330, 0.2], [430, DIM]]; // tripped: lights try to come on
const LIGHTS_ON = [[0, 0.04], [90, 0.2], [260, 0]]; // reset: lights stutter back on
const stepAt = (steps, t) => steps.reduce((value, [ms, alpha]) => (t >= ms ? alpha : value), steps[0][1]);
const isPower = (id) => typeof id === 'string' && Object.hasOwn(POWER_ITEMS, id);

export class DormScene extends Phaser.Scene {
  constructor() {
    super('DormScene');
  }

  preload() {
    this.load.image(DORM.background, asset('rooms/dorm.jpg'));
    this.load.spritesheet('player', asset('player/zander.png'), { frameWidth: 32, frameHeight: 52 });
    this.load.spritesheet('augustus', asset('augustus/augustus.png'), { frameWidth: 20, frameHeight: 26 });
    this.load.spritesheet('nero', asset('nero/nero.png'), { frameWidth: 28, frameHeight: 30 });
    this.load.spritesheet('neighbor', asset('neighbor/neighbor.png'), { frameWidth: 38, frameHeight: 52 });
    this.load.image('window-open', asset('neighbor/window-open.png'));
    this.load.image('window-sky', asset('neighbor/window-sky.png'));
    for (const [id, item] of Object.entries(ITEMS)) this.load.image(`station-${id}`, asset(item.file));
    for (const [key, file] of Object.entries(SMALL_IMAGES)) this.load.image(key, asset(file));
  }

  create() {
    this.add.image(0, 0, DORM.background).setOrigin(0).setDepth(-10000);

    // Pixel art stays crisp when scaled up; the painted room stays smooth.
    this.textures.get('player').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get('augustus').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get('nero').setFilter(Phaser.Textures.FilterMode.NEAREST);

    // Everything feet can't enter. Installing an item adds its footprint here,
    // and the walk check below always reads the current list.
    this.blocked = [...Object.values(DORM.obstacles)];
    const isWalkable = makeWalkableCheck(DORM.floor, this.blocked);

    createPlayerAnimations(this);
    const start = DORM.playerStart;
    this.player = new Player(this, start.x, start.y, isWalkable, start.facing);

    // Machines that earn money. The corner desk is the first one.
    this.stations = [];
    this.deskStation = this.addStation({
      id: 'starterDesk',
      spot: DORM.starterDesk,
      hustle: new HustleStation(this, {
        ...DORM.starterDeskHustle,
        hustles: HELPDESK_JOBS,
        heat: HEAT.starterDesk,
        pileMax: STARTER_DESK_PILE_MAX,
        group: 'helpdesk',
      }),
    });

    // Plots start empty; bought items get installed into them.
    this.plots = DORM.plots.map((def) => ({ ...def, itemId: null, sprite: null, footprint: null, station: null }));
    for (const plot of this.plots) plot.outline = this.drawPlotOutline(plot);
    this.rebuildNavigation();

    // Places you can walk up to and use.
    this.spots = [
      this.addSpot('stash', DORM.stash, 'Stash', 'item-cash'),
      this.addSpot('starterDesk', DORM.starterDesk, 'Work', null, { hiddenWhenNear: true }),
      // Labeled when you're next to it, when it trips, or when you carry a power box.
      this.addSpot('breaker', DORM.breaker, 'Breaker', null, { hiddenWhenFar: true }),
    ];
    this.setupBreaker();

    this.keys = this.input.keyboard.addKeys({
      w: 'W', a: 'A', s: 'S', d: 'D',
      up: 'UP', left: 'LEFT', down: 'DOWN', right: 'RIGHT',
    });
    this.joystick = new Joystick(this, {
      onTap: (x, y) => this.setMoveTarget(x, y),
      isBlocked: (pointer) => this.scene.get('UIScene')?.isOverButton(pointer) ?? false,
    });
    this.moveTarget = null;
    // Floor ring that marks where a tap sent you.
    this.targetMarker = this.add.ellipse(0, 0, 40, 20)
      .setStrokeStyle(3, ACCENT, 0.9)
      .setDepth(-5000)
      .setVisible(false);

    // What you're holding (cash or one box), orders on the way, boxes at the door.
    this.carried = 0;
    this.carryStack = [];
    this.playerLevels = noPlayerLevels(); // carry limit and speed, bought in the shop
    // How much cash you're holding, shown over your head.
    this.carryLabel = this.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#b8ffcf', stroke: '#0b0e14', strokeThickness: 4,
    }).setOrigin(0.5, 1).setDepth(12100).setVisible(false);
    this.carryBox = null;
    this.leftDoor = true; // walked away from the door since the last box pickup / drop-off
    this.orders = [];
    this.boxes = [];
    this.shopOpen = false;
    this.events.on('spot-enter', (id) => { if (id === 'stash') this.stashCash(); });

    // The laptop becomes the shop once you've stashed enough cash.
    gameState.on('cash', this.checkShopUnlock, this);
    this.events.once('shutdown', () => gameState.off('cash', this.checkShopUnlock, this));

    // Security questions: the one on screen, and which ones you've seen (no repeats).
    this.question = null;
    this.questionChance = QUESTION_CHANCE;
    this.questionsSeen = Object.fromEntries(Object.keys(QUESTIONS).map((g) => [g, []]));

    // AI agent helpers: up to MAX_AGENTS, any mix of types. Agents of a type share upgrade levels.
    this.agents = [];
    this.arrivals = []; // hired, floating in through the door: { type, remaining }
    this.agentLevels = Object.fromEntries(AGENT_TYPE_IDS.map((type) => [type, noAgentLevels(type)]));

    // The neighbor next door, and how loud you are right now.
    this.neighbor = new Neighbor(this);
    this.noise = 0;

    // Pick up where you left off, then keep saving automatically.
    this.restoreProgress();
    this.setupAutosave();
    if (gameState.shopUnlocked) this.setDeskLabel('Shop');
    else this.addArrowOverDesk('hustle-done');
    this.checkShopUnlock(gameState.cash); // saves from before the shop existed

    this.addHint();
    this.scene.launch('UIScene');
    this.updatePowerUsage();
    if (DEBUG) this.setupDebug();
  }

  update(_time, delta) {
    const dt = Math.min(delta, 50) / 1000; // cap so a lag spike can't teleport you through walls
    this.playTime += dt;
    let input = this.readInput();
    if (input.x !== 0 || input.y !== 0) this.clearMoveTarget(); // manual control wins
    else if (this.moveTarget) input = this.steerToTarget(dt);
    this.player.update(dt, input);
    this.updateSpots();

    this.updateOrders(dt);
    this.updateBoxes();
    this.tryInstall();
    this.updateBreaker(dt);
    this.updateLights();
    this.updateAgents(dt);
    this.updateStations(dt);
    this.updateShopOpen();
    this.updateCarryVisuals();

    if (this.hint && (input.x !== 0 || input.y !== 0)) {
      const hint = this.hint;
      this.hint = null;
      this.tweens.add({ targets: hint, alpha: 0, duration: 600, onComplete: () => hint.destroy() });
    }
    if (this.debugFeet) this.debugFeet.setPosition(this.player.x, this.player.y);
  }

  get handsFull() {
    return this.carried > 0 || this.carryBox !== null;
  }

  // ---------- Earning machines ----------

  addStation({ id, spot, hustle, plotId = null }) {
    const station = { id, spot, hustle, plotId, near: false };
    this.stations.push(station);
    return station;
  }

  // Each installed item gets its own station: jobs, heat, and a cash pile on the floor beside it.
  createMachineStation(plot) {
    const earns = ITEMS[plot.itemId].earns;
    if (!earns) return null;
    const top = plot.sprite.y - plot.sprite.height;
    const hustle = new HustleStation(this, {
      panelX: plot.x,
      panelY: top - 34,
      screen: { x: plot.x, y: top + 30, w: 0, h: 0 },
      pile: { x: plot.x + 88, y: plot.y + 42, depth: plot.y + 42 },
      hustles: JOB_LISTS[earns.jobs],
      heat: earns.heat ? HEAT[earns.heat] : null,
      pileMax: earns.pileMax,
      idle: earns.mode === 'idle',
      payMultiplier: earns.payMultiplier,
      sprite: plot.sprite,
      group: groupForJobs(earns.jobs),
    });
    // You stand in front of the machine (below it on screen) to work or collect.
    const spot = { x: plot.x, y: plot.y + 72, reach: earns.mode === 'idle' ? 110 : 80 };
    const station = this.addStation({ id: plot.id, spot, hustle, plotId: plot.id });
    station.noise = ITEMS[plot.itemId].noise ?? 0;
    return station;
  }

  updateStations(dt) {
    // The corner desk only does hustles until the shop unlocks (or as a safety net).
    this.deskStation.hustle.enabled = !gameState.shopUnlocked || this.safetyNetActive();

    // A tripped breaker cuts power to every machine. The laptop runs on its battery.
    for (const st of this.stations) st.hustle.powered = st === this.deskStation || !gameState.tripped;

    const still = !this.player.moving && !this.moveTarget;
    let workTarget = null;
    let bestDist = Infinity;
    for (const st of this.stations) {
      const dist = Math.hypot(this.player.x - st.spot.x, this.player.y - st.spot.y);
      const near = dist < st.spot.reach;
      if (st.near && !near) this.collectFrom(st); // walking away takes its cash
      st.near = near;
      if (near) this.flipSwitch(st);
      const workable = !st.hustle.idle || st.hustle.broken; // idle machines only need you to repair them
      if (near && workable && st.hustle.enabled && dist < bestDist) {
        workTarget = st;
        bestDist = dist;
      }
    }

    // Machines Augustus (or another agent) is working this frame.
    const helpers = new Map(this.agents.filter((a) => a.workingStation).map((a) => [a.workingStation, a]));
    let working = false;
    for (const st of this.stations) {
      const atThis = st === workTarget;
      const helper = atThis ? undefined : helpers.get(st);
      const busy = st.hustle.update(dt, {
        canWork: (atThis && still && !this.handsFull) || Boolean(helper),
        near: st.near,
        handsFull: atThis && this.handsFull,
        rate: helper?.workRate ?? 1,
        bonus: helper?.payBonus ?? 1,
        helper: Boolean(helper),
      });
      if (busy && atThis) working = true;
    }

    // Machines being worked make noise; too much for too long brings the neighbor over.
    this.noise = this.stations.reduce((sum, st) => sum + (st.hustle.working ? st.noise ?? 0 : 0), 0);
    this.neighbor.update(dt, this.noise);
    this.player.setWorking(working || this.resetting);
  }

  /** Picks up a machine's cash pile, as much as fits in your hands (all: ignore the limit). */
  // While the neighbor is knocking or at the window, walking up to a machine switches it off.
  // Any other time, walking up to a switched-off machine switches it back on.
  flipSwitch(station) {
    if (!station.plotId) return;
    const h = station.hustle;
    if (this.neighbor.quiet && !h.switchedOff) h.setSwitchedOff(true);
    else if (!this.neighbor.quiet && h.switchedOff) h.setSwitchedOff(false);
  }

  /** Machines that would make the neighbor mad: on, powered and not fried. */
  runningMachines() {
    return this.stations.filter((st) => st.plotId && !st.hustle.switchedOff && st.hustle.powered && !st.hustle.broken);
  }

  get switchedOffCount() {
    return this.stations.filter((st) => st.hustle.switchedOff).length;
  }

  collectFrom(station, { all = false } = {}) {
    if (this.carryBox) return; // hands are busy with a box; the cash waits
    const pile = station.hustle.pile;
    if (pile <= 0) return;
    const room = all ? pile : Math.max(0, this.carryLimit - this.carried);
    if (room <= 0) {
      this.nudge(`Hands full ($${this.carryLimit} max): stash your cash first`, this.player.x, this.player.y - 150);
      return;
    }
    this.carried += station.hustle.takeFromPile(room);
    this.player.setCarrying(true);
    this.rebuildCarryStack();
    const left = station.hustle.pile;
    if (left > 0) this.nudge(`Hands full: $${left} left on the machine`, this.player.x, this.player.y - 150);
  }

  get carryLimit() {
    return playerStats(this.playerLevels).carryLimit;
  }

  /** Called by the shop: 'carry' or 'speed'. Returns true if it went through. */
  buyPlayerUpgrade(kind) {
    const upgrade = Object.hasOwn(PLAYER_UPGRADES, kind) ? PLAYER_UPGRADES[kind] : null;
    if (!upgrade) return false;
    const level = this.playerLevels[kind];
    if (level >= PLAYER_MAX_LEVEL || !gameState.spend(upgrade.prices[level])) return false;
    this.playerLevels = { ...this.playerLevels, [kind]: level + 1 };
    this.applyPlayerStats();
    this.events.emit('player-upgraded', kind, level + 1);
    return true;
  }

  applyPlayerStats() {
    this.player.speedMultiplier = playerStats(this.playerLevels).speedMultiplier;
  }

  // If you're broke and own nothing that earns, the laptop does hustles again
  // so you can never get stuck.
  safetyNetActive() {
    if (!gameState.shopUnlocked) return false;
    const ownsEarner = this.plots.some((p) => p.itemId && ITEMS[p.itemId].earns);
    const machineComing = [...this.orders.map((o) => o.itemId), ...this.boxes.map((b) => b.itemId), this.carryBox?.itemId]
      .some((id) => typeof id === 'string' && Object.hasOwn(ITEMS, id));
    if (ownsEarner || machineComing) return false;
    const cheapest = Math.min(...Object.values(ITEMS).filter((i) => i.earns).map((i) => i.price));
    return gameState.cash + this.carried < cheapest;
  }

  // ---------- Security questions ----------

  /**
   * Called by a machine when you finish a job there. About 1 in 5 times it
   * opens a question (true) and the job waits for your answer.
   */
  askQuestion(station) {
    if (this.question || Math.random() >= this.questionChance) return false;
    const group = station.hustle?.group ?? station.group;
    const bank = QUESTIONS[group];
    if (!bank?.length) return false;
    // No repeats until you've seen every question in the group.
    let seen = this.questionsSeen[group];
    if (seen.length >= bank.length) seen = this.questionsSeen[group] = [];
    const unseen = bank.map((_, i) => i).filter((i) => !seen.includes(i));
    const index = unseen[Math.floor(Math.random() * unseen.length)];
    seen.push(index);
    const item = bank[index];
    // Shuffle the choices; remember where the right one landed.
    const order = item.choices.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    this.question = {
      hustle: station,
      group,
      groupName: QUESTION_GROUPS[group].name,
      q: item.q,
      choices: order.map((i) => item.choices[i]),
      correct: order.indexOf(item.answer),
      why: item.why,
    };
    this.events.emit('question', this.question);
    return true;
  }

  /** The player's pick (index into the shown choices), or null when time ran out. */
  answerQuestion(pick) {
    const q = this.question;
    if (!q) return null;
    this.question = null;
    const correct = pick === q.correct;
    const stillThere = this.stations.some((st) => st.hustle === q.hustle);
    const pay = stillThere ? q.hustle.resolveQuestion(correct) : 0;
    return { correct, pay };
  }

  // ---------- AI agents (Augustus and friends) ----------

  updateAgents(dt) {
    for (const arrival of [...this.arrivals]) {
      arrival.remaining -= dt;
      if (arrival.remaining > 0) continue;
      this.arrivals.splice(this.arrivals.indexOf(arrival), 1);
      const { x, y } = DORM.deliverySpot;
      const agent = this.spawnAgent(arrival.type, { x, y: y + 20, arriving: true });
      this.events.emit('agent-arrived', agent);
    }
    for (const agent of this.agents) agent.update(dt);
  }

  /** Agents you have plus ones on the way (of one type, or all). */
  agentCount(type = null) {
    return [...this.agents, ...this.arrivals].filter((a) => !type || a.type === type).length;
  }

  spawnAgent(type, opts) {
    const nth = this.agents.filter((a) => a.type === type).length;
    const agent = new Agent(this, { ...opts, type, name: agentName(type, nth), levels: this.agentLevels[type] });
    this.agents.push(agent);
    return agent;
  }

  /** Called by the shop. Returns true if the agent is hired (they float in a few seconds later). */
  hireAgent(type) {
    if (!isAgentType(type) || !gameState.shopUnlocked || this.agentCount() >= MAX_AGENTS) return false;
    if (!gameState.spend(hirePrice(type, this.agentCount(type)))) return false;
    this.arrivals.push({ type, remaining: AGENT_TYPES[type].arriveSeconds });
    return true;
  }

  /** Called by the shop: one upgrade for every agent of that type. */
  buyAgentUpgrade(type, kind) {
    const upgrades = isAgentType(type) ? AGENT_TYPES[type].upgrades : {};
    const upgrade = Object.hasOwn(upgrades, kind) ? upgrades[kind] : null;
    if (!upgrade || !this.agents.some((a) => a.type === type)) return false;
    const level = this.agentLevels[type][kind];
    if (level >= AGENT_LEVEL_MAX || !gameState.spend(upgrade.prices[level])) return false;
    this.agentLevels[type] = { ...this.agentLevels[type], [kind]: level + 1 };
    for (const agent of this.agents) if (agent.type === type) agent.setLevels(this.agentLevels[type]);
    this.events.emit('agent-upgraded', type, kind, level + 1);
    return true;
  }

  /** What the shop's Agents tab shows. */
  agentsInfo() {
    const types = Object.fromEntries(AGENT_TYPE_IDS.map((type) => {
      const owned = this.agents.filter((a) => a.type === type).length;
      const coming = this.arrivals.filter((a) => a.type === type).map((a) => a.remaining);
      return [type, {
        owned,
        coming: coming.length,
        nextArrival: coming.length ? Math.min(...coming) : null,
        nextPrice: hirePrice(type, owned + coming.length),
        levels: this.agentLevels[type],
      }];
    }));
    const roster = [
      ...this.agents.map((a) => `${a.name}: ${a.status}`),
      ...this.arrivals.map((a) => `${AGENT_TYPES[a.type].name}: floats in in ${Math.ceil(a.remaining)}s`),
    ];
    return { count: this.agentCount(), max: MAX_AGENTS, types, roster };
  }

  // An agent dropping cash in the hamper.
  stashFromHelper(agent, amount) {
    gameState.addCash(amount);
    this.floatText(`+$${amount}`, DORM.stash.x + 30, DORM.stash.y - 90, '#b8ffcf');
  }

  itemName(id) {
    return orderable(id)?.name ?? id;
  }

  // ---------- Shop, orders and deliveries ----------

  checkShopUnlock(total) {
    if (gameState.shopUnlocked || total < SHOP_UNLOCK_CASH) return;
    gameState.unlockShop();
    this.setDeskLabel('Shop');
    this.addArrowOverDesk('order-placed');
  }

  updateShopOpen() {
    const open = gameState.shopUnlocked && this.spotNear('starterDesk');
    if (open === this.shopOpen) return;
    this.shopOpen = open;
    this.events.emit('shop', open);
  }

  /** Called by the shop screen. Returns true if the order went through. */
  buy(itemId) {
    const item = orderable(itemId);
    if (!item || !gameState.shopUnlocked) return false;
    // Power: only the next upgrade, one at a time.
    if (isPower(itemId) && (itemId !== this.nextPower()?.id || this.powerPending())) return false;
    if (!gameState.spend(item.price)) return false;
    this.orders.push({ itemId, remaining: item.deliverySeconds });
    this.events.emit('order-placed', itemId);
    return true;
  }

  /** The next power upgrade you can buy, or null once you have the best one. */
  nextPower() {
    const next = POWER_TIERS[gameState.powerTier + 1];
    return next ? POWER_ITEMS[next.id] : null;
  }

  /** True while a power upgrade is ordered, waiting at the door, or in your hands. */
  powerPending() {
    return [...this.orders.map((o) => o.itemId), ...this.boxes.map((b) => b.itemId), this.carryBox?.itemId].some(isPower);
  }

  updateOrders(dt) {
    for (const order of [...this.orders]) {
      order.remaining -= dt;
      if (order.remaining > 0) continue;
      this.orders.splice(this.orders.indexOf(order), 1);
      this.spawnBox(order.itemId, true);
    }
  }

  spawnBox(itemId, announce = false) {
    const [ox, oy] = BOX_OFFSETS[this.boxes.length % BOX_OFFSETS.length];
    const x = DORM.deliverySpot.x + ox;
    const y = DORM.deliverySpot.y + oy;
    const sprite = this.add.image(x, y, 'item-box').setOrigin(0.5, 1).setDepth(y);
    const label = this.add.text(x, y - 70, orderable(itemId).name, {
      fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#fde68a', backgroundColor: '#0b0e14cc', padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setDepth(12100);
    this.boxes.push({ itemId, x, y, sprite, label });
    if (announce) {
      this.floatText('Delivery!', DORM.deliverySpot.x, DORM.deliverySpot.y - 150, '#fde68a');
      this.tweens.add({ targets: sprite, y: { from: y - 30, to: y }, duration: 400, ease: 'Bounce.out' });
      this.events.emit('delivery', itemId);
    }
  }

  updateBoxes() {
    const door = Math.hypot(this.player.x - DORM.deliverySpot.x, this.player.y - DORM.deliverySpot.y);
    if (door > DOOR_LEAVE) this.leftDoor = true;
    if (this.carryBox) {
      // Changed your mind (or nowhere to put it)? Bring it back to the door.
      if (door < DOOR_DROP && this.leftDoor) this.setBoxDown();
      return;
    }
    if (!this.leftDoor) return; // just set a box down here
    for (const box of this.boxes) {
      if (Math.hypot(this.player.x - box.x, this.player.y - box.y) > BOX_REACH) continue;
      if (this.carried > 0) {
        this.nudge('Hands full: stash your cash first', box.x, box.y - 100);
        return;
      }
      if (!isPower(box.itemId) && !this.hasEmptyPlot) {
        this.nudge('No empty plot: dig up a machine with the shovel first', box.x, box.y - 100);
        return;
      }
      this.pickUpBox(box);
      return;
    }
  }

  get hasEmptyPlot() {
    return this.plots.some((p) => !p.itemId);
  }

  // Puts the box you're holding back by the door.
  setBoxDown() {
    const { itemId, sprite } = this.carryBox;
    this.carryBox = null;
    sprite.destroy();
    this.spawnBox(itemId);
    this.leftDoor = false;
    if (this.carried === 0) this.player.setCarrying(false);
    this.floatText('Box set down by the door', DORM.deliverySpot.x, DORM.deliverySpot.y - 150, '#fde68a');
  }

  pickUpBox(box) {
    this.boxes.splice(this.boxes.indexOf(box), 1);
    box.label.destroy();
    box.sprite.setScale(0.85);
    this.carryBox = { itemId: box.itemId, sprite: box.sprite };
    this.leftDoor = false;
    this.player.setCarrying(true);
    const where = isPower(box.itemId) ? 'take it to the breaker' : 'put it on an empty plot';
    this.floatText(`${orderable(box.itemId).name}: ${where}`, this.player.x, this.player.y - 140, '#5ff0ff');
  }

  // Walking onto an empty plot with a box installs it there.
  // Power boxes go to the breaker panel instead.
  tryInstall() {
    if (!this.carryBox) return;
    if (isPower(this.carryBox.itemId)) {
      if (this.spotNear('breaker')) this.installPower();
      return;
    }
    const { width: w, height: h } = DORM.plotSize;
    const plot = this.plots.find((p) => !p.itemId && pointInPolygon(this.player.x, this.player.y, [
      [p.x - w / 2, p.y], [p.x, p.y - h / 2], [p.x + w / 2, p.y], [p.x, p.y + h / 2],
    ]));
    if (!plot) return;

    const { itemId, sprite } = this.carryBox;
    this.carryBox = null;
    sprite.destroy();
    this.placeItem(itemId, plot.id, { ignorePlayer: true });
    this.rebuildNavigation();
    this.clearMoveTarget();
    this.movePlayerToOpenFloor();
    if (this.carried === 0) this.player.setCarrying(false);
    plot.sprite.setScale(0.6);
    this.tweens.add({ targets: plot.sprite, scale: 1, duration: 350, ease: 'Back.out' });
    this.floatText('Installed!', plot.x, plot.sprite.y - plot.sprite.height - 20, '#4ade80');
    this.events.emit('installed', itemId);
  }

  // After an install, step off the new item's footprint onto the nearest open floor.
  movePlayerToOpenFloor() {
    const { x, y } = this.player;
    if (this.player.canStandAt(x, y)) return;
    const spot = findPath(this.navGrid, x, y, x, y)?.at(-1);
    if (!spot) return;
    this.tweens.add({
      targets: this.player.sprite, x: spot.x, y: spot.y, duration: 180,
      onUpdate: () => this.player.sprite.setDepth(this.player.sprite.y),
    });
  }

  // ---------- Plots and items ----------

  // A glowing diamond on the floor with a "+" in the middle.
  drawPlotOutline(plot) {
    const { width: w, height: h } = DORM.plotSize;
    const pts = [
      { x: -w / 2, y: 0 }, { x: 0, y: -h / 2 }, { x: w / 2, y: 0 }, { x: 0, y: h / 2 },
    ];
    const g = this.add.graphics({ x: plot.x, y: plot.y }).setDepth(-6000);
    g.fillStyle(ACCENT, 0.08);
    g.fillPoints(pts, true);
    g.lineStyle(2, ACCENT, 0.7);
    g.strokePoints(pts, true);
    g.lineStyle(3, ACCENT, 0.6);
    g.lineBetween(-12, 0, 12, 0);
    g.lineBetween(0, -7, 0, 7);
    this.tweens.add({ targets: g, alpha: { from: 0.45, to: 1 }, duration: 1100, yoyo: true, repeat: -1 });
    return g;
  }

  /**
   * Installs an item into an empty plot: its sprite, its footprint as a blocked
   * area, and (if it earns) its station. Returns false if the plot is taken or
   * you're standing in the way. Call rebuildNavigation() afterwards.
   */
  placeItem(itemId, plotId, { ignorePlayer = false } = {}) {
    const item = ITEMS[itemId];
    const plot = this.plots.find((p) => p.id === plotId);
    if (!item || !plot || plot.itemId) return false;

    // Line up the middle of the item's footprint with the middle of the plot.
    const fx = item.footprint.reduce((s, [x]) => s + x, 0) / item.footprint.length;
    const fy = centerY(item.footprint);
    const anchorX = Math.round(plot.x - fx);
    const anchorY = Math.round(plot.y - fy);
    const footprint = translatePolygon(item.footprint, anchorX, anchorY);
    if (!ignorePlayer && pointInPolygon(this.player.x, this.player.y, footprint)) return false;

    // Drawn in depth order so the player can walk in front of or behind it.
    plot.sprite = this.add.image(anchorX, anchorY, `station-${itemId}`)
      .setOrigin(0.5, 1)
      .setDepth(centerY(footprint));
    plot.itemId = itemId;
    plot.footprint = footprint;
    plot.outline.setVisible(false);
    this.blocked.push(footprint);
    plot.station = this.createMachineStation(plot);
    this.updatePowerUsage();
    return true;
  }

  /** Clears a plot (used by the shovel). Returns the removed item's id. */
  removeItem(plotId) {
    const plot = this.plots.find((p) => p.id === plotId);
    if (!plot || !plot.itemId) return null;
    const itemId = plot.itemId;
    if (plot.station) {
      this.collectFrom(plot.station, { all: true }); // nothing gets lost when it's dug up
      plot.station.hustle.destroy();
      this.stations.splice(this.stations.indexOf(plot.station), 1);
    }
    plot.sprite.destroy();
    this.blocked.splice(this.blocked.indexOf(plot.footprint), 1);
    Object.assign(plot, { itemId: null, sprite: null, footprint: null, station: null });
    plot.outline.setVisible(true);
    this.updatePowerUsage();
    return itemId;
  }

  updatePowerUsage() {
    const watts = this.plots.reduce((sum, p) => sum + (p.itemId ? ITEMS[p.itemId].watts : 0), STARTER_LAPTOP_WATTS);
    gameState.setPowerUsed(watts);
  }

  // Tap-to-move pathfinding needs to know when items appear or disappear.
  rebuildNavigation() {
    this.navGrid = buildGrid((x, y) => this.player.canStandAt(x, y), this.scale.width, this.scale.height);
    if (DEBUG) this.drawDebug();
  }

  // ---------- Power and the breaker ----------

  setupBreaker() {
    this.breakerSpot = this.spots.find((s) => s.id === 'breaker');
    // Progress bar under the label while you reset the breaker.
    this.resetBarBg = this.add.rectangle(-60, 32, 120, 10, 0x0b0e14, 0.9).setOrigin(0, 0.5).setVisible(false);
    this.resetBarFill = this.add.rectangle(-60, 32, 0, 10, 0x4ade80).setOrigin(0, 0.5).setVisible(false);
    this.breakerSpot.container.add([this.resetBarBg, this.resetBarFill]);
    // The room goes dim while the power is out.
    this.darkness = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x02040a)
      .setOrigin(0)
      .setDepth(11000)
      .setAlpha(0);
    this.overloadFor = 0;
    this.resetProgress = 0;
    this.resetting = false;
    this.breakerMode = null;
    this.breakerArrow = null;
    this.lastResetAt = -Infinity;
    this.stepAway = false; // after a failed reset, leave the panel before trying again
    this.nextFlicker = 0;
    this.flickerAt = -Infinity;
    this.lightsOnAt = -Infinity;
    this.playTime = 0; // game seconds since the room loaded (same clock as the trip timer)
  }

  // The room's lights: flicker when you're over the limit, dim and flicker
  // while the power is out, stutter back on after a reset.
  updateLights() {
    const now = this.time.now;
    let alpha;
    if (gameState.tripped) {
      if (now >= this.nextFlicker) {
        this.flickerAt = now;
        this.nextFlicker = now + 1400 + Math.random() * 1600;
      }
      alpha = stepAt(OUTAGE_FLICKER, now - this.flickerAt);
    } else if (this.overloadFor > 0) {
      alpha = stepAt(BROWNOUT, this.overloadFor * 1000);
    } else {
      alpha = stepAt(LIGHTS_ON, now - this.lightsOnAt);
    }
    if (this.darkness.alpha !== alpha) this.darkness.setAlpha(alpha);
  }

  updateBreaker(dt) {
    // Using more watts than your power supply allows trips the breaker after a moment.
    const { used, capacity } = gameState.power;
    if (!gameState.tripped && used > capacity) {
      this.overloadFor += dt;
      if (this.overloadFor >= TRIP_DELAY) this.trip();
    } else {
      this.overloadFor = 0;
    }

    // Stand still at the panel for a moment to switch it back on.
    // If it tripped right back, step away first so it doesn't flicker on and off forever.
    const atPanel = this.spotNear('breaker');
    if (!atPanel) this.stepAway = false;
    const still = !this.player.moving && !this.moveTarget;
    this.resetting = gameState.tripped && still && atPanel && !this.stepAway;
    if (this.resetting) {
      this.resetProgress += dt / RESET_SECONDS;
      if (this.resetProgress >= 1) this.resetBreaker();
    } else {
      this.resetProgress = 0;
    }
    const showBar = this.resetProgress > 0;
    this.resetBarBg.setVisible(showBar);
    this.resetBarFill.setVisible(showBar);
    this.resetBarFill.width = Math.min(1, this.resetProgress) * 120;

    // Point at the panel when it needs you.
    let mode = this.carryBox && isPower(this.carryBox.itemId) ? 'install' : null;
    if (gameState.tripped) mode = this.stepAway ? 'overloaded' : 'tripped';
    if (mode !== this.breakerMode) this.setBreakerMode(mode);
  }

  setBreakerMode(mode) {
    this.breakerMode = mode;
    const spot = this.breakerSpot;
    const [label, color] = {
      tripped: ['Reset breaker', '#fca5a5'],
      overloaded: ['Overloaded!', '#fca5a5'],
      install: ['Install power', '#fde68a'],
    }[mode] ?? ['Breaker', '#5ff0ff'];
    spot.text.setText(label).setColor(color);
    spot.farAlpha = mode ? 1 : 0;
    if (!spot.near) spot.container.setAlpha(spot.farAlpha);

    this.breakerArrow?.destroy();
    this.breakerArrow = null;
    if (!mode) return;
    const { labelX, labelY } = DORM.breaker;
    const arrow = this.add.triangle(labelX, labelY - 54, 0, 0, 28, 0, 14, 22, mode === 'install' ? 0xfde68a : 0xf87171)
      .setDepth(12600);
    this.tweens.add({ targets: arrow, y: labelY - 44, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.breakerArrow = arrow;
  }

  /** Cuts the power. silent: no banner or effects (used when loading a save). */
  trip({ silent = false } = {}) {
    const again = this.time.now - this.lastResetAt < 4000;
    gameState.setTripped(true);
    this.overloadFor = 0;
    this.resetProgress = 0;
    this.nextFlicker = this.time.now + 1500;
    if (again && this.spotNear('breaker')) this.stepAway = true;
    if (silent) return;

    // The surge fries machines: one, or two if it trips again right after a reset.
    const justLoaded = this.playTime < LOAD_GRACE;
    const fried = justLoaded ? [] : this.fryMachines(again ? 2 : 1);
    this.sparks(DORM.breaker.panelX, DORM.breaker.panelY);
    this.cameras.main.shake(again ? 260 : 180, again ? 0.007 : 0.004);
    this.events.emit('breaker-tripped', { again, fried, ...gameState.power });
  }

  /** Fries up to `count` random working machines. Returns their names. */
  fryMachines(count) {
    const candidates = this.stations.filter((st) => st.plotId && !st.hustle.broken);
    const fried = [];
    while (fried.length < count && candidates.length) {
      const st = candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0];
      st.hustle.setBroken(true);
      const plot = this.plots.find((p) => p.id === st.plotId);
      this.sparks(plot.x, plot.sprite.y - plot.sprite.height / 2);
      fried.push(ITEMS[plot.itemId].name);
    }
    return fried;
  }

  /** Installed machines that are fried and waiting for a repair. */
  get friedCount() {
    return this.stations.filter((st) => st.hustle.broken).length;
  }

  resetBreaker() {
    gameState.setTripped(false);
    this.lastResetAt = this.time.now;
    this.resetProgress = 0;
    this.overloadFor = 0;
    this.lightsOnAt = this.time.now; // the lights stutter back on
    this.floatText('Power back on!', DORM.breaker.labelX - 40, DORM.breaker.labelY - 70, '#4ade80');
    this.events.emit('breaker-reset');
  }

  // Carrying a power box to the breaker panel installs the upgrade.
  installPower() {
    const { itemId, sprite } = this.carryBox;
    this.carryBox = null;
    sprite.destroy();
    if (this.carried === 0) this.player.setCarrying(false);
    const power = POWER_ITEMS[itemId];
    if (power.tier > gameState.powerTier) gameState.setPowerTier(power.tier);
    this.floatText('Power upgraded!', DORM.breaker.labelX - 40, DORM.breaker.labelY - 70, '#4ade80');
    this.events.emit('power-installed', power);
    // You're already at the panel, so it gets switched back on too.
    const { used, capacity } = gameState.power;
    if (gameState.tripped && used <= capacity) this.resetBreaker();
  }

  sparks(x, y) {
    for (let i = 0; i < 14; i++) {
      const p = this.add.circle(x, y, 2 + Math.random() * 3, i % 2 ? 0xfde047 : 0xffffff).setDepth(12550);
      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 60;
      this.tweens.add({
        targets: p, x: x + Math.cos(angle) * dist, y: y + Math.sin(angle) * dist + 25, alpha: 0, scale: 0.3,
        duration: 350 + Math.random() * 350, ease: 'Quad.out', onComplete: () => p.destroy(),
      });
    }
  }

  // ---------- Shovel ----------

  /** The installed item you're standing at (for the shovel button), or null. */
  shovelTarget() {
    if (this.carryBox) return null; // hands are busy with a box
    let best = null;
    let bestDist = Infinity;
    for (const p of this.plots) {
      if (!p.itemId) continue;
      const spot = p.station?.spot ?? { x: p.x, y: p.y + 72, reach: 90 };
      const dist = Math.hypot(this.player.x - spot.x, this.player.y - spot.y);
      if (dist < spot.reach && dist < bestDist) {
        best = p;
        bestDist = dist;
      }
    }
    return best;
  }

  /** Digs up an installed item. You get part of its price back as cash in your hands. */
  shovel(plotId) {
    const plot = this.plots.find((p) => p.id === plotId);
    if (!plot?.itemId || this.carryBox) return false;
    const top = plot.sprite.y - plot.sprite.height;
    const itemId = this.removeItem(plotId);
    this.rebuildNavigation();
    const refund = Math.round(ITEMS[itemId].price * SHOVEL_REFUND);
    this.carried += refund;
    if (this.carried > 0) this.player.setCarrying(true);
    this.rebuildCarryStack();
    this.dust(plot.x, plot.y);
    this.floatText(`Removed: +$${refund} back`, plot.x, top, '#b8ffcf');
    this.events.emit('item-removed', itemId);
    return true;
  }

  dust(x, y) {
    for (let i = 0; i < 10; i++) {
      const p = this.add.circle(x + (Math.random() - 0.5) * 120, y + (Math.random() - 0.5) * 40, 6 + Math.random() * 6, 0xa08060, 0.8)
        .setDepth(y + 60);
      this.tweens.add({
        targets: p, y: p.y - 30 - Math.random() * 30, alpha: 0, scale: 1.8, duration: 600 + Math.random() * 300,
        ease: 'Sine.out', onComplete: () => p.destroy(),
      });
    }
  }

  // ---------- Places you can use (stash, desk, breaker) ----------

  addSpot(id, def, label, iconKey, { hiddenWhenFar = false, hiddenWhenNear = false } = {}) {
    const container = this.add.container(def.labelX ?? def.x, def.labelY).setDepth(12000);
    const text = this.add.text(0, 0, label, {
      fontFamily: FONT,
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#5ff0ff',
      backgroundColor: '#0b0e14cc',
      padding: { x: 10, y: 5 },
    }).setOrigin(0.5);
    container.add(text);
    if (iconKey) {
      const icon = this.add.image(-text.width / 2 - 6, 0, iconKey).setOrigin(1, 0.5);
      container.add(icon);
    }
    const farAlpha = hiddenWhenFar ? 0 : 0.55;
    container.setAlpha(farAlpha);
    this.tweens.add({ targets: container, y: def.labelY - 6, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    return { id, def, container, text, near: false, farAlpha, nearAlpha: hiddenWhenNear ? 0 : 1 };
  }

  updateSpots() {
    for (const spot of this.spots) {
      const near = Math.hypot(this.player.x - spot.def.x, this.player.y - spot.def.y) < spot.def.reach;
      if (near === spot.near) continue;
      spot.near = near;
      spot.container.setAlpha(near ? spot.nearAlpha : spot.farAlpha).setScale(near ? 1.12 : 1);
      this.events.emit(near ? 'spot-enter' : 'spot-leave', spot.id);
    }
  }

  spotNear(id) {
    return this.spots.find((s) => s.id === id)?.near ?? false;
  }

  setDeskLabel(label) {
    this.spots.find((s) => s.id === 'starterDesk')?.text.setText(label);
  }

  // ---------- Saving progress (see src/state/save.js) ----------

  saveProgress() {
    const installed = this.plots.filter((p) => p.itemId);
    writeSave({
      cash: gameState.cash,
      powerTier: gameState.powerTier,
      tripped: gameState.tripped,
      shopUnlocked: gameState.shopUnlocked,
      carried: this.carried,
      carryBox: this.carryBox?.itemId ?? null,
      plots: Object.fromEntries(installed.map((p) => [p.id, p.itemId])),
      machines: Object.fromEntries(installed.filter((p) => p.station).map((p) => [p.id, this.stationState(p.station)])),
      desk: this.stationState(this.deskStation),
      orders: this.orders.map((o) => ({ itemId: o.itemId, remaining: Math.ceil(o.remaining) })),
      boxes: this.boxes.map((b) => b.itemId),
      player: { x: Math.round(this.player.x), y: Math.round(this.player.y), facing: this.player.facing },
      agents: this.agents.map((a) => ({
        type: a.type, awake: Math.round(a.awake), nap: Math.ceil(a.nap), carried: a.carried, x: Math.round(a.x), y: Math.round(a.y),
        ...(a.rogueCfg ? { rogue: a.state === 'rogue', rogueIn: Math.round(a.rogueIn), quarantine: Math.ceil(a.quarantine) } : {}),
      })),
      arrivals: this.arrivals.map((a) => ({ type: a.type, remaining: Math.ceil(a.remaining) })),
      agentLevels: this.agentLevels,
      questionsSeen: this.questionsSeen,
      playerLevels: this.playerLevels,
      neighbor: this.neighbor.saveState,
    });
  }

  stationState(station) {
    const h = station.hustle;
    return { pile: h.pile, heat: Math.round(h.heat), overheated: h.overheated, broken: h.broken, off: h.switchedOff };
  }

  restoreStation(station, state) {
    if (!station || !state) return;
    const { broken, off, ...rest } = state;
    Object.assign(station.hustle, rest);
    if (broken && station.plotId) station.hustle.setBroken(true, { quiet: true });
    if (off && station.plotId) station.hustle.setSwitchedOff(true, { quiet: true });
    station.hustle.renderPile();
  }

  restoreProgress() {
    const save = readSave({ plotIds: this.plots.map((p) => p.id), pileMax: STARTER_DESK_PILE_MAX });
    if (!save) return;

    gameState.cash = save.cash;
    gameState.shopUnlocked = save.shopUnlocked;
    gameState.setPowerTier(save.powerTier);

    // Reinstall items with the player out of the way, then put the player back.
    const start = { x: this.player.x, y: this.player.y };
    this.player.sprite.setPosition(-1000, -1000);
    for (const [plotId, itemId] of Object.entries(save.plots)) {
      this.placeItem(itemId, plotId);
      this.restoreStation(this.plots.find((p) => p.id === plotId)?.station, save.machines[plotId]);
    }
    this.rebuildNavigation();
    let pos = save.player && this.player.canStandAt(save.player.x, save.player.y) ? save.player : start;
    if (!this.player.canStandAt(pos.x, pos.y)) pos = findPath(this.navGrid, pos.x, pos.y, pos.x, pos.y)?.at(-1) ?? start;
    this.player.sprite.setPosition(pos.x, pos.y).setDepth(pos.y);
    this.player.facing = save.player?.facing ?? this.player.facing;

    if (save.tripped) this.trip({ silent: true });
    this.questionsSeen = save.questionsSeen;
    this.playerLevels = { ...save.playerLevels };
    this.neighbor.restore(save.neighbor);
    this.applyPlayerStats();
    this.agentLevels = save.agentLevels;
    for (const a of save.agents) {
      const ok = a.position && this.player.canStandAt(a.position.x, a.position.y);
      const pos = ok ? a.position : { x: DORM.deliverySpot.x, y: DORM.deliverySpot.y + 20 };
      this.spawnAgent(a.type, {
        ...pos, awake: a.awake, nap: a.nap, carried: a.carried, rogue: a.rogue, rogueIn: a.rogueIn, quarantine: a.quarantine,
      });
    }
    this.arrivals = save.arrivals.map((a) => ({ ...a }));
    this.restoreStation(this.deskStation, save.desk);
    this.orders = save.orders.map((o) => ({ ...o }));
    for (const itemId of save.boxes) this.spawnBox(itemId);

    if (save.carryBox) {
      const sprite = this.add.image(0, 0, 'item-box').setOrigin(0.5, 1).setScale(0.85);
      this.carryBox = { itemId: save.carryBox, sprite };
    }
    if (save.carried > 0) {
      this.carried = save.carried;
      this.rebuildCarryStack();
    }
    if (this.handsFull) this.player.setCarrying(true);
    this.player.showIdle();
  }

  // Save every few seconds, when the tab is hidden or closed (phones), and
  // right before the game reloads itself into a new version.
  setupAutosave() {
    const saveNow = () => this.saveProgress();
    const onVisibility = () => { if (document.visibilityState === 'hidden') saveNow(); };
    this.time.addEvent({ delay: 3000, loop: true, callback: saveNow });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', saveNow);
    window.addEventListener('cyber-game:save-now', saveNow);
    this.events.once('shutdown', () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', saveNow);
      window.removeEventListener('cyber-game:save-now', saveNow);
    });
  }

  // ---------- Carrying and stashing cash ----------

  // Reaching the laundry basket stashes all the cash you're carrying.
  stashCash() {
    if (this.carried <= 0) return;
    const amount = this.carried;
    this.carried = 0;
    if (!this.carryBox) this.player.setCarrying(false);
    const { x, y } = DORM.stash;
    for (const [i, s] of this.carryStack.entries()) {
      this.tweens.add({
        targets: s, x, y: y - 30, scale: 0.5, alpha: 0, duration: 350, delay: i * 40, ease: 'Quad.in',
        onComplete: () => s.destroy(),
      });
    }
    this.carryStack = [];
    gameState.addCash(amount);
    this.floatText(`+$${amount}`, x, y - 90, '#b8ffcf');
  }

  // One cash image per $8 carried (up to 8), stacked above your hands.
  rebuildCarryStack() {
    const wanted = Math.min(8, Math.ceil(this.carried / 8));
    while (this.carryStack.length < wanted) this.carryStack.push(this.add.image(0, 0, 'item-cash').setScale(0.9));
    this.updateCarryVisuals();
  }

  updateCarryVisuals() {
    const f = this.player.facing;
    const ox = f === 'left' ? -16 : f === 'right' ? 16 : 0;
    const depth = this.player.sprite.depth + (f === 'up' ? -0.5 : 0.5);
    this.carryStack.forEach((s, i) => {
      s.setPosition(this.player.x + ox, this.player.y - 62 - i * 8).setDepth(depth);
    });
    if (this.carryBox) {
      this.carryBox.sprite.setPosition(this.player.x + ox, this.player.y - 42).setDepth(depth);
    }
    const holding = this.carried > 0;
    this.carryLabel.setVisible(holding);
    if (holding) {
      const full = this.carried >= this.carryLimit;
      const text = full ? `$${this.carried} · hands full` : `$${this.carried} / $${this.carryLimit}`;
      if (this.carryLabel.text !== text) this.carryLabel.setText(text).setColor(full ? '#fde68a' : '#b8ffcf');
      this.carryLabel.setPosition(this.player.x + ox, this.player.y - 70 - this.carryStack.length * 8);
    }
    // Empty plots glow bigger while you hold a box, to show where it can go.
    const scale = this.carryBox && !isPower(this.carryBox.itemId) ? 1.08 : 1;
    for (const p of this.plots) if (!p.itemId && p.outline.scale !== scale) p.outline.setScale(scale);
  }

  // A bouncing arrow over the laptop until an event happens (first job, first order).
  addArrowOverDesk(untilEvent) {
    this.deskArrow?.destroy();
    const { x } = DORM.starterDeskHustle.screen;
    const arrow = this.add.triangle(x, 92, 0, 0, 28, 0, 14, 22, ACCENT).setDepth(12600);
    this.tweens.add({ targets: arrow, y: 102, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.events.once(untilEvent, () => arrow.destroy());
    this.deskArrow = arrow;
  }

  floatText(text, x, y, color) {
    const t = this.add.text(x, y, text, {
      fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color, stroke: '#0b0e14', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(13000);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 1400, ease: 'Sine.out', onComplete: () => t.destroy() });
  }

  // Same as floatText, but at most once every 2 seconds (for "can't do that" hints).
  nudge(text, x, y) {
    if (this.time.now < (this.nextNudge ?? 0)) return;
    this.nextNudge = this.time.now + 2000;
    this.floatText(text, x, y, '#fca5a5');
  }

  // ---------- Movement ----------

  setMoveTarget(x, y) {
    const path = findPath(this.navGrid, this.player.x, this.player.y, x, y);
    if (!path || path.length === 0) return;
    const end = path[path.length - 1];
    this.moveTarget = { path, x: path[0].x, y: path[0].y, best: Infinity, stuckFor: 0 };
    this.targetMarker.setPosition(end.x, end.y).setVisible(true).setAlpha(1);
  }

  clearMoveTarget() {
    if (!this.moveTarget) return;
    this.moveTarget = null;
    this.targetMarker.setVisible(false);
  }

  // Follow the path's waypoints to the tapped spot. Stop on arrival, or if
  // something keeps us from getting any closer for a moment.
  steerToTarget(dt) {
    const t = this.moveTarget;
    const dx = t.x - this.player.x;
    const dy = t.y - this.player.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 6) {
      t.path.shift();
      if (t.path.length === 0) {
        this.clearMoveTarget();
        return { x: 0, y: 0 };
      }
      Object.assign(t, { x: t.path[0].x, y: t.path[0].y, best: Infinity, stuckFor: 0 });
      return this.steerToTarget(dt);
    }
    if (dist < t.best - 1) {
      t.best = dist;
      t.stuckFor = 0;
    } else {
      t.stuckFor += dt;
      if (t.stuckFor > 0.35) {
        this.clearMoveTarget();
        return { x: 0, y: 0 };
      }
    }
    return { x: dx / dist, y: dy / dist };
  }

  readInput() {
    if (this.joystick.active) return this.joystick.vector;
    const k = this.keys;
    const x = (k.d.isDown || k.right.isDown ? 1 : 0) - (k.a.isDown || k.left.isDown ? 1 : 0);
    const y = (k.s.isDown || k.down.isDown ? 1 : 0) - (k.w.isDown || k.up.isDown ? 1 : 0);
    return { x, y };
  }

  addHint() {
    const touch = this.sys.game.device.input.touch;
    const text = touch
      ? 'Tap where to go, or drag to steer'
      : 'Move: WASD / arrow keys, click where to go, or click and drag';
    this.hint = this.add.text(this.scale.width / 2, 110, text, {
      fontFamily: FONT,
      fontSize: '24px',
      color: '#5ff0ff',
      backgroundColor: '#0b0e14cc',
      padding: { x: 16, y: 10 },
    }).setOrigin(0.5, 0).setDepth(20000);
  }

  // ---------- Debug (?debug or #debug) ----------
  // green = walkable floor, red = blocked, yellow = interaction spots, dot = your feet.
  // Keys: B fill empty plots, R remove everything, M +$100, P next power supply,
  // U unlock the shop, D deliver all orders now, G hire an Augustus now, N hire a Nero now, X Nero goes rogue now, L the neighbor comes over now, Q questions on every job.
  setupDebug() {
    this.debugGfx = this.add.graphics().setDepth(15000);
    this.debugFeet = this.add.circle(this.player.x, this.player.y, 5, 0xffff00).setDepth(15001);
    const order = ['folding-laptop', 'dual-monitor-desk', 'laptop-desk', 'server-rack', 'folding-laptop'];
    this.input.keyboard.on('keydown-B', () => {
      let placed = false;
      this.plots.forEach((plot, i) => { placed = this.placeItem(order[i % order.length], plot.id) || placed; });
      if (placed) this.rebuildNavigation();
    });
    this.input.keyboard.on('keydown-R', () => {
      for (const plot of this.plots) this.removeItem(plot.id);
      this.rebuildNavigation();
    });
    this.input.keyboard.on('keydown-M', () => gameState.addCash(100));
    this.input.keyboard.on('keydown-P', () => gameState.setPowerTier((gameState.powerTier + 1) % POWER_TIERS.length));
    this.input.keyboard.on('keydown-U', () => this.checkShopUnlock(Infinity));
    this.input.keyboard.on('keydown-D', () => { for (const o of this.orders) o.remaining = 0; });
    this.input.keyboard.on('keydown-Q', () => { // every job you finish asks a question (Q again: back to normal)
      this.questionChance = this.questionChance === 1 ? QUESTION_CHANCE : 1;
    });
    this.input.keyboard.on('keydown-G', () => { // an Augustus, free and right now
      if (this.agentCount() < MAX_AGENTS) this.arrivals.push({ type: 'augustus', remaining: 0.1 });
    });
    this.input.keyboard.on('keydown-L', () => { // the neighbor comes over now
      if (this.neighbor.state === 'calm') this.neighbor.startComing();
    });
    this.input.keyboard.on('keydown-N', () => { // a Nero, free and right now
      if (this.agentCount() < MAX_AGENTS) this.arrivals.push({ type: 'nero', remaining: 0.1 });
    });
    this.input.keyboard.on('keydown-X', () => { // the first Nero goes rogue now
      this.agents.find((a) => a.rogueCfg && a.state !== 'rogue')?.goRogue();
    });
    this.drawDebug();
  }

  drawDebug() {
    const g = this.debugGfx;
    if (!g) return;
    const pts = (shape) => shape.map(([x, y]) => ({ x, y }));
    g.clear();
    g.lineStyle(3, 0x00ff66, 0.9);
    g.strokePoints(pts(DORM.floor), true);
    g.lineStyle(2, 0xff3355, 0.9);
    for (const shape of this.blocked) g.strokePoints(pts(shape), true);
    g.lineStyle(2, 0xffd000, 0.8);
    for (const spot of [DORM.stash, DORM.breaker, DORM.deliverySpot, ...this.stations.map((s) => s.spot)]) {
      g.strokeCircle(spot.x, spot.y, spot.reach ?? 20);
    }
  }
}
