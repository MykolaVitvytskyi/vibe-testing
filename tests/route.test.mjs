import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoutePlanner } from '../src/route.js';
import { canStand } from '../src/navigation.js';

const floor = [{ minX: -8, maxX: 8, minZ: -8, maxZ: 8 }];

function validateSegments(start, route, walkable, obstacles) {
  assert.ok(route.length, 'a connected route exists');
  let previous = start;
  for (const point of route) {
    const length = Math.hypot(point.x - previous.x, point.z - previous.z);
    const samples = Math.max(1, Math.ceil(length / .025));
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      assert.ok(canStand(previous.x + (point.x - previous.x) * t,
        previous.z + (point.z - previous.z) * t, walkable, obstacles), 'every segment clears the full player footprint');
    }
    previous = point;
  }
}

test('a gallery route crosses a separating wall through its actual doorway', () => {
  const walls = [{ minX: -.15, maxX: .15, minZ: -8, maxZ: 2 },
    { minX: -.15, maxX: .15, minZ: 4.4, maxZ: 8 }];
  const start = { x: -5, z: -3 }, goal = { x: 5, z: -3 };
  const route = createRoutePlanner(floor, walls).find(start, goal);
  assert.ok(route.length > 1, 'the arrow cannot point straight through the wall');
  assert.ok(route.some(point => point.z > 2.2), 'the path diverts toward the doorway');
  assert.deepEqual(route.at(-1), goal);
  validateSegments(start, route, floor, walls);
});

test('a visitor walks around a bench without cutting across its padded corners', () => {
  const benches = [{ minX: -2, maxX: 2, minZ: -1.1, maxZ: 1.1 }];
  const start = { x: -5, z: 0 }, goal = { x: 5, z: 0 };
  const planner = createRoutePlanner(floor, benches);
  const route = planner.find(start, goal);
  assert.ok(route.length > 1);
  assert.deepEqual(route.at(-1), goal);
  validateSegments(start, route, floor, benches);
  validateSegments(goal, planner.find(goal, start), floor, benches);
});

test('an unobstructed room produces only the exact destination', () => {
  const start = { x: -4.1, z: 2.3 }, goal = { x: 3.2, z: -5.4 };
  const route = createRoutePlanner(floor, []).find(start, goal);
  assert.deepEqual(route, [goal]);
  validateSegments(start, route, floor, []);
});

test('invalid destinations and genuinely disconnected rooms do not invent a route', () => {
  const walls = [{ minX: -.1, maxX: .1, minZ: -8, maxZ: 8 }];
  const planner = createRoutePlanner(floor, walls), start = { x: -3, z: 0 };
  for (const goal of [{ x: 0, z: 0 }, { x: 9, z: 0 }, { x: 1, z: NaN }, { x: 3, z: 0 }, null]) {
    assert.deepEqual(planner.find(start, goal), []);
  }
  assert.deepEqual(planner.find({ x: Infinity, z: 0 }, start), []);
  assert.deepEqual(createRoutePlanner([], []).find(start, start), []);
});

test('connected room rectangles remain traversable across their shared doorway', () => {
  const rooms = [{ minX: -8, maxX: 0, minZ: -4, maxZ: 4 }, { minX: 0, maxX: 8, minZ: -4, maxZ: 4 }];
  const walls = [{ minX: -.1, maxX: .1, minZ: -4, maxZ: -1 }, { minX: -.1, maxX: .1, minZ: 1, maxZ: 4 },
    { minX: -4.6, maxX: -3.4, minZ: -1.4, maxZ: 1.4 }];
  const start = { x: -6, z: 0 }, goal = { x: 6, z: 0 };
  const route = createRoutePlanner(rooms, walls).find(start, goal);
  assert.deepEqual(route.at(-1), goal);
  validateSegments(start, route, rooms, walls);
});

test('a narrow but passable doorway between grid rows is still reachable', () => {
  const walls = [{ minX: -.15, maxX: .15, minZ: -8, maxZ: 1.7 },
    { minX: -.15, maxX: .15, minZ: 2.3, maxZ: 8 }];
  const start = { x: -5, z: -3 }, goal = { x: 5, z: -3 };
  const planner = createRoutePlanner(floor, walls);
  const route = planner.find(start, goal);
  assert.deepEqual(route.at(-1), goal);
  validateSegments(start, route, floor, walls);
  validateSegments(goal, planner.find(goal, start), floor, walls);
});
