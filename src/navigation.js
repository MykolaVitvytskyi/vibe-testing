export const EYE_HEIGHT = 1.7;
export const PLAYER_RADIUS = 0.24;

// Camera forward = (sin(yaw), 0, cos(yaw)). A positive screen X
// rotates this yaw negatively, so the camera turns toward the right.
export function look(state, dx, dy) {
  const sensitivity = 0.0019 * state.sensitivity;
  state.yaw -= Math.max(-400, Math.min(400, dx)) * sensitivity;
  state.pitch = Math.max(-1.42, Math.min(1.42,
    state.pitch - Math.max(-400, Math.min(400, dy)) * sensitivity));
}

export function canStand(x, z, walkable, obstacles, radius = PLAYER_RADIUS) {
  // Sample the full footprint, allowing connected rectangles to form doorways.
  for (const [dx, dz] of [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius],
    [radius * .707, radius * .707], [-radius * .707, radius * .707],
    [radius * .707, -radius * .707], [-radius * .707, -radius * .707]]) {
    if (!walkable.some(r => x + dx >= r.minX && x + dx <= r.maxX && z + dz >= r.minZ && z + dz <= r.maxZ)) return false;
  }
  return !obstacles.some(r => {
    const px = Math.max(r.minX, Math.min(r.maxX, x));
    const pz = Math.max(r.minZ, Math.min(r.maxZ, z));
    return Math.hypot(x - px, z - pz) < radius;
  });
}

export function move(state, keys, dt, walkable, obstacles) {
  let f = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
  let r = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  const length = Math.hypot(f, r);
  if (!length) return;
  f /= length; r /= length;
  const distance = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 5.8 : 3.1) * Math.min(.05, dt);
  const dx = (Math.sin(state.yaw) * f - Math.cos(state.yaw) * r) * distance;
  const dz = (Math.cos(state.yaw) * f + Math.sin(state.yaw) * r) * distance;
  // Small steps prevent tunnelling at a low frame rate; separate axes slide along walls.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .08));
  for (let i = 0; i < steps; i++) {
    if (canStand(state.x + dx / steps, state.z, walkable, obstacles)) state.x += dx / steps;
    if (canStand(state.x, state.z + dz / steps, walkable, obstacles)) state.z += dz / steps;
  }
}

export function roomAt(x, z, rooms) {
  return rooms.find(r => x >= r.bounds.minX && x <= r.bounds.maxX && z >= r.bounds.minZ && z <= r.bounds.maxZ) || rooms[0];
}

export function nearestExhibit(state, exhibits) {
  let nearest = null, best = Infinity;
  const cosPitch = Math.cos(state.pitch);
  const direction = [Math.sin(state.yaw) * cosPitch, Math.sin(state.pitch), Math.cos(state.yaw) * cosPitch];
  for (const art of exhibits) {
    const dx = art.position.x - state.x, dy = art.position.y - EYE_HEIGHT, dz = art.position.z - state.z;
    const distance = Math.hypot(dx, dy, dz);
    const facing = (dx * direction[0] + dy * direction[1] + dz * direction[2]) / (distance || 1);
    if (distance < 4.4 && facing > .80 && distance < best) { nearest = art; best = distance; }
  }
  return nearest;
}
