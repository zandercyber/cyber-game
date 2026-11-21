// Layout data for Prestige 1: the dorm room.
// All coordinates are in world pixels, matching the 1376x768 room image.
// Tip: open the game with ?debug in the URL to see these shapes drawn on screen.

export const WORLD = { width: 1376, height: 768 };

export const DORM = {
  background: 'room-dorm',

  // Where the player's feet are allowed to go (the carpet).
  floor: [
    [62, 500], [300, 378], [545, 345], [860, 345],
    [1105, 395], [1300, 538], [930, 762], [550, 762],
  ],

  // Furniture that's painted into the background. Feet can't enter these.
  obstacles: {
    bed: [[120, 440], [300, 340], [505, 392], [440, 470], [430, 510], [340, 522]],
    laundryBasket: [[50, 440], [140, 440], [140, 525], [50, 525]],
    rollingCart: [[480, 370], [552, 370], [552, 405], [480, 405]],
    closetDoor: [[690, 330], [740, 330], [740, 355], [690, 355]],
    trashByDoor: [[842, 330], [895, 330], [895, 385], [842, 385]],
    cornerDesk: [[878, 330], [1100, 330], [1100, 400], [878, 400]],
    trashByWindow: [[1105, 385], [1160, 385], [1160, 440], [1105, 440]],
    plant: [[1285, 490], [1340, 490], [1340, 545], [1285, 545]],
  },

  // Stations are separate sprites so they can be bought, upgraded and walked behind.
  // x/y is the bottom-center of the image; footprint is relative to that point.
  // startOwned: false means the room starts without it; it gets placed when unlocked.
  stations: [
    {
      id: 'laptop-desk',
      startOwned: false,
      texture: 'station-laptop-desk',
      x: 560, y: 560,
      footprint: [[-68, -40], [-68, -70], [70, -70], [70, -21], [37, -5], [-23, -15]],
    },
    {
      id: 'dual-monitor-desk',
      startOwned: false,
      texture: 'station-dual-monitor-desk',
      x: 760, y: 500,
      footprint: [[-105, -38], [-105, -92], [104, -92], [104, -70], [69, -12], [-41, -4]],
    },
    {
      id: 'server-rack',
      startOwned: false,
      texture: 'station-server-rack',
      x: 1080, y: 620,
      footprint: [[-83, -42], [-83, -71], [82, -71], [82, -51], [70, -43], [-8, -4], [-71, -35]],
    },
  ],

  playerStart: { x: 700, y: 660, facing: 'down' },
};
