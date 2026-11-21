// Small geometry helpers for collision checks.

/** Ray-casting test: is point (x, y) inside the polygon [[x, y], ...]? */
export function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const crosses = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Shift a polygon given in local coordinates to a world position. */
export function translatePolygon(polygon, dx, dy) {
  return polygon.map(([x, y]) => [x + dx, y + dy]);
}

/** Average y of a polygon's points. Used for draw order (depth). */
export function centerY(polygon) {
  return polygon.reduce((sum, [, y]) => sum + y, 0) / polygon.length;
}

/**
 * Builds a function that says whether feet at (x, y) are on open floor:
 * inside the floor shape and outside every blocked shape.
 */
export function makeWalkableCheck(floor, blocked) {
  return (x, y) => pointInPolygon(x, y, floor) && !blocked.some((shape) => pointInPolygon(x, y, shape));
}
