// Augustus, the first AI agent type (see agents.js). He rides his cloud around the room, works
// machines (slower than you), carries cash piles to the hamper, and naps for a
// minute to "reset credits" when his energy runs out.
// All numbers are first guesses to tune.

export const AUGUSTUS = {
  hirePrice: 300,
  arriveSeconds: 6, // after hiring, he floats in through the door this much later
  moveSpeed: 150, // world pixels per second (you move at 240)
  workRate: 0.6, // how fast he finishes jobs compared with you
  awakeSeconds: 90, // energy: time awake before he needs a nap
  napSeconds: 60, // the nap itself ("resetting credits")
  drowsySeconds: 2, // eyes closing before he falls asleep
  collectAt: 0.5, // he goes for a cash pile once it's this full
  scale: 3, // sprite sheet is drawn at 3x (20x26 frames)
};

// Shop upgrades. Each has 5 levels; the price doubles every level.
export const MAX_LEVEL = 5;
export const AUGUSTUS_UPGRADES = {
  speed: {
    name: 'Augustus speed',
    prices: [100, 200, 400, 800, 1600],
    describe: (lvl) => `Floats and works ${15 * lvl}% faster`,
  },
  profit: {
    name: 'Augustus profit',
    prices: [150, 300, 600, 1200, 2400],
    describe: (lvl) => `+${15 * lvl}% pay on jobs he does`,
  },
  energy: {
    name: 'Augustus energy',
    prices: [100, 200, 400, 800, 1600],
    describe: (lvl) => `Awake ${AUGUSTUS.awakeSeconds + 30 * lvl}s between naps`,
  },
};

/** What Augustus can do at the given upgrade levels. */
export function augustusStats(levels) {
  return {
    moveSpeed: AUGUSTUS.moveSpeed * (1 + 0.15 * levels.speed),
    workRate: AUGUSTUS.workRate * (1 + 0.15 * levels.speed),
    payBonus: 1 + 0.15 * levels.profit,
    awakeSeconds: AUGUSTUS.awakeSeconds + 30 * levels.energy,
  };
}
