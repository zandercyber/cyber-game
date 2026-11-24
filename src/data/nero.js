// Nero, the high-risk, high-reward AI agent. Stronger than Augustus (works at
// 80% of your speed, +50% pay, never naps), but about every 5 minutes he goes
// rogue: he races between machines frying them until you catch him by staying
// right next to him for 3 seconds. Then he's quarantined for a minute.
// All numbers are first guesses to tune.

export const NERO = {
  hirePrice: 6000, // doubles for each extra Nero (balance pass: was 2,500)
  arriveSeconds: 8,
  moveSpeed: 190, // world pixels per second (you move at 240)
  workRate: 0.8, // job speed compared with you (you: 1x, up to 2x with Work speed)
  payBonus: 1.5, // +50% pay on jobs he does
  scale: 3, // sprite sheet is drawn at 3x (28x30 frames)
  rogue: {
    every: [240, 360], // seconds between rogue episodes, picked at random (about every 5 minutes)
    speed: 1.4, // he moves this much faster while rogue
    hackSeconds: 2, // time at a machine before he fries it
    catchSeconds: 3, // stay next to him this long to contain him
    catchRange: 75, // how close counts as "next to him"
    catchDecay: 0.35, // share of the catch lost per second when you're not next to him
    quarantineSeconds: 60,
  },
};

export const NERO_UPGRADES = {
  speed: {
    name: 'Nero speed',
    prices: [800, 2000, 5000, 12000, 30000],
    describe: (lvl) => `Floats ${15 * lvl}% faster, works ${12 * lvl}% faster`,
  },
  profit: {
    name: 'Nero profit',
    prices: [1000, 2500, 6000, 15000, 35000],
    describe: (lvl) => `+${50 + 15 * lvl}% pay on jobs he does`,
  },
  stability: {
    name: 'Nero stability',
    prices: [600, 1500, 4000, 10000, 25000],
    describe: (lvl) => (lvl === 0 ? 'Goes rogue about every 5 minutes' : `Goes rogue ${Math.round(100 - 100 / (1 + 0.25 * lvl))}% less often`),
  },
};

/** What Nero can do at the given upgrade levels. */
export function neroStats(levels) {
  return {
    moveSpeed: NERO.moveSpeed * (1 + 0.15 * levels.speed),
    workRate: NERO.workRate * (1 + 0.12 * levels.speed), // up to about 1.3x
    payBonus: NERO.payBonus + 0.15 * levels.profit,
    awakeSeconds: 0, // never naps
    rogueEvery: NERO.rogue.every.map((s) => s * (1 + 0.25 * levels.stability)),
  };
}
