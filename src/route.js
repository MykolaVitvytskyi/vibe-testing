import { canStand, PLAYER_RADIUS } from './navigation.js';

const CELL = .65;
const SAMPLE = .1;
const NEIGHBOURS = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];

// A small binary heap keeps replanning cheap even across the whole building.
class MinHeap {
  values = [];
  push(item) {
    const a = this.values;
    let i = a.length;
    a.push(item);
    while (i) {
      const parent = (i - 1) >> 1;
      if (a[parent].f <= item.f) break;
      a[i] = a[parent]; i = parent;
    }
    a[i] = item;
  }
  pop() {
    const a = this.values, first = a[0], last = a.pop();
    if (a.length) {
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let child = i * 2 + 1;
        if (child + 1 < a.length && a[child + 1].f < a[child].f) child++;
        if (a[child].f >= last.f) break;
        a[i] = a[child]; i = child;
      }
      a[i] = last;
    }
    return first;
  }
}

/** Static footprint-aware route grid. find() returns waypoints after start,
 * ending at the exact goal. Every returned segment has sampled clearance. */
export function createRoutePlanner(walkable, obstacles) {
  const floor = walkable.map(rect => ({ ...rect }));
  const walls = obstacles.map(rect => ({ ...rect }));
  if (!floor.length) return { find: () => [] };
  const minX = Math.min(...floor.map(r => r.minX)), maxX = Math.max(...floor.map(r => r.maxX));
  const minZ = Math.min(...floor.map(r => r.minZ)), maxZ = Math.max(...floor.map(r => r.maxZ));
  let step = CELL;
  let width = Math.ceil((maxX - minX) / step), height = Math.ceil((maxZ - minZ) / step);
  // The museum uses ~5500 cells. Large future buildings keep a bounded grid.
  while (width * height > 6000) {
    step *= 1.025;
    width = Math.ceil((maxX - minX) / step); height = Math.ceil((maxZ - minZ) / step);
  }
  const count = width * height;
  const nodes = Array.from({ length: count }, (_, id) => ({
    x: minX + (id % width + .5) * step,
    z: minZ + (Math.floor(id / width) + .5) * step,
  }));
  const occupancy = new Uint8Array(count);
  const clearNodes = [];
  nodes.forEach((p, id) => {
    if (canStand(p.x, p.z, floor, walls)) { occupancy[id] = 1; clearNodes.push(id); }
  });
  const edgeCache = new Uint8Array(count * 8);
  let cornerNodes;
  const cornerEdges = new Map();
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const validPoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.z) && canStand(p.x, p.z, floor, walls);

  function visible(a, b) {
    const samples = Math.max(1, Math.ceil(distance(a, b) / SAMPLE));
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      if (!canStand(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, floor, walls)) return false;
    }
    return true;
  }

  function links(point) {
    // Link several nearest *visible* cells: simply rounding a point to one
    // cell can put it on the other side of a bench or a thin wall.
    const ordered = clearNodes.map(id => ({ id, d: distance(point, nodes[id]) })).sort((a, b) => a.d - b.d);
    const result = [];
    for (const node of ordered) {
      if (visible(point, nodes[node.id])) result.push(node);
      if (result.length >= 16) break;
    }
    return result;
  }

  function neighbour(id, direction) {
    const [dx, dz] = NEIGHBOURS[direction], x = id % width, z = Math.floor(id / width);
    const nx = x + dx, nz = z + dz;
    if (nx < 0 || nx >= width || nz < 0 || nz >= height) return -1;
    const next = nz * width + nx;
    if (!occupancy[next]) return -1;
    if (dx && dz && (!occupancy[z * width + nx] || !occupancy[nz * width + x])) return -1;
    const edge = id * 8 + direction;
    if (!edgeCache[edge]) edgeCache[edge] = visible(nodes[id], nodes[next]) ? 2 : 1;
    return edgeCache[edge] === 2 ? next : -1;
  }

  function smooth(start, path) {
    const result = [];
    let anchor = start, first = 0;
    while (first < path.length) {
      let furthest = first;
      for (let i = path.length - 1; i > first; i--) {
        if (visible(anchor, path[i])) { furthest = i; break; }
      }
      result.push({ x: path[furthest].x, z: path[furthest].z });
      anchor = path[furthest]; first = furthest + 1;
    }
    return result;
  }

  // A passable opening can occasionally fall between coarse grid centres.
  // Only after grid failure, try a visibility graph around padded furniture
  // and wall corners. Its static nodes/edges are reused by subsequent visits.
  function narrowPassageRoute(start, goal) {
    if (!cornerNodes) {
      const unique = new Map(), margin = PLAYER_RADIUS + .005;
      const add = p => {
        if (validPoint(p)) unique.set(`${p.x.toFixed(6)},${p.z.toFixed(6)}`, p);
      };
      for (const r of walls) {
        for (const x of [r.minX - margin, r.maxX + margin]) {
          for (const z of [r.minZ - margin, r.maxZ + margin]) add({ x, z });
        }
      }
      for (const r of floor) {
        for (const x of [r.minX + margin, r.maxX - margin]) {
          for (const z of [r.minZ + margin, r.maxZ - margin]) add({ x, z });
        }
      }
      for (let i = 0; i < floor.length; i++) {
        for (let j = i + 1; j < floor.length; j++) {
          const left = Math.max(floor[i].minX, floor[j].minX), right = Math.min(floor[i].maxX, floor[j].maxX);
          const top = Math.max(floor[i].minZ, floor[j].minZ), bottom = Math.min(floor[i].maxZ, floor[j].maxZ);
          if (left <= right && top <= bottom) add({ x: (left + right) / 2, z: (top + bottom) / 2 });
        }
      }
      cornerNodes = [...unique.values()];
    }
    const points = [...cornerNodes, start, goal], source = points.length - 2, target = points.length - 1;
    const costs = new Float64Array(points.length).fill(Infinity), parent = new Int32Array(points.length).fill(-1);
    const closed = new Uint8Array(points.length), open = new MinHeap();
    costs[source] = 0; open.push({ id: source, f: distance(start, goal) });
    while (open.values.length) {
      const { id } = open.pop();
      if (closed[id]) continue;
      if (id === target) {
        const path = [];
        for (let at = target; at !== source; at = parent[at]) path.push(points[at]);
        return smooth(start, path.reverse());
      }
      closed[id] = 1;
      for (let next = 0; next < points.length; next++) {
        if (closed[next]) continue;
        const nextCost = costs[id] + distance(points[id], points[next]);
        if (nextCost >= costs[next] || nextCost + distance(points[next], goal) >= costs[target]) continue;
        let clear;
        if (id < cornerNodes.length && next < cornerNodes.length) {
          const key = Math.min(id, next) * cornerNodes.length + Math.max(id, next);
          if (!cornerEdges.has(key)) cornerEdges.set(key, visible(points[id], points[next]));
          clear = cornerEdges.get(key);
        } else clear = visible(points[id], points[next]);
        if (!clear) continue;
        costs[next] = nextCost; parent[next] = id;
        open.push({ id: next, f: nextCost + distance(points[next], goal) });
      }
    }
    return [];
  }

  return {
    find(start, goal) {
      if (!validPoint(start) || !validPoint(goal)) return [];
      if (visible(start, goal)) return [{ x: goal.x, z: goal.z }];
      const starts = links(start), ends = links(goal);
      if (!starts.length || !ends.length) return narrowPassageRoute(start, goal);
      const goalCosts = new Map(ends.map(({ id, d }) => [id, d]));
      const costs = new Float64Array(count + 1).fill(Infinity);
      const parent = new Int32Array(count + 1).fill(-1);
      const closed = new Uint8Array(count + 1), open = new MinHeap();
      const virtualGoal = count;
      for (const { id, d } of starts) {
        costs[id] = d;
        open.push({ id, f: d + distance(nodes[id], goal) });
      }
      while (open.values.length) {
        const { id } = open.pop();
        if (closed[id]) continue;
        if (id === virtualGoal) {
          const path = [{ x: goal.x, z: goal.z }];
          for (let at = parent[id]; at !== -1; at = parent[at]) path.push(nodes[at]);
          path.reverse();
          return smooth(start, path);
        }
        closed[id] = 1;
        const goalCost = goalCosts.get(id);
        if (goalCost !== undefined && costs[id] + goalCost < costs[virtualGoal]) {
          costs[virtualGoal] = costs[id] + goalCost; parent[virtualGoal] = id;
          open.push({ id: virtualGoal, f: costs[virtualGoal] });
        }
        for (let direction = 0; direction < NEIGHBOURS.length; direction++) {
          const next = neighbour(id, direction);
          if (next < 0 || closed[next]) continue;
          const nextCost = costs[id] + distance(nodes[id], nodes[next]);
          if (nextCost >= costs[next]) continue;
          costs[next] = nextCost; parent[next] = id;
          open.push({ id: next, f: nextCost + distance(nodes[next], goal) });
        }
      }
      return narrowPassageRoute(start, goal);
    },
  };
}
