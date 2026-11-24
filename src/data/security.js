// Security tools, bought in the shop's Security tab. They're software, so they
// work right away (no box to carry). Each one answers a cyber attack; for now
// that's phishing (src/systems/Phishing.js). Later attacks get their own tools.

export const SECURITY_UPGRADES = {
  filter: {
    name: 'Email filter',
    prices: [250, 600, 1500],
    catches: [0, 0.25, 0.45, 0.65], // share of phishing emails stopped before they land (real emails always get through)
    describe: (lvl) => (lvl === 0
      ? 'No filter: every email lands'
      : `Stops ${Math.round(SECURITY_UPGRADES.filter.catches[lvl] * 100)}% of phishing before it lands`),
  },
  mfa: {
    name: 'MFA',
    prices: [400, 1200],
    cuts: [0, 0.5, 0.8], // share of a phishing theft it blocks: a stolen password alone isn't enough
    describe: (lvl) => ['No MFA: a stolen password is all they need',
      'App MFA: phishing steals half as much',
      'Security keys: phishing steals 80% less'][lvl],
  },
  training: {
    name: 'Phishing training',
    prices: [150, 350, 800],
    reach: 10, // +10 s per level to walk up to a new email
    answer: 5, // +5 s per level to answer it
    describe: (lvl) => (lvl === 0
      ? 'No training yet'
      : `+${10 * lvl}s to reach new emails, +${5 * lvl}s to answer`),
  },
};
export const SECURITY_UPGRADE_IDS = Object.keys(SECURITY_UPGRADES);
export const securityMax = (kind) => SECURITY_UPGRADES[kind].prices.length;
export const noSecurityLevels = () => ({ filter: 0, mfa: 0, training: 0 });
