// Every kind of AI agent you can hire (Augustus and Nero), and the
// rules for hiring them. Up to MAX_AGENTS in the dorm at once, any mix of types.
// Agents of the same type share their upgrade levels.

import { AUGUSTUS, AUGUSTUS_UPGRADES, augustusStats } from './augustus.js';
import { NERO, NERO_UPGRADES, neroStats } from './nero.js';

export const MAX_AGENTS = 2; // the dorm is small (was 3; older saves with more are refunded on load)
export const AGENT_LEVEL_MAX = 5;

export const AGENT_TYPES = {
  augustus: {
    name: 'Augustus',
    blurb: 'AI agent on a cloud. Works your machines and carries cash to the hamper.',
    hirePrice: AUGUSTUS.hirePrice, // doubles for each extra Augustus
    arriveSeconds: AUGUSTUS.arriveSeconds,
    texture: 'augustus',
    frames: { front: 0, side: 1, drowsy: 2, sleep: [3, 4, 5] },
    scale: AUGUSTUS.scale,
    naps: true,
    napSeconds: AUGUSTUS.napSeconds,
    drowsySeconds: AUGUSTUS.drowsySeconds,
    collectAt: AUGUSTUS.collectAt,
    upgrades: AUGUSTUS_UPGRADES,
    stats: augustusStats,
  },
  nero: {
    name: 'Nero',
    blurb: '+50% pay, never naps. Goes rogue about every 5 min: catch him!',
    hirePrice: NERO.hirePrice, // doubles for each extra Nero
    arriveSeconds: NERO.arriveSeconds,
    texture: 'nero',
    frames: { front: 0, side: 1, rogueFront: 2, rogueSide: 3 },
    scale: NERO.scale,
    naps: false,
    collectAt: 0.5,
    rogue: NERO.rogue,
    upgrades: NERO_UPGRADES,
    stats: neroStats,
  },
};

export const AGENT_TYPE_IDS = Object.keys(AGENT_TYPES);
export const isAgentType = (type) => typeof type === 'string' && Object.hasOwn(AGENT_TYPES, type);

const NUMERALS = ['', ' II', ' III', ' IV', ' V'];
/** Augustus, Augustus II, Augustus III... */
export const agentName = (type, nth) => AGENT_TYPES[type].name + (NUMERALS[nth] ?? ` ${nth + 1}`);

/** Price of the next agent of this type: doubles for each one you already have (or have coming). */
export const hirePrice = (type, owned) => AGENT_TYPES[type].hirePrice * 2 ** owned;

export const noAgentLevels = (type) => Object.fromEntries(Object.keys(AGENT_TYPES[type].upgrades).map((k) => [k, 0]));
