// Grid pathfinding (A*) so tap-to-move walks around furniture.
// The room is split into small cells; a cell is open if the player can stand at its center.

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

export function buildGrid(canStandAt, width, height, cell = 16) {
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const open = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      open[r * cols + c] = canStandAt(c * cell + cell / 2, r * cell + cell / 2) ? 1 : 0;
    }
  }
  return { cols, rows, cell, open, canStandAt };
}

const toCell = (g, x, y) => [
  Math.min(g.cols - 1, Math.max(0, Math.floor(x / g.cell))),
  Math.min(g.rows - 1, Math.max(0, Math.floor(y / g.cell))),
];
const center = (g, c, r) => ({ x: c * g.cell + g.cell / 2, y: r * g.cell + g.cell / 2 });

// Closest open cell to (c, r), searching outward ring by ring.
function nearestOpen(g, c, r) {
  if (g.open[r * g.cols + c]) return [c, r];
  for (let rad = 1; rad < Math.max(g.cols, g.rows); rad++) {
    let best = null;
    let bestD = Infinity;
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue;
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= g.cols || nr >= g.rows || !g.open[nr * g.cols + nc]) continue;
        const d = dc * dc + dr * dr;
        if (d < bestD) { bestD = d; best = [nc, nr]; }
      }
    }
    if (best) return best;
  }
  return null;
}

/** True if the player can walk the straight line between a and b. */
export function clearLine(g, a, b, stepPx = 6) {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(dist / stepPx));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (!g.canStandAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
  }
  return true;
}

/**
 * Path from (fromX, fromY) to (toX, toY) as a list of waypoints, ending at the
 * target (or the nearest reachable spot if the target is inside furniture).
 * Returns null if there's no way there.
 */
export function findPath(g, fromX, fromY, toX, toY) {
  const start = { x: fromX, y: fromY };
  const goalExact = g.canStandAt(toX, toY);
  if (goalExact && clearLine(g, start, { x: toX, y: toY })) return [{ x: toX, y: toY }];

  const s = nearestOpen(g, ...toCell(g, fromX, fromY));
  const e = nearestOpen(g, ...toCell(g, toX, toY));
  if (!s || !e) return null;
  const sIdx = s[1] * g.cols + s[0];
  const eIdx = e[1] * g.cols + e[0];

  const n = g.cols * g.rows;
  const gScore = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = new MinHeap();
  const h = (c, r) => Math.hypot(c - e[0], r - e[1]);
  gScore[sIdx] = 0;
  heap.push(sIdx, h(s[0], s[1]));

  while (heap.size) {
    const cur = heap.pop();
    if (cur === eIdx) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const c = cur % g.cols;
    const r = (cur - c) / g.cols;
    for (const [dc, dr, cost] of DIRS) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= g.cols || nr >= g.rows) continue;
      const ni = nr * g.cols + nc;
      if (!g.open[ni] || closed[ni]) continue;
      // No cutting corners diagonally past furniture.
      if (dc && dr && (!g.open[r * g.cols + nc] || !g.open[nr * g.cols + c])) continue;
      const tentative = gScore[cur] + cost;
      if (tentative < gScore[ni]) {
        gScore[ni] = tentative;
        came[ni] = cur;
        heap.push(ni, tentative + h(nc, nr));
      }
    }
  }
  if (came[eIdx] === -1 && eIdx !== sIdx) return null;

  // Rebuild cell path, then keep only the turns we actually need.
  const cells = [];
  for (let i = eIdx; i !== -1; i = came[i]) cells.push(center(g, i % g.cols, Math.floor(i / g.cols)));
  cells.reverse();
  const end = goalExact ? { x: toX, y: toY } : cells[cells.length - 1];
  cells.push(end);
  return smooth(g, start, cells);
}

// Skip waypoints while there's a clear straight line to a later one.
function smooth(g, start, points) {
  const out = [];
  let from = start;
  let i = 0;
  while (i < points.length) {
    let far = i;
    for (let j = points.length - 1; j > i; j--) {
      if (clearLine(g, from, points[j])) { far = j; break; }
    }
    out.push(points[far]);
    from = points[far];
    i = far + 1;
  }
  return out;
}

class MinHeap {
  constructor() { this.items = []; this.prios = []; }
  get size() { return this.items.length; }
  push(item, prio) {
    const a = this.items;
    const p = this.prios;
    a.push(item); p.push(prio);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (p[parent] <= p[i]) break;
      [a[i], a[parent]] = [a[parent], a[i]];
      [p[i], p[parent]] = [p[parent], p[i]];
      i = parent;
    }
  }
  pop() {
    const a = this.items;
    const p = this.prios;
    const top = a[0];
    const lastItem = a.pop();
    const lastPrio = p.pop();
    if (a.length) {
      a[0] = lastItem; p[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && p[l] < p[m]) m = l;
        if (r < a.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        [p[i], p[m]] = [p[m], p[i]];
        i = m;
      }
    }
    return top;
  }
}
