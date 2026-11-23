// The neighbor next door. Machines being worked make noise (see `noise` in
// catalog.js). Above the quiet limit the neighbor slowly loses patience: first
// they bang on the wall, then they come over. You get a countdown to switch
// every machine off; if anything is still running when they reach the door,
// you pay a noise fine that grows with each complaint.
// All numbers are first guesses to tune.

export const NEIGHBOR = {
  quietLimit: 4, // noise you can make without annoying anyone (the server rack alone is 4)
  annoyPerPoint: 0.35, // patience lost per second for each noise point over the limit (patience is out of 100)
  calmPerSecond: 3, // patience regained per second while you're under the limit
  warnAt: 50, // they bang on the wall at this much annoyance
  comingSeconds: 15, // time to switch everything off before they reach the door
  checkSeconds: 8, // they stand at the door this long when it's quiet
  caughtSeconds: 20, // ...and this long when they caught something running
  graceSeconds: 60, // after a visit, they don't get annoyed again for a while
  fines: [50, 100, 200, 400, 800], // per complaint; the last one repeats
};

export const fineFor = (complaints) => NEIGHBOR.fines[Math.min(complaints, NEIGHBOR.fines.length - 1)];
