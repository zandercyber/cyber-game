// The in-game clock. A full day passes every 10 minutes of play: 16 hours of
// day (6 AM to 10 PM, about 6.5 minutes) and 8 hours of night (10 PM to 6 AM,
// about 3.5 minutes). Night = quiet hours: the neighbor is trying to sleep, so
// noise bothers them twice as fast (see nightMultiplier in neighbor.js).
// All numbers are first guesses to tune.

export const CLOCK = {
  dayLengthSeconds: 600, // one full in-game day, in seconds of play
  nightStart: 22, // 10 PM: quiet hours start
  nightEnd: 6, // 6 AM: quiet hours end
  fadeHours: 1, // dusk (9-10 PM) and dawn (6-7 AM) fade the room in and out of night
  startHour: 8, // a new game starts at 8 AM on day 1
  nightTint: 0.42, // how dark the room gets at night (0..1)
};

export const MINUTES_PER_DAY = 24 * 60;
