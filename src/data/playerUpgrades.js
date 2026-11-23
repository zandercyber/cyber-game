// Upgrades for you, bought in the shop's Upgrades tab. 5 levels each; the
// price doubles every level. Numbers are first guesses to tune.

export const PLAYER_MAX_LEVEL = 5;

// How much cash you can hold at once, per level (level 0 = starting limit).
// Machine piles go up to $300 (server rack), so early on a big pile takes a few trips.
const CARRY_LIMITS = [100, 150, 250, 400, 600, 1000];

export const PLAYER_UPGRADES = {
  carry: {
    name: 'Carry limit',
    prices: [100, 200, 400, 800, 1600],
    describe: (lvl) => `Hold up to $${CARRY_LIMITS[lvl]} at once`,
  },
  speed: {
    name: 'Your speed',
    prices: [100, 200, 400, 800, 1600],
    describe: (lvl) => (lvl === 0 ? 'Normal walking speed' : `Walk ${10 * lvl}% faster`),
  },
  work: {
    name: 'Work speed',
    prices: [150, 300, 600, 1200, 2400],
    describe: (lvl) => (lvl === 0 ? 'Finish jobs at normal speed' : `Finish jobs ${20 * lvl}% faster`),
  },
};
export const PLAYER_UPGRADE_IDS = Object.keys(PLAYER_UPGRADES);

/** What you can do at the given upgrade levels. */
export function playerStats(levels) {
  return {
    carryLimit: CARRY_LIMITS[levels.carry],
    speedMultiplier: 1 + 0.1 * levels.speed,
    workRate: 1 + 0.2 * levels.work, // job speed; agents work slower than this (Augustus 0.5x, Nero 0.8x)
  };
}

export const noPlayerLevels = () => ({ carry: 0, speed: 0, work: 0 });
