// Layout data for Prestige 1: the dorm room.
// All coordinates are in world pixels, matching the 1376x768 room image.
// Tip: open the game with ?debug or #debug to see these shapes drawn on screen.

export const WORLD = { width: 1376, height: 768 };

export const DORM = {
  background: 'room-dorm',

  // Where the player's feet are allowed to go (the carpet), kept a little
  // inside the screen edges so the character never walks off-screen.
  floor: [
    [35, 514], [300, 378], [545, 345], [860, 345],
    [1105, 395], [1340, 531], [1340, 755], [35, 755],
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

  // Empty spots where bought items get installed. x/y is the center of the plot.
  plots: [
    { id: 'plot-1', x: 600, y: 500 },
    { id: 'plot-2', x: 980, y: 545 },
    { id: 'plot-3', x: 300, y: 640 },
    { id: 'plot-4', x: 700, y: 680 },
    { id: 'plot-5', x: 1150, y: 680 },
  ],
  plotSize: { width: 230, height: 115 },

  // The laundry basket by the bed is where cash gets stashed.
  stash: { x: 95, y: 495, reach: 110, labelX: 125, labelY: 400 },

  // The corner desk is the free starter workstation: hustles and the shop screen.
  starterDesk: { x: 990, y: 415, reach: 95, labelY: 200 },

  // Breaker panel on the right wall: reset it when too much power trips the breaker.
  breaker: { x: 1255, y: 500, reach: 85, labelX: 1290, labelY: 268 },

  // Deliveries show up here, just inside the door.
  deliverySpot: { x: 812, y: 395 },

  playerStart: { x: 760, y: 600, facing: 'down' },
};
