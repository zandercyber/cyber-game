// Everything you can buy. Prices, watts and delivery times are first guesses
// to tune once the money loop exists.
//
// earns: how the item makes money once installed.
//   mode 'work': stand at it to do jobs (hustles, bounties); it heats up.
//   mode 'idle': it does jobs on its own (no item uses this now; Augustus works machines instead).
//   jobs: which job list (see hustles.js); payMultiplier scales each job's pay;
//   pileMax: cash it holds before it stops and you have to collect.

// file: image path relative to src/assets.
export const ITEMS = {
  'folding-laptop': {
    name: 'Old laptop + folding table',
    file: 'stations/folding-laptop.png',
    price: 25,
    watts: 45,
    noise: 1, // while being worked (see neighbor.js)
    deliverySeconds: 15,
    footprint: [[-54, -48], [-54, -59], [53, -59], [53, -39], [-12, -5], [-53, -26]],
    earns: { mode: 'work', jobs: 'helpdesk', payMultiplier: 1.5, heat: 'laptop', pileMax: 60 },
  },
  'laptop-desk': {
    name: 'Laptop desk',
    file: 'stations/laptop-desk.png',
    price: 80,
    watts: 90,
    noise: 1, // while being worked (see neighbor.js)
    deliverySeconds: 25,
    // Floor area the item covers, relative to the bottom-center of its image.
    footprint: [[-68, -40], [-68, -70], [70, -70], [70, -21], [37, -5], [-23, -15]],
    earns: { mode: 'work', jobs: 'helpdesk', payMultiplier: 2.5, heat: 'laptop', pileMax: 100 },
  },
  'dual-monitor-desk': {
    name: 'Dual-monitor workstation',
    file: 'stations/dual-monitor-desk.png',
    price: 250,
    watts: 350,
    noise: 2, // while being worked (see neighbor.js)
    deliverySeconds: 45,
    footprint: [[-105, -38], [-105, -92], [104, -92], [104, -70], [69, -12], [-41, -4]],
    earns: { mode: 'work', jobs: 'bounty', payMultiplier: 1, heat: 'workstation', pileMax: 200 },
  },
  'server-rack': {
    name: 'Server rack',
    file: 'stations/server-rack.png',
    price: 1000, // one-hour pass (Nov 24): was 1,500 (first pass 900)
    watts: 900,
    noise: 4, // while being worked (see neighbor.js)
    deliverySeconds: 120,
    footprint: [[-83, -42], [-83, -71], [82, -71], [82, -51], [70, -43], [-8, -4], [-71, -35]],
    // ~10 $/s while worked.
    earns: { mode: 'work', jobs: 'agents', payMultiplier: 4, heat: 'rack', pileMax: 300 },
  },
  'gpu-rig': {
    name: 'GPU rig',
    file: 'stations/gpu-rig.png', // Zander's Gemini art, resampled to a 108x104 grid and drawn at 2x
    price: 3000, // one-hour pass (Nov 24): was 6,000 (first pass 2,500)
    watts: 1500, // needs the battery backup (UPS) or better
    noise: 5, // while being worked (see neighbor.js)
    deliverySeconds: 150,
    footprint: [[-92, -56], [-32, -14], [92, -80], [31, -120]], // pulled in a little at the front so paths to the work spot clear its corner
    // Best pay in the dorm (~20 $/s while worked), but it runs hot. Agents go for it first.
    earns: { mode: 'work', jobs: 'training', payMultiplier: 7, heat: 'gpu', pileMax: 500 },
  },
};

// The power supply you keep upgrading. Going over capacity trips the breaker.
// Upgrades are ordered at the shop, arrive as a box, and get carried to the
// breaker panel. icon: image shown in the HUD and shop (null = none yet).
export const POWER_TIERS = [
  { id: 'wall-outlet', name: 'Wall outlet', capacity: 500, price: 0, deliverySeconds: 0, icon: null },
  { id: 'power-strip', name: 'Power strip', capacity: 900, price: 60, deliverySeconds: 10, icon: 'item-power-strip' },
  { id: 'surge-protector', name: 'Surge protector', capacity: 1500, price: 200, deliverySeconds: 20, icon: 'item-surge-protector' },
  { id: 'ups', name: 'Battery backup (UPS)', capacity: 2200, price: 600, deliverySeconds: 40, icon: 'item-ups' },
  { id: 'dedicated-circuit', name: 'Dedicated circuit', capacity: 3500, price: 1500, deliverySeconds: 60, icon: 'item-dedicated-circuit' },
  // Room for two GPU rigs.
  { id: 'sub-panel', name: 'Electrical sub-panel', capacity: 5000, price: 4500, deliverySeconds: 90, icon: 'item-sub-panel' },
];

// Power upgrades by id (everything after the starting wall outlet), with their tier number.
export const POWER_ITEMS = Object.fromEntries(POWER_TIERS.slice(1).map((t, i) => [t.id, { ...t, tier: i + 1 }]));

// Foam wall panels on the wall above the bed: 3 levels, bought one at a time. Each level
// makes noise wear out the neighbor's patience FOAM_QUIET_PER_LEVEL (10%) slower, so they
// come over a little less often. The box goes to the bed (DORM.foamWall).
export const FOAM_QUIET_PER_LEVEL = 0.1;
export const FOAM_LEVELS = [
  { id: 'foam-1', name: 'Foam panels', level: 1, price: 150, deliverySeconds: 20 },
  { id: 'foam-2', name: 'More foam panels', level: 2, price: 400, deliverySeconds: 30 },
  { id: 'foam-3', name: 'Full foam wall', level: 3, price: 900, deliverySeconds: 40 },
];
export const FOAM_MAX_LEVEL = FOAM_LEVELS.length;
export const FOAM_ITEMS = Object.fromEntries(FOAM_LEVELS.map((f) => [f.id, f]));

// A box fan that clips onto one machine (one fan per machine): it heats up 40% slower
// and cools down 50% faster, but adds 1 noise while that machine is being worked.
// Bought in the shop's Room tab; carry the box to a machine. Draws 20 W.
export const FAN = {
  id: 'fan', name: 'Box fan', price: 100, watts: 20, deliverySeconds: 20, icon: 'item-fan',
  heatSlower: 0.6, // heat builds at this rate (40% slower)
  coolFaster: 1.5, // cools 50% faster
  noise: 1, // extra noise while its machine is worked
};
export const FAN_ITEMS = { fan: FAN };

/** Anything you can order: a machine (ITEMS), a power upgrade (POWER_ITEMS), foam (FOAM_ITEMS) or a fan. null if unknown. */
export function orderable(id) {
  if (typeof id !== 'string') return null;
  if (Object.hasOwn(ITEMS, id)) return ITEMS[id];
  if (Object.hasOwn(POWER_ITEMS, id)) return POWER_ITEMS[id];
  if (Object.hasOwn(FOAM_ITEMS, id)) return FOAM_ITEMS[id];
  if (Object.hasOwn(FAN_ITEMS, id)) return FAN_ITEMS[id];
  return null;
}

// Small images used around the game (HUD icons, carried things, tools).
// Paths are relative to src/assets.
export const SMALL_IMAGES = {
  'item-box': 'items/box.png',
  'item-cash': 'items/cash.png',
  'item-fan': 'items/fan.png',
  'item-power-strip': 'items/power-strip.png',
  'item-surge-protector': 'items/surge-protector.png',
  'item-ups': 'items/ups.png',
  'item-dedicated-circuit': 'items/dedicated-circuit.png',
  'item-sub-panel': 'items/sub-panel.png', // Zander's Gemini art, cut out and shrunk to 55x64
  'item-shovel': 'items/shovel.png',
  'foam-charcoal': 'foam/foam-charcoal.png',
  'foam-navy': 'foam/foam-navy.png',
};

// Share of the price you get back when you shovel an item out of a plot.
export const SHOVEL_REFUND = 0.25;

// The corner laptop is always plugged in, so it counts against your power supply.
// (When the breaker trips it keeps going on its battery.)
export const STARTER_LAPTOP_WATTS = 60;
