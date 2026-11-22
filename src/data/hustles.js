// Quick jobs you do at a workstation. Real-world help-desk and security tasks.
// seconds: how long it takes at the starter desk; pay: cash it adds to the desk pile.
export const STARTER_HUSTLES = [
  { name: 'Reset a locked account', seconds: 3, pay: 4 },
  { name: 'Set up 2FA for a neighbor', seconds: 3, pay: 4 },
  { name: 'Remove adware from a laptop', seconds: 4, pay: 6 },
  { name: 'Recover a deleted file', seconds: 4, pay: 5 },
  { name: 'Change a router\'s default password', seconds: 4, pay: 6 },
  { name: 'Clean phishing emails out of an inbox', seconds: 5, pay: 7 },
  { name: 'Update an old Wi-Fi router', seconds: 5, pay: 8 },
];

// Heat: working warms the machine; at 100 it overheats and must fully cool down.
export const STARTER_DESK_HEAT = {
  perSecondWorking: 5, // ~20 s of work to overheat
  perSecondCooling: 10, // ~10 s to cool from overheated
  idleCooling: 6, // cooling while you're just away (not overheated)
};

// Cash waits on the desk until you carry it to the stash. When the pile is
// full, work pauses, so you have to keep moving.
export const STARTER_DESK_PILE_MAX = 40;
