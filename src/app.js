import * as THREE from '../vendor/three.module.js';
import { createMuseum } from './museum.js';
import { artworks } from './collection.js';
import { EYE_HEIGHT, look, move, roomAt, nearestExhibit, canStand } from './navigation.js';

const $ = selector => document.querySelector(selector);
const canvas = $('#scene');
const inlineImages = typeof __ART_IMAGES__ === 'undefined' ? {} : __ART_IMAGES__;
const collection = artworks.map(a => ({ ...a, image: inlineImages[a.id] || a.image }));
const keys = new Set();
const state = { mode: 'loading', x: 0, z: 15, yaw: Math.PI, pitch: -.035, sensitivity: 1,
  visited: new Set(), pointerLocked: false, nearest: null, fps: 0 };
let renderer, camera, scene, museum, frame = 0, previous = 0, sampleStart = 0, sampleFrames = 0;
let drag = null, toastTimer, mapReturn = 'start', currentRoom;
const isTouch = matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('touch-device', isTouch);
const modalSelectors = { pause: '#pause', map: '#map', inspect: '#inspect' };

function notify(message) {
  $('#toast').textContent = message; $('#toast').classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.add('hidden'), 4200);
}
function clearKeys() { keys.clear(); drag = null; previous = 0; }
function releasePointer() {
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}
function setMode(mode) {
  state.mode = mode;
  clearKeys();
  $('#welcome').classList.toggle('hidden', mode !== 'start');
  $('#hud').classList.toggle('hidden', mode === 'start' || mode === 'loading');
  $('#touch-controls').classList.toggle('hidden', mode !== 'play' || !isTouch);
  for (const [name, selector] of Object.entries(modalSelectors)) $(selector).classList.toggle('hidden', mode !== name);
  $('#mouse-help').classList.add('hidden');
  canvas.setAttribute('aria-hidden', String(mode !== 'play'));
  const modal = modalSelectors[mode];
  $('#header').inert = Boolean(modal);
  $('#hud').inert = Boolean(modal);
  if (mode !== 'play') {
    releasePointer();
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (modal) $(modal).querySelector('button, a, input')?.focus({ preventScroll: true });
    else if (mode === 'start') $('#enter').focus({ preventScroll: true });
  }
}
function syncCamera() {
  camera.position.set(state.x, EYE_HEIGHT, state.z);
  const c = Math.cos(state.pitch);
  camera.lookAt(state.x + Math.sin(state.yaw) * c, EYE_HEIGHT + Math.sin(state.pitch), state.z + Math.cos(state.yaw) * c);
}
function render() { if (!renderer) return; syncCamera(); renderer.render(scene, camera); }
function resize() {
  if (!renderer) return;
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  render();
}
function showRoom() {
  const room = roomAt(state.x, state.z, museum.rooms);
  if (room?.id === currentRoom) return;
  currentRoom = room?.id;
  const index = museum.rooms.indexOf(room) + 1;
  $('#room-number').textContent = `ЗАЛ ${String(index).padStart(2, '0')} / 04`;
  $('#room-name').textContent = room.name;
  $('#room-subtitle').textContent = room.subtitle;
}
function updatePrompt() {
  const nearest = nearestExhibit(state, museum.exhibits);
  state.nearest = nearest;
  $('#inspect-prompt').classList.toggle('hidden', !nearest);
  $('#crosshair').classList.toggle('target', Boolean(nearest));
  if (nearest) $('#prompt-title').textContent = nearest.title;
}
function loop(time) {
  frame = 0;
  if (state.mode !== 'play') return;
  const dt = previous ? Math.min(.05, (time - previous) / 1000) : 0;
  previous = time;
  move(state, keys, dt, museum.walkable, museum.obstacles);
  showRoom(); updatePrompt(); render();
  sampleFrames++;
  if (time - sampleStart >= 750) {
    state.fps = Math.round(sampleFrames * 1000 / (time - sampleStart));
    $('#fps').textContent = `${state.fps} FPS`;
    sampleStart = time; sampleFrames = 0;
  }
  frame = requestAnimationFrame(loop);
}
function lockPointer() {
  if (state.mode !== 'play' || isTouch || state.pointerLocked) return;
  const unavailable = () => {
    if (state.mode === 'play' && !state.pointerLocked) $('#mouse-help').classList.remove('hidden');
  };
  try {
    if (!canvas.requestPointerLock) { unavailable(); return; }
    const result = canvas.requestPointerLock();
    result?.catch(unavailable);
  } catch { unavailable(); }
}
function play() {
  if (!museum) return;
  setMode('play'); canvas.focus({ preventScroll: true });
  sampleStart = performance.now(); sampleFrames = 0;
  lockPointer();
  if (!frame) frame = requestAnimationFrame(loop);
}
function pause() { if (state.mode === 'play') setMode('pause'); }
function openMap() {
  if (!museum) return;
  mapReturn = state.mode === 'start' ? 'start' : 'pause';
  setMode('map');
}
function closeMap() { setMode(mapReturn); }
const destinations = {
  library: { x: 0, z: 15, yaw: Math.PI },
  west: { x: -12, z: 0, yaw: -Math.PI / 2 },
  east: { x: 12, z: 0, yaw: Math.PI / 2 },
  north: { x: 0, z: -24, yaw: Math.PI }
};
function goToRoom(id) {
  const destination = destinations[id];
  if (!destination || !canStand(destination.x, destination.z, museum.walkable, museum.obstacles)) {
    notify('Эта точка недоступна. Войдите в зал через проход.'); return;
  }
  Object.assign(state, destination, { pitch: -.025 });
  showRoom(); render(); play();
}
function inspectArt() {
  if (state.mode !== 'play' || !state.nearest) return;
  const art = state.nearest;
  state.visited.add(art.id);
  $('#visited-count').textContent = state.visited.size;
  $('#art-number').textContent = `КОЛЛЕКЦИЯ · ${String(collection.findIndex(a => a.id === art.id) + 1).padStart(2, '0')} / ${String(collection.length).padStart(2, '0')}`;
  $('#art-title').textContent = art.title;
  $('#art-artist').textContent = `${art.artist} · ${art.year}`;
  $('#art-description').textContent = art.description;
  $('#art-medium').textContent = art.medium;
  $('#art-museum').textContent = art.museum;
  $('#art-image').src = art.image;
  $('#art-image').alt = `${art.artist}. ${art.title}, ${art.year}. Цифровая репродукция.`;
  $('#art-source').href = art.source;
  setMode('inspect');
}
async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else notify('В этом браузере полный экран недоступен.');
  } catch { notify('Браузер не разрешил включить полный экран.'); }
}
function screenshot() {
  render();
  canvas.toBlob(blob => {
    if (!blob) { notify('Не удалось сохранить снимок.'); return; }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = 'atlas-museum.png'; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    notify('Снимок сохранён.');
  }, 'image/png');
}

$('#enter').addEventListener('click', play);
$('#resume').addEventListener('click', play);
$('#menu-button').addEventListener('click', openMap);
$('#open-map').addEventListener('click', openMap);
$('#close-map').addEventListener('click', closeMap);
$('#close-art').addEventListener('click', play);
$('#return-art').addEventListener('click', play);
$('#inspect-prompt').addEventListener('click', inspectArt);
$('#touch-inspect').addEventListener('click', inspectArt);
$('#fullscreen').addEventListener('click', fullscreen);
$('#restart').addEventListener('click', () => goToRoom('library'));
$('#brand-home').addEventListener('click', e => {
  e.preventDefault();
  if (!museum) return;
  Object.assign(state, destinations.library, { pitch: -.035 });
  setMode('start'); render();
});
$('#sensitivity').addEventListener('input', e => {
  state.sensitivity = Number(e.target.value) / 100;
  $('#sensitivity-value').textContent = `${state.sensitivity.toFixed(2)}×`;
});

const gameKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyM', 'KeyF', 'KeyP', 'Space']);
document.addEventListener('keydown', event => {
  if (event.code === 'Tab' && modalSelectors[state.mode]) {
    const focusable = [...$(modalSelectors[state.mode]).querySelectorAll('button, a[href], input')].filter(el => !el.disabled && !el.hidden);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    return;
  }
  if (event.code === 'Escape') {
    if (state.mode === 'play') pause();
    else if (state.mode === 'inspect') { setMode('pause'); }
    else if (state.mode === 'map') closeMap();
    return;
  }
  if (state.mode !== 'play') return;
  if (gameKeys.has(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.repeat) return;
  if (event.code === 'KeyE') inspectArt();
  if (event.code === 'KeyM') openMap();
  if (event.code === 'KeyF') fullscreen();
  if (event.code === 'KeyP') screenshot();
});
document.addEventListener('keyup', e => keys.delete(e.code));
document.addEventListener('pointerlockchange', () => {
  const hadLock = state.pointerLocked;
  state.pointerLocked = document.pointerLockElement === canvas;
  $('#mouse-help').classList.toggle('hidden', state.pointerLocked || state.mode !== 'play' || isTouch);
  if (hadLock && !state.pointerLocked && state.mode === 'play') pause();
});
document.addEventListener('pointerlockerror', () => {
  if (state.mode === 'play' && !isTouch) $('#mouse-help').classList.remove('hidden');
});
document.addEventListener('mousemove', e => {
  if (state.mode === 'play' && state.pointerLocked) look(state, e.movementX, e.movementY);
});
canvas.addEventListener('pointerdown', event => {
  if (state.mode !== 'play' || (event.pointerType === 'mouse' && event.button !== 0)) return;
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
  if (event.pointerType === 'mouse') lockPointer();
});
canvas.addEventListener('pointermove', event => {
  if (state.mode !== 'play' || state.pointerLocked || drag?.id !== event.pointerId) return;
  look(state, event.clientX - drag.x, event.clientY - drag.y);
  drag.x = event.clientX; drag.y = event.clientY;
});
const endDrag = event => { if (drag?.id === event.pointerId) drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('lostpointercapture', endDrag);
for (const button of document.querySelectorAll('[data-move]')) {
  button.addEventListener('pointerdown', event => {
    event.preventDefault(); button.setPointerCapture(event.pointerId); keys.add(button.dataset.move);
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, () => keys.delete(button.dataset.move));
}
addEventListener('resize', resize);
addEventListener('blur', () => { clearKeys(); pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearKeys(); pause(); } });
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault(); pause(); notify('Графический контекст потерян. Обновите страницу, чтобы продолжить.');
});

async function init() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#d4c7ad');
    scene.fog = new THREE.Fog('#b3a58b', 38, 100);
    camera = new THREE.PerspectiveCamera(67, innerWidth / innerHeight, .08, 110);
    museum = createMuseum(scene, collection);
    Object.assign(state, museum.spawn);
    // Museum returns spawn in x/z; eye height is fixed for walking.
    const results = await Promise.allSettled(museum.texturePromises || []);
    const missing = results.filter(r => r.status === 'rejected' || r.value?.loaded === false);
    $('#total-count').textContent = ` / ${collection.length}`;
    for (const [i, room] of museum.rooms.entries()) {
      const button = document.createElement('button'); button.className = 'room-link'; button.dataset.room = room.id;
      const number = document.createElement('span'); number.textContent = String(i + 1).padStart(2, '0');
      const content = document.createElement('span'), title = document.createElement('strong'), subtitle = document.createElement('small');
      title.textContent = room.name; subtitle.textContent = room.id === 'library' ? 'Читальный зал и книжные галереи' : `${collection.filter(a => a.room === room.id).length} произведения в коллекции`;
      content.append(title, subtitle); button.append(number, content); button.addEventListener('click', () => goToRoom(room.id));
      $('#room-links').append(button);
    }
    // Use the GPU's supported anisotropy for the fine wood grain and paintings.
    scene.traverse(object => {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material?.map) material.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
      }
    });
    resize(); showRoom(); setMode('start'); $('#loading').remove();
    if (missing.length) notify(`Не загрузились изображения: ${missing.length}. Перезагрузите страницу или откройте автономный atlas-museum.html.`);
    console.info(`Атлас: ${museum.rooms.length} зала, ${museum.exhibits.length} произведений. WebGL 2. Частота кадров без программного ограничения.`);
    // Only an explicitly requested test session exposes state for the browser regressions.
    if (new URLSearchParams(location.search).has('test')) {
      window.__museumTest = { state, museum, renderer, camera, look, goToRoom, render, updatePrompt, setMode };
    }
  } catch (error) {
    console.error(error);
    $('#loading')?.remove(); $('#unsupported').classList.remove('hidden');
    $('#error-detail').textContent = error.message;
  }
}
init();
