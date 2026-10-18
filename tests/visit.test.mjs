import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisit } from '../src/visit.js';
import { createMuseumAudio } from '../src/audio.js';

const collection = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
function memoryStorage(initial) {
  const values = new Map(initial);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values };
}
function encodedStorage(value) {
  return { getItem: () => typeof value === 'string' ? value : JSON.stringify(value), setItem() {} };
}

test('local progress, sound preference and a copy of the last pose survive a new visit', () => {
  const storage = memoryStorage();
  const first = createVisit(collection, storage);
  assert.equal(first.markSeen('b'), true);
  first.setAudioEnabled(true);
  assert.equal(first.savePose({ x: 5, z: -12, yaw: .7 + Math.PI * 4, pitch: -.2, injected: 'ignored' }), true);
  const second = createVisit(collection, storage);
  assert.deepEqual([...second.visited], ['b']);
  assert.equal(second.audioEnabled, true);
  const pose = second.savedPose;
  assert.deepEqual(Object.keys(pose).sort(), ['pitch', 'x', 'yaw', 'z']);
  assert.ok(Math.abs(pose.yaw - .7) < 1e-10);
  pose.x = 100;
  assert.equal(second.savedPose.x, 5, 'callers cannot mutate the stored position');
  assert.equal(second.guided, false, 'restoring progress does not start a route');
});

test('route starts at the first unseen work and inspection keeps its selected stop', () => {
  const visit = createVisit(collection, null);
  visit.markSeen('a');
  assert.equal(visit.start(), collection[1]);
  visit.markSeen('b');
  assert.equal(visit.current, collection[1], 'inspection waits for the visitor to choose next');
  assert.equal(visit.next(), collection[2]);
  visit.markSeen('c');
  assert.equal(visit.next(), null);
  assert.equal(visit.guided, false);
  assert.equal(visit.current, null);
  assert.deepEqual([...visit.visited], ['a', 'b', 'c'], 'finishing does not erase the visit');
  assert.equal(visit.start(), collection[0], 'a completed collection can be revisited');
  assert.equal(visit.previous(), collection[0], 'previous clamps at the first stop');
  visit.next();
  assert.equal(visit.previous(), collection[0]);
  visit.stop();
  assert.equal(visit.current, null);
  assert.equal(visit.next(), null);
});

test('reset clears progress and position but remembers the visitor sound choice', () => {
  const storage = memoryStorage(), visit = createVisit(collection, storage);
  visit.markSeen('a'); visit.setAudioEnabled(true);
  visit.savePose({ x: 1, z: 2, yaw: 0, pitch: 0 }); visit.start(); visit.reset();
  const restored = createVisit(collection, storage);
  assert.equal(restored.visited.size, 0);
  assert.equal(restored.savedPose, null);
  assert.equal(restored.audioEnabled, true);
  assert.equal(visit.guided, false);
});

test('corrupt, incompatible, or untrusted saved values cannot invent works or camera fields', () => {
  for (const data of ['{broken', 'null', { version: 2, visited: ['a'] }, 'x'.repeat(64_001)]) {
    const visit = createVisit(collection, encodedStorage(data));
    assert.equal(visit.visited.size, 0);
    assert.equal(visit.savedPose, null);
  }
  const visit = createVisit(collection, encodedStorage({
    version: 1, visited: ['a', 'unknown', '__proto__', 'a', 42],
    pose: { x: 1e8, z: 0, yaw: 0, pitch: 0 }, audioEnabled: 'yes',
  }));
  assert.deepEqual([...visit.visited], ['a']);
  assert.equal(visit.savedPose, null);
  assert.equal(visit.audioEnabled, false);
  assert.equal(visit.markSeen('unknown'), false);
  assert.equal(visit.visited.size, 1);
});

test('corrupt local data can be repaired by subsequent valid progress', () => {
  const storage = memoryStorage([['atlas-museum:visit:v1', '{broken']]);
  const visit = createVisit(collection, storage);
  visit.markSeen('b');
  assert.deepEqual([...createVisit(collection, storage).visited], ['b']);
});

test('invalid poses cannot replace a previously safe camera position', () => {
  const visit = createVisit(collection, null), pose = { x: 0, z: 15, yaw: Math.PI, pitch: -.035 };
  assert.equal(visit.savePose(pose), true);
  const saved = visit.savedPose;
  for (const invalid of [null, {}, { ...pose, x: NaN }, { ...pose, z: Infinity },
    { ...pose, x: '0' }, { ...pose, pitch: 2 }, { ...pose, yaw: 1e20 }, { ...pose, z: -1001 }]) {
    assert.equal(visit.savePose(invalid), false);
    assert.deepEqual(visit.savedPose, saved);
  }
});

test('refused reads and exhausted storage degrade to a working in-memory visit', () => {
  for (const storage of [
    { getItem() { throw new DOMException('refused', 'SecurityError'); }, setItem() { throw new Error('refused'); } },
    { getItem() { return null; }, setItem() { throw new DOMException('full', 'QuotaExceededError'); } },
  ]) {
    const visit = createVisit(collection, storage);
    visit.markSeen('a'); visit.setAudioEnabled(true);
    visit.savePose({ x: 2, z: 3, yaw: 0, pitch: 0 });
    assert.equal(visit.start(), collection[1]);
    assert.equal(visit.audioEnabled, true);
    assert.equal(visit.savedPose.z, 3);
  }
});

test('default storage access is safe when the browser getter itself throws', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    const visit = createVisit(collection);
    visit.markSeen('a');
    assert.equal(visit.start(), collection[1]);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('an empty collection has no route and optional audio stays usable without Web Audio', async () => {
  const visit = createVisit([], null);
  assert.equal(visit.start(), null); assert.equal(visit.guided, false);
  const audio = createMuseumAudio();
  assert.equal(audio.enabled, false);
  assert.equal(await audio.setEnabled(true), false);
  audio.tick(.016, 3, 'library'); audio.pause();
  assert.equal(await audio.resume(), false);
  audio.dispose(); audio.dispose();
  assert.equal(await audio.setEnabled(true), false);
});

// A tiny browser substitute lets us check the user-gesture boundary, silence
// while idle/paused, and interrupted resume without producing actual sound.
class FakeAudioContext {
  static instances = [];
  constructor() {
    this.state = 'suspended'; this.sampleRate = 8000; this.currentTime = 0;
    this.destination = {}; this.sources = []; this.closed = 0;
    FakeAudioContext.instances.push(this);
  }
  node() {
    const parameter = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
    return { gain: parameter(), frequency: parameter(), Q: parameter(), pan: parameter(),
      connect() {}, start() { this.started = true; }, stop() { this.stopped = true; this.onended?.(); } };
  }
  createGain() { return this.node(); }
  createBiquadFilter() { return this.node(); }
  createStereoPanner() { return this.node(); }
  createBuffer(_channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  createBufferSource() { const source = this.node(); this.sources.push(source); return source; }
  createOscillator() { const source = this.node(); this.sources.push(source); return source; }
  resume() { this.state = 'running'; return this.resumeDelay || Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { this.state = 'closed'; this.closed++; return Promise.resolve(); }
}

async function withAudioContext(callback) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  FakeAudioContext.instances = [];
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: FakeAudioContext });
  try { await callback(); } finally {
    if (descriptor) Object.defineProperty(globalThis, 'AudioContext', descriptor);
    else delete globalThis.AudioContext;
  }
}

test('sound starts only on explicit enable, steps follow movement, and menus stay silent', async () => {
  await withAudioContext(async () => {
    const audio = createMuseumAudio();
    audio.tick(.05, 3, 'library');
    assert.equal(FakeAudioContext.instances.length, 0, 'construction and movement do not create audio');
    assert.equal(await audio.setEnabled(true), true);
    const context = FakeAudioContext.instances[0];
    const beforeWalking = context.sources.length;
    for (let i = 0; i < 20; i++) audio.tick(.05, 0, 'library');
    assert.equal(context.sources.length, beforeWalking, 'standing still makes no footsteps');
    for (let i = 0; i < 10; i++) audio.tick(.05, 3, 'library');
    assert.ok(context.sources.length > beforeWalking, 'actual distance produces a footstep');
    audio.pause();
    const beforePausedTick = context.sources.length;
    audio.tick(.05, 3, 'east');
    assert.equal(context.state, 'suspended');
    assert.equal(context.sources.length, beforePausedTick);
    assert.equal(audio.enabled, true, 'pausing retains the sound choice');
    assert.equal(await audio.resume(), true);
    assert.equal(FakeAudioContext.instances.length, 1, 'resume reuses the context');
    assert.equal(await audio.setEnabled(false), false);
    assert.equal(context.state, 'suspended');
    audio.dispose(); audio.dispose();
    assert.equal(context.closed, 1);
  });
});

test('a menu opened during asynchronous audio resume prevents late sound', async () => {
  await withAudioContext(async () => {
    const audio = createMuseumAudio();
    await audio.setEnabled(true);
    const context = FakeAudioContext.instances[0];
    audio.pause();
    let finishResume;
    context.resumeDelay = new Promise(resolve => { finishResume = resolve; });
    const pendingResume = audio.resume();
    audio.pause();
    const before = context.sources.length;
    finishResume();
    assert.equal(await pendingResume, false);
    assert.equal(context.state, 'suspended');
    assert.equal(context.sources.length, before, 'stale resume cannot restart room tone');
    assert.equal(audio.enabled, true);
    audio.dispose();
  });
});
