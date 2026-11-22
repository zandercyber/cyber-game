// Saving progress in the browser (localStorage).
// Nothing leaves the player's device. One save per browser.
//
// A save is treated as untrusted input: players can edit it, or it can be
// corrupted. Loading only reads the fields we expect, checks every value,
// and falls back to defaults for anything that doesn't make sense.

import { ITEMS, POWER_TIERS } from '../data/catalog.js';

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
  const isItem = (id) => typeof id === 'string' && Object.hasOwn(ITEMS, id);
  const station = (value, max) => {
    const v = obj(value);
    return { pile: int(v.pile, 0, max), heat: num(v.heat, 0, 100), overheated: v.overheated === true };
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
    .filter((o) => isItem(o.itemId))
    .map((o) => ({ itemId: o.itemId, remaining: num(o.remaining, 0, ITEMS[o.itemId].deliverySeconds) }));
  const boxes = (Array.isArray(raw.boxes) ? raw.boxes : []).slice(0, 10).filter(isItem);

  const desk = raw.desk && typeof raw.desk === 'object' ? raw.desk : {};
  const player = raw.player && typeof raw.player === 'object' ? raw.player : {};
  const facing = ['down', 'left', 'right', 'up'].includes(player.facing) ? player.facing : 'down';

  return {
    cash: int(raw.cash, 0, MAX_CASH),
    shopUnlocked: raw.shopUnlocked === true,
    machines,
    orders,
    boxes,
    carryBox: isItem(raw.carryBox) ? raw.carryBox : null,
    powerTier: int(raw.powerTier, 0, POWER_TIERS.length - 1),
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
