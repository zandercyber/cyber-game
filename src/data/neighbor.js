// The neighbor next door. Machines being worked make noise (see `noise` in
// catalog.js); the starter laptop is silent. Any noise slowly uses up their
// patience, and the louder you are, the sooner they show up knocking at your
// window: about every 5 minutes at Low noise, 3 at Medium, 2 at High (twice as
// often at night, during quiet hours). They bang
// on the wall halfway there as a warning. You get a countdown to switch every
// machine off; if anything is still running when it ends, you pay a noise fine
// that grows with each complaint.
// All numbers are first guesses to tune.

// Noise levels, from the total noise of machines being worked right now.
// visitEvery: seconds of making this much noise before they come over.
export const NOISE_LEVELS = [
  { name: 'Low', from: 1, visitEvery: 300, color: '#bef264' }, // a laptop or two
  { name: 'Medium', from: 3, visitEvery: 180, color: '#fcd34d' }, // the server rack, or a few desks
  { name: 'High', from: 6, visitEvery: 120, color: '#fca5a5' }, // most of the room at once
];

export const NEIGHBOR = {
  calmPerSecond: 0.25, // patience regained per second while everything is silent (out of 100)
  nightMultiplier: 2, // quiet hours (10 PM to 6 AM, see clock.js): noise wears out patience this many times faster
  warnAt: 50, // they bang on the wall at this much annoyance (halfway to a visit)
  comingSeconds: 15, // time to switch everything off while they knock on the window
  checkSeconds: 8, // they look in the window this long when it's quiet
  caughtSeconds: 20, // ...and this long when they caught something running
  fines: [50, 100, 200, 400, 800], // per complaint; the last one repeats
};

/** The noise level for a total noise amount, or null when it's silent. */
export function noiseLevel(noise) {
  let level = null;
  for (const l of NOISE_LEVELS) if (noise >= l.from) level = l;
  return level;
}

export const fineFor = (complaints) => NEIGHBOR.fines[Math.min(complaints, NEIGHBOR.fines.length - 1)];
