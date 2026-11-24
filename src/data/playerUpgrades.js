// Upgrades for you, bought in the shop's You tab. 5 levels each; prices climb
// about 2.5x per level (balance pass, Nov 23: tuned for ~2 hours to finish the dorm).

export const PLAYER_MAX_LEVEL = 5;

// How much cash you can hold at once, per level (level 0 = starting limit).
// Machine piles go up to $300 (server rack), so early on a big pile takes a few trips.
const CARRY_LIMITS = [100, 150, 250, 400, 600, 1000];

export const PLAYER_UPGRADES = {
  carry: {
    name: 'Carry limit',
    prices: [100, 300, 800, 2000, 5000],
    describe: (lvl) => `Hold up to $${CARRY_LIMITS[lvl]} at once`,
  },
  speed: {
    name: 'Your speed',
    prices: [100, 250, 600, 1500, 4000],
    describe: (lvl) => (lvl === 0 ? 'Normal walking speed' : `Walk ${10 * lvl}% faster`),
  },
  work: {
    name: 'Work speed',
    prices: [200, 500, 1200, 3000, 7500],
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
