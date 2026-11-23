// Maintenance: things that go wrong with machines and need you (agents never fix them).
// - Servers crash: the server rack and the GPU rig can crash when they finish a job,
//   more often when they're running hot. A crashed machine earns nothing until you
//   stand at it to reboot it.
// - PCs need updates: the laptops and the workstation get an update every few minutes.
//   Stand at the machine to install it. Ignore it too long and the machine is outdated:
//   it pays less until you update it.
// All numbers are first guesses to tune.

export const CRASH = {
  chance: 0.04, // per finished job when the machine is cool...
  hotChance: 0.08, // ...plus up to this much more at full heat (12% total)
  rebootSeconds: 3, // stand at it this long to reboot
};

export const UPDATES = {
  every: [150, 270], // seconds of powered time between updates (random in this range)
  graceSeconds: 60, // after this long without installing, the machine is outdated
  outdatedPay: 0.75, // outdated machines pay this much (-25%)
  installSeconds: 3, // stand at it this long to install
};

// Which machines get which: servers crash, PCs get updates (by the jobs they do).
export const SERVER_JOBS = ['agents', 'training']; // server rack, GPU rig
export const PC_JOBS = ['helpdesk', 'bounty']; // laptops, workstation

/** Seconds until a machine's next update. */
export const nextUpdateIn = () => UPDATES.every[0] + Math.random() * (UPDATES.every[1] - UPDATES.every[0]);
