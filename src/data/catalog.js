// Everything you can buy. Prices, watts and delivery times are first guesses
// to tune once the money loop exists.

// file: image path relative to src/assets.
export const ITEMS = {
  'folding-laptop': {
    name: 'Old laptop + folding table',
    file: 'stations/folding-laptop.png',
    price: 25,
    watts: 45,
    deliverySeconds: 15,
    footprint: [[-54, -48], [-54, -59], [53, -59], [53, -39], [-12, -5], [-53, -26]],
  },
  'laptop-desk': {
    name: 'Laptop desk',
    file: 'stations/laptop-desk.png',
    price: 80,
    watts: 90,
    deliverySeconds: 25,
    // Floor area the item covers, relative to the bottom-center of its image.
    footprint: [[-68, -40], [-68, -70], [70, -70], [70, -21], [37, -5], [-23, -15]],
  },
  'dual-monitor-desk': {
    name: 'Dual-monitor workstation',
    file: 'stations/dual-monitor-desk.png',
    price: 250,
    watts: 350,
    deliverySeconds: 45,
    footprint: [[-105, -38], [-105, -92], [104, -92], [104, -70], [69, -12], [-41, -4]],
  },
  'server-rack': {
    name: 'Server rack',
    file: 'stations/server-rack.png',
    price: 900,
    watts: 900,
    deliverySeconds: 120,
    footprint: [[-83, -42], [-83, -71], [82, -71], [82, -51], [70, -43], [-8, -4], [-71, -35]],
  },
};

// The power supply you keep upgrading. Going over capacity will trip the breaker.
// icon: image shown next to the power meter (null = none yet).
export const POWER_TIERS = [
  { id: 'wall-outlet', name: 'Wall outlet', capacity: 500, price: 0, icon: null },
  { id: 'power-strip', name: 'Power strip', capacity: 900, price: 60, icon: 'item-power-strip' },
  { id: 'surge-protector', name: 'Surge protector', capacity: 1500, price: 200, icon: 'item-surge-protector' },
  { id: 'ups', name: 'Battery backup (UPS)', capacity: 2200, price: 600, icon: 'item-ups' },
  { id: 'dedicated-circuit', name: 'Dedicated circuit', capacity: 3500, price: 1500, icon: null },
];

// Small images used around the game (HUD icons, carried things, tools).
// Paths are relative to src/assets.
export const SMALL_IMAGES = {
  'item-box': 'items/box.png',
  'item-cash': 'items/cash.png',
  'item-fan': 'items/fan.png',
  'item-power-strip': 'items/power-strip.png',
  'item-surge-protector': 'items/surge-protector.png',
  'item-ups': 'items/ups.png',
  'item-shovel': 'items/shovel.png',
};

// Share of the price you get back when you shovel an item out of a plot.
export const SHOVEL_REFUND = 0.25;
