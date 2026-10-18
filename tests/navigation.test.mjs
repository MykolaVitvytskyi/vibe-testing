import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { EYE_HEIGHT, PLAYER_RADIUS, look, move, canStand, roomAt, nearestExhibit } from '../src/navigation.js';

const openFloor = [{ minX: -100, maxX: 100, minZ: -100, maxZ: 100 }];
const stateAt = (overrides = {}) => ({ x: 0, z: 0, yaw: Math.PI, pitch: 0, sensitivity: 1, ...overrides });
const near = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≈ ${expected}`);

// Match the actual camera used by app.js: a world-space target projected into
// camera coordinates verifies the mouse direction, rather than just its sign.
function cameraFor(state) {
  const camera = new PerspectiveCamera(67, 1.6, .08, 110);
  camera.position.set(state.x, EYE_HEIGHT, state.z);
  const c = Math.cos(state.pitch);
  camera.lookAt(state.x + Math.sin(state.yaw) * c, EYE_HEIGHT + Math.sin(state.pitch), state.z + Math.cos(state.yaw) * c);
  camera.updateMatrixWorld(true);
  return camera;
}

test('moving the mouse right turns the camera right at every compass heading', () => {
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const state = stateAt({ yaw });
    const target = new Vector3(10 * Math.sin(yaw), EYE_HEIGHT, 10 * Math.cos(yaw));
    near(target.clone().project(cameraFor(state)).x, 0);
    look(state, 100, 0);
    assert.ok(target.project(cameraFor(state)).x < -.1, 'the former centre moves left as the camera turns right');
  }
});

test('moving the mouse up looks up, with no vertical inversion', () => {
  const state = stateAt();
  const target = new Vector3(0, EYE_HEIGHT, -10);
  look(state, 0, -100);
  assert.ok(target.project(cameraFor(state)).y < -.1, 'the former centre moves down when looking up');
  assert.ok(cameraFor(state).getWorldDirection(new Vector3()).y > 0);
});

test('pitch remains below the pole and mouse sensitivity scales rotation', () => {
  const normal = stateAt(), doubled = stateAt({ sensitivity: 2 });
  look(normal, 50, -25); look(doubled, 50, -25);
  near(doubled.yaw - Math.PI, 2 * (normal.yaw - Math.PI));
  near(doubled.pitch, 2 * normal.pitch);
  for (let i = 0; i < 100; i++) look(normal, 0, -1e6);
  near(normal.pitch, 1.42);
  for (let i = 0; i < 100; i++) look(normal, 0, 1e6);
  near(normal.pitch, -1.42);
});

test('W and D follow the camera forward and right axes at every heading', () => {
  for (const yaw of [0, .7, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const camera = cameraFor(stateAt({ yaw }));
    const forward = camera.getWorldDirection(new Vector3());
    const right = new Vector3().crossVectors(forward, camera.up).normalize();
    for (const [key, expected] of [['KeyW', forward], ['KeyD', right]]) {
      const state = stateAt({ yaw });
      move(state, new Set([key]), .05, openFloor, []);
      near(state.x, expected.x * 3.1 * .05);
      near(state.z, expected.z * 3.1 * .05);
    }
  }
});

test('opposite keys cancel and diagonal movement has the same speed', () => {
  const forward = stateAt(), diagonal = stateAt(), cancelled = stateAt();
  move(forward, new Set(['KeyW']), .05, openFloor, []);
  move(diagonal, new Set(['KeyW', 'KeyD']), .05, openFloor, []);
  move(cancelled, new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD']), .05, openFloor, []);
  near(Math.hypot(diagonal.x, diagonal.z), Math.hypot(forward.x, forward.z));
  near(cancelled.x, 0); near(cancelled.z, 0);
});

test('a connected floor permits walking through a doorway but walls block the player footprint', () => {
  const floor = [{ minX: -4, maxX: 0, minZ: -4, maxZ: 4 }, { minX: 0, maxX: 4, minZ: -4, maxZ: 4 }];
  const walls = [{ minX: -.06, maxX: .06, minZ: -4, maxZ: -.9 }, { minX: -.06, maxX: .06, minZ: .9, maxZ: 4 }];
  const throughDoor = stateAt({ x: -2, yaw: Math.PI / 2 });
  const towardWall = stateAt({ x: -2, z: 2, yaw: Math.PI / 2 });
  for (let i = 0; i < 28; i++) {
    move(throughDoor, new Set(['KeyW']), .05, floor, walls);
    move(towardWall, new Set(['KeyW']), .05, floor, walls);
  }
  assert.ok(throughDoor.x > 2, 'doorway connects the rooms');
  assert.ok(towardWall.x <= -.06 - PLAYER_RADIUS, 'collision reserves space for the player');
  assert.ok(canStand(throughDoor.x, throughDoor.z, floor, walls));
  assert.ok(!canStand(-.15, 2, floor, walls), 'centre outside the wall is insufficient when the footprint intersects it');
});

test('a long frame cannot tunnel through a thin wall and permits sliding along it', () => {
  const walls = [{ minX: .2, maxX: .21, minZ: -10, maxZ: 10 }];
  const state = stateAt({ x: -.2, yaw: Math.PI / 2 });
  for (let i = 0; i < 8; i++) move(state, new Set(['KeyW', 'KeyD', 'ShiftLeft']), 10, openFloor, walls);
  assert.ok(state.x <= .2 - PLAYER_RADIUS);
  assert.ok(state.z > 1, 'unblocked axis slides along the wall');
  const capped = stateAt();
  move(capped, new Set(['KeyW', 'ShiftLeft']), 10, openFloor, []);
  near(Math.hypot(capped.x, capped.z), 5.8 * .05);
});

test('the walkable boundary blocks the entire player footprint', () => {
  const floor = [{ minX: -1, maxX: 1, minZ: -1, maxZ: 1 }];
  assert.equal(canStand(1 - PLAYER_RADIUS - .001, 0, floor, []), true);
  assert.equal(canStand(1 - PLAYER_RADIUS + .001, 0, floor, []), false);
});

test('room labels follow bounds and inspection requires a nearby painting in view', () => {
  const rooms = [{ id: 'library', bounds: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 } }, { id: 'east', bounds: { minX: 5, maxX: 10, minZ: -5, maxZ: 5 } }];
  assert.equal(roomAt(7, 0, rooms).id, 'east');
  const front = { id: 'front', position: { x: 0, y: EYE_HEIGHT, z: -3 } };
  const behind = { id: 'behind', position: { x: 0, y: EYE_HEIGHT, z: 1 } };
  assert.equal(nearestExhibit(stateAt(), [behind, front]), front);
  assert.equal(nearestExhibit(stateAt({ yaw: 0 }), [front]), null);
  assert.equal(nearestExhibit(stateAt({ z: 10 }), [front]), null);
});
