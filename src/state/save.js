// Saving progress in the browser (localStorage).
// Nothing leaves the player's device. One save per browser.
//
// A save is treated as untrusted input: players can edit it, or it can be
// corrupted. Loading only reads the fields we expect, checks every value,
// and falls back to defaults for anything that doesn't make sense.

import { ITEMS, POWER_TIERS, FOAM_MAX_LEVEL, orderable } from '../data/catalog.js';
import { AGENT_TYPES, AGENT_TYPE_IDS, AGENT_LEVEL_MAX, MAX_AGENTS, isAgentType, noAgentLevels, hirePrice, agentName } from '../data/agents.js';
import { QUESTIONS } from '../data/questions.js';
import { PLAYER_MAX_LEVEL, PLAYER_UPGRADE_IDS } from '../data/playerUpgrades.js';
import { CLOCK, MINUTES_PER_DAY } from '../data/clock.js';
import { UPDATES } from '../data/maintenance.js';
import { PHISHING, EMAILS } from '../data/phishing.js';
import { SECURITY_UPGRADES, SECURITY_UPGRADE_IDS, securityMax } from '../data/security.js';

const KEY = 'cyber-game-save';
const VERSION = 1;
const MAX_CASH = 1_000_000_000;

let suspended = false; // set while starting a new game, so the old state isn't re-saved

export function writeSave(data) {
  if (suspended) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, savedAt: Date.now(), ...data }));
    return true;
  } catch {
    return false; // storage full, blocked, or private browsing: keep playing
  }
}

export function clearSave() {
  suspended = true;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}

/**
 * Reads and checks the save. Returns null if there's no usable save.
 * limits: { plotIds, pileMax } from the room, so values stay in range.
 */
export function readSave({ plotIds, pileMax }) {
  let raw;
  try {
    raw = JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;

  const num = (value, min, max, fallback = min) =>
    Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  const int = (value, min, max, fallback = min) => Math.round(num(value, min, max, fallback));

  const plots = {};
  if (raw.plots && typeof raw.plots === 'object') {
    for (const id of plotIds) {
      const itemId = raw.plots[id];
      if (typeof itemId === 'string' && Object.hasOwn(ITEMS, itemId)) plots[id] = itemId;
    }
  }

  const obj = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
  // Anything orderable can be on the way or in a box: machines and power upgrades.
  const isOrderable = (id) => orderable(id) !== null;
  const station = (value, max) => {
    const v = obj(value);
    return {
      pile: int(v.pile, 0, max), heat: num(v.heat, 0, 100), overheated: v.overheated === true, broken: v.broken === true, off: v.off === true,
      // Maintenance (src/data/maintenance.js): crashed servers, PC updates. Missing = fresh.
      crashed: v.crashed === true,
      fan: v.fan === true, // a box fan clipped on
      updateIn: Number.isFinite(v.updateIn) ? num(v.updateIn, 0, UPDATES.every[1]) : null,
      updateDue: v.updateDue === true,
      updateAge: num(v.updateAge, 0, UPDATES.graceSeconds * 100),
    };
  };

  // Per-machine piles and heat, only for plots that really hold an earning item.
  const machines = {};
  const rawMachines = obj(raw.machines);
  for (const [plotId, itemId] of Object.entries(plots)) {
    const earns = ITEMS[itemId].earns;
    if (earns && Object.hasOwn(rawMachines, plotId)) machines[plotId] = station(rawMachines[plotId], earns.pileMax);
  }

  const orders = (Array.isArray(raw.orders) ? raw.orders : [])
    .slice(0, 20)
    .map(obj)
    .filter((o) => isOrderable(o.itemId))
    .map((o) => ({ itemId: o.itemId, remaining: num(o.remaining, 0, orderable(o.itemId).deliverySeconds) }));
  const boxes = (Array.isArray(raw.boxes) ? raw.boxes : []).slice(0, 10).filter(isOrderable);

  // AI agents: who's here, who's on the way, and each type's upgrade levels.
  // Older saves stored a single "augustus" field; it's read as one agent.
  const legacy = obj(raw.augustus);
  const rawAgentLevels = obj(raw.agentLevels);
  const agentLevels = Object.fromEntries(AGENT_TYPE_IDS.map((type) => {
    const src = obj(Object.hasOwn(rawAgentLevels, type) ? rawAgentLevels[type] : type === 'augustus' ? legacy.levels : null);
    const levels = Object.fromEntries(Object.keys(noAgentLevels(type)).map((k) => [k, int(src[k], 0, AGENT_LEVEL_MAX)]));
    return [type, levels];
  }));
  let rawAgents = Array.isArray(raw.agents) ? raw.agents : [];
  let rawArrivals = Array.isArray(raw.arrivals) ? raw.arrivals : [];
  if (!Array.isArray(raw.agents) && legacy.hired === true) rawAgents = [{ ...legacy, type: 'augustus' }];
  if (!Array.isArray(raw.arrivals) && legacy.hired !== true && Number.isFinite(legacy.arriving)) {
    rawArrivals = [{ type: 'augustus', remaining: legacy.arriving }];
  }
  const OLD_MAX_AGENTS = 3;
  // The dorm fits MAX_AGENTS (it used to fit 3). Agents past the limit, last hired first, go home
  // and you get back what you paid for each (its hire price when it was hired).
  const hired = [...rawAgents, ...rawArrivals].map(obj).filter((a) => isAgentType(a.type));
  const sentHome = [];
  let refund = 0;
  hired.forEach((a, i) => {
    const nth = hired.slice(0, i).filter((b) => b.type === a.type).length; // how many of this type came before it
    if (i < MAX_AGENTS || i >= OLD_MAX_AGENTS) return; // only the ones a real save could have had
    refund += hirePrice(a.type, nth);
    sentHome.push(agentName(a.type, nth));
  });
  const agents = rawAgents.map(obj).filter((a) => isAgentType(a.type)).slice(0, MAX_AGENTS).map((a) => {
    const cfg = AGENT_TYPES[a.type];
    const maxAwake = cfg.stats(agentLevels[a.type]).awakeSeconds;
    const rogue = cfg.rogue
      ? {
        rogue: a.rogue === true,
        rogueIn: Number.isFinite(a.rogueIn) ? num(a.rogueIn, 0, cfg.stats(agentLevels[a.type]).rogueEvery[1]) : null,
        quarantine: num(a.quarantine, 0, cfg.rogue.quarantineSeconds),
      }
      : {};
    return {
      type: a.type,
      ...rogue,
      awake: num(a.awake, 0, maxAwake, maxAwake),
      nap: num(a.nap, 0, cfg.napSeconds ?? 0),
      asleep: a.asleep === true && Boolean(cfg.naps), // nap over, waiting for you to wake him
      carried: int(a.carried, 0, MAX_CASH),
      // Checked against the room by the scene before it's used.
      position: Number.isFinite(a.x) && Number.isFinite(a.y) ? { x: a.x, y: a.y } : null,
    };
  });
  const arrivals = rawArrivals.map(obj).filter((a) => isAgentType(a.type)).slice(0, MAX_AGENTS - agents.length)
    .map((a) => ({ type: a.type, remaining: num(a.remaining, 0, AGENT_TYPES[a.type].arriveSeconds) }));

  // Questions already seen per group: unique whole numbers inside that group's bank.
  const rawSeen = obj(raw.questionsSeen);
  const questionsSeen = Object.fromEntries(Object.entries(QUESTIONS).map(([group, bank]) => {
    const list = Array.isArray(rawSeen[group]) ? rawSeen[group] : [];
    const ok = list.filter((i) => Number.isInteger(i) && i >= 0 && i < bank.length);
    return [group, [...new Set(ok)]];
  }));

  // Your own upgrade levels (carry limit, speed).
  const rawLevels = obj(raw.playerLevels);
  const playerLevels = Object.fromEntries(PLAYER_UPGRADE_IDS.map((k) => [k, int(rawLevels[k], 0, PLAYER_MAX_LEVEL)]));

  // The neighbor: how annoyed, how many complaints so far, and whether a visit was under way.
  const n = obj(raw.neighbor);
  const neighbor = {
    annoyance: num(n.annoyance, 0, 100),
    complaints: int(n.complaints, 0, 50),
    visit: n.visit === true,
  };

  // Foam panels on the wall (0 = none).
  const foamLevel = int(raw.foamLevel, 0, FOAM_MAX_LEVEL, 0);

  // Time of day (older saves have none: the clock starts fresh at 8 AM on day 1).
  const c = obj(raw.clock);
  const clock = Object.hasOwn(raw, 'clock')
    ? { day: int(c.day, 1, 100000, 1), minutes: num(c.minutes, 0, MINUTES_PER_DAY - 0.1, CLOCK.startHour * 60) }
    : null;

  // Phishing: time to the next email, an email waiting on a PC (plot + which email), emails seen.
  const p = obj(raw.phishing);
  const phishing = Object.hasOwn(raw, 'phishing') ? {
    nextIn: num(p.nextIn, 0, Math.max(PHISHING.firstAfter, PHISHING.every[1]), PHISHING.firstAfter),
    plotId: typeof p.plotId === 'string' && plotIds.includes(p.plotId) ? p.plotId : null,
    email: Number.isInteger(p.email) && p.email >= 0 && p.email < EMAILS.length ? p.email : null,
    left: num(p.left, 0, PHISHING.reachSeconds + SECURITY_UPGRADES.training.reach * securityMax('training')),
    seen: [...new Set((Array.isArray(p.seen) ? p.seen : []).filter((i) => Number.isInteger(i) && i >= 0 && i < EMAILS.length))],
    filtered: int(p.filtered, 0, 100000),
    saved: int(p.saved, 0, MAX_CASH),
  } : null;

  // Security tools you bought (older saves have none).
  const rawSecurity = obj(raw.securityLevels);
  const securityLevels = Object.fromEntries(SECURITY_UPGRADE_IDS.map((k) => [k, int(rawSecurity[k], 0, securityMax(k))]));

  const desk = raw.desk && typeof raw.desk === 'object' ? raw.desk : {};
  const player = raw.player && typeof raw.player === 'object' ? raw.player : {};
  const facing = ['down', 'left', 'right', 'up'].includes(player.facing) ? player.facing : 'down';

  return {
    cash: int(raw.cash, 0, MAX_CASH),
    shopUnlocked: raw.shopUnlocked === true,
    machines,
    orders,
    boxes,
    carryBox: isOrderable(raw.carryBox) ? raw.carryBox : null,
    powerTier: int(raw.powerTier, 0, POWER_TIERS.length - 1),
    tripped: raw.tripped === true, // older saves don't have it: not tripped
    agents,
    arrivals,
    agentsSentHome: { names: sentHome, refund },
    agentLevels,
    questionsSeen,
    playerLevels,
    securityLevels,
    neighbor,
    clock,
    foamLevel,
    phishing,
    carried: int(raw.carried, 0, MAX_CASH),
    plots,
    desk: {
      pile: int(desk.pile, 0, pileMax),
      heat: num(desk.heat, 0, 100),
      overheated: desk.overheated === true,
    },
    // Position is checked against the room by the scene before it's used.
    player: Number.isFinite(player.x) && Number.isFinite(player.y) ? { x: player.x, y: player.y, facing } : null,
  };
}
