// Jobs that machines do, and how they heat up. Real help-desk and security work.
// seconds: how long one job takes; pay: cash it adds to the machine's pile.

// Quick help-desk gigs (starter desk and cheap laptops).
export const HELPDESK_JOBS = [
  { name: 'Reset a locked account', seconds: 3, pay: 4 },
  { name: 'Set up 2FA for a neighbor', seconds: 3, pay: 4 },
  { name: 'Remove adware from a laptop', seconds: 4, pay: 6 },
  { name: 'Recover a deleted file', seconds: 4, pay: 5 },
  { name: 'Change a router\'s default password', seconds: 4, pay: 6 },
  { name: 'Clean phishing emails out of an inbox', seconds: 5, pay: 7 },
  { name: 'Update an old Wi-Fi router', seconds: 5, pay: 8 },
];

// Bug bounties (the dual-monitor workstation): slower jobs, bigger payouts.
export const BOUNTY_JOBS = [
  { name: 'Find a reflected XSS bug', seconds: 6, pay: 30 },
  { name: 'Report an exposed cloud storage bucket', seconds: 5, pay: 22 },
  { name: 'Find an IDOR in a shopping API', seconds: 7, pay: 40 },
  { name: 'Spot SQL injection in a login form', seconds: 8, pay: 50 },
  { name: 'Report a subdomain takeover', seconds: 6, pay: 28 },
  { name: 'Find leaked API keys in a public repo', seconds: 5, pay: 25 },
];

// AI agent business (the server rack): you or Augustus run the agents.
export const AGENT_JOBS = [
  { name: 'AI agent triaging a client\'s alerts', seconds: 8, pay: 20 },
  { name: 'AI agent summarizing threat intel', seconds: 8, pay: 18 },
  { name: 'AI agent reviewing firewall logs', seconds: 10, pay: 26 },
  { name: 'AI agent answering help-desk tickets', seconds: 9, pay: 22 },
];

// AI model training (the GPU rig): long jobs, the best pay in the dorm.
export const TRAINING_JOBS = [
  { name: 'Fine-tune a support chatbot', seconds: 10, pay: 28 },
  { name: 'Train a phishing-email classifier', seconds: 12, pay: 34 },
  { name: 'Train a malware-detection model', seconds: 14, pay: 40 },
  { name: 'Red-team a model for jailbreaks', seconds: 11, pay: 32 },
  { name: 'Run safety evals for a client\'s model', seconds: 9, pay: 24 },
  { name: 'Train an anomaly detector on network logs', seconds: 13, pay: 36 },
];

// Heat: working warms the machine; at 100 it overheats and must fully cool down.
export const HEAT = {
  starterDesk: { perSecondWorking: 5, perSecondCooling: 10, idleCooling: 6 }, // ~20 s of work
  laptop: { perSecondWorking: 6, perSecondCooling: 10, idleCooling: 6 }, // ~17 s
  workstation: { perSecondWorking: 4, perSecondCooling: 8, idleCooling: 5 }, // ~25 s
  rack: { perSecondWorking: 3, perSecondCooling: 8, idleCooling: 5 }, // ~33 s
  gpu: { perSecondWorking: 4, perSecondCooling: 7, idleCooling: 4 }, // ~25 s, slow to cool: it runs hot
};

// The starter desk's cash pile cap. When a pile is full, that machine stops.
export const STARTER_DESK_PILE_MAX = 40;

// Stashed cash needed before the corner laptop turns into the shop.
export const SHOP_UNLOCK_CASH = 50;

// Kept for older imports.
export const STARTER_HUSTLES = HELPDESK_JOBS;
export const STARTER_DESK_HEAT = HEAT.starterDesk;
