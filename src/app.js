import * as THREE from '../vendor/three.module.js';
import { createMuseum } from './museum.js';
import { artworks } from './collection.js';
import { EYE_HEIGHT, look, move, roomAt, nearestExhibit, canStand } from './navigation.js';
import { createRendering } from './rendering.js';
import { createVisit } from './visit.js';
import { createMuseumAudio } from './audio.js';
import { createRoutePlanner } from './route.js';

const $ = selector => document.querySelector(selector);
const canvas = $('#scene');
const inlineImages = typeof __ART_IMAGES__ === 'undefined' ? {} : __ART_IMAGES__;
const collection = artworks.map(a => ({ ...a, image: inlineImages[a.id] || a.image }));
const visit = createVisit(collection);
const audio = createMuseumAudio();
const keys = new Set();
const state = { mode: 'loading', x: 0, z: 15, yaw: Math.PI, pitch: -.035, sensitivity: 1,
  visited: visit.visited, pointerLocked: false, nearest: null, fps: 0 };
let renderer, camera, scene, museum, pipeline, frame = 0, previous = 0, sampleStart = 0, sampleFrames = 0;
let drag = null, toastTimer, mapReturn = 'start', catalogReturn = 'start', artReturn = 'play', activeArt, currentRoom;
let sessionStarted = false, saveElapsed = 0;
let routePlanner, routeTargetId = null, routePath = [], routeOrigin;
const isTouch = matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('touch-device', isTouch);
const modalSelectors = { pause: '#pause', map: '#map', inspect: '#inspect', catalog: '#catalog' };

function notify(message) {
  $('#toast').textContent = message; $('#toast').classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.add('hidden'), 4200);
}
function clearKeys() { keys.clear(); drag = null; previous = 0; }
function releasePointer() {
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}
function setMode(mode) {
  if (state.mode === 'play' && mode !== 'play') visit.savePose(state);
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
    audio.pause();
    releasePointer();
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (modal) $(modal).querySelector('button, a, input')?.focus({ preventScroll: true });
    else if (mode === 'start') updateWelcome();
  }
}
function syncCamera() {
  camera.position.set(state.x, EYE_HEIGHT, state.z);
  const c = Math.cos(state.pitch);
  camera.lookAt(state.x + Math.sin(state.yaw) * c, EYE_HEIGHT + Math.sin(state.pitch), state.z + Math.cos(state.yaw) * c);
}
function render() { if (!renderer) return; syncCamera(); pipeline ? pipeline.render() : renderer.render(scene, camera); }
function resize() {
  if (!renderer) return;
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  pipeline?.resize(innerWidth, innerHeight, renderer.getPixelRatio());
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
  const oldX = state.x, oldZ = state.z;
  move(state, keys, dt, museum.walkable, museum.obstacles);
  const speed = dt ? Math.hypot(state.x - oldX, state.z - oldZ) / dt : 0;
  audio.tick(dt, speed, currentRoom);
  saveElapsed += dt;
  if (saveElapsed > 2) { visit.savePose(state); saveElapsed = 0; }
  showRoom(); updatePrompt(); updateRoute(); render();
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
  if (!sessionStarted) {
    const saved = visit.savedPose;
    if (saved && canStand(saved.x, saved.z, museum.walkable, museum.obstacles)) Object.assign(state, saved);
    sessionStarted = true;
  }
  setMode('play'); canvas.focus({ preventScroll: true });
  if (visit.audioEnabled) {
    const enabled = audio.enabled ? audio.resume() : audio.setEnabled(true);
    enabled.then(ok => { if (ok && state.mode !== 'play') audio.pause(); });
  }
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
function updateWelcome() {
  const hasProgress = visit.visited.size > 0 || Boolean(visit.savedPose);
  $('#enter-label').textContent = hasProgress ? 'Продолжить прогулку' : 'Войти в музей';
  $('#reset-visit').classList.toggle('hidden', !hasProgress);
  $('#entry-note').textContent = hasProgress ? `Вы познакомились с ${visit.visited.size} из ${collection.length} произведений. Продолжите свои открытия.` : 'Без билетов. Без спешки. В своём темпе.';
}
function updateCatalog() {
  const list = $('#catalog-list'); list.replaceChildren();
  $('#catalog-progress').textContent = `Знакомы с ${visit.visited.size} из ${collection.length} произведений`;
  collection.forEach((art, index) => {
    const button = document.createElement('button'); button.className = 'catalog-work'; button.dataset.art = art.id;
    const image = document.createElement('img'); image.src = art.image; image.alt = `${art.artist}. ${art.title}`; image.loading = 'lazy';
    const content = document.createElement('span');
    const number = document.createElement('small'); number.className = 'catalog-number'; number.textContent = `${String(index + 1).padStart(2, '0')} / ${art.year}`;
    const title = document.createElement('strong'); title.textContent = art.title;
    const artist = document.createElement('span'); artist.textContent = art.artist;
    const seen = document.createElement('small'); seen.className = 'catalog-seen'; seen.textContent = visit.visited.has(art.id) ? 'Знакомое произведение ✓' : 'Открыть произведение →';
    content.append(number, title, artist, seen); button.append(image, content);
    button.addEventListener('click', () => openArt(art, 'catalog')); list.append(button);
  });
}
function openCatalog() {
  if (!museum) return;
  catalogReturn = state.mode === 'start' ? 'start' : 'pause';
  updateCatalog(); setMode('catalog');
}
function updateRoute() {
  const target = visit.current;
  $('#route-card').classList.toggle('hidden', !target);
  $('#toggle-route').firstChild.textContent = target ? 'Завершить маршрут ' : 'Маршрут по коллекции ';
  if (!target) { routeTargetId = null; routePath = []; return; }
  const art = museum.exhibits.find(a => a.id === target.id);
  const goal = art.viewPosition;
  const offPath = routePath.length && routeOrigin && distanceToSegment(state, routeOrigin, routePath[0]) > 1.6;
  const leftPainting = !routePath.length && Math.hypot(state.x - goal.x, state.z - goal.z) > 1.7;
  if (routeTargetId !== art.id || offPath || leftPainting) {
    routeTargetId = art.id; routePath = routePlanner.find(state, goal);
    routeOrigin = { x: state.x, z: state.z };
  }
  while (routePath.length && Math.hypot(state.x - routePath[0].x, state.z - routePath[0].z) < .55
    && (routePath.length === 1 || clearSegment(state, routePath[1]))) routeOrigin = routePath.shift();
  const waypoint = routePath[0] || art.position;
  const dx = waypoint.x - state.x, dz = waypoint.z - state.z;
  const bearing = Math.atan2(dx, dz) - state.yaw;
  const rotation = -Math.atan2(Math.sin(bearing), Math.cos(bearing));
  $('#route-arrow').style.transform = `rotate(${rotation}rad)`;
  $('#route-index').textContent = `${collection.findIndex(a => a.id === art.id) + 1} / ${collection.length}`;
  $('#route-title').textContent = art.title;
  let distance = Math.hypot(dx, dz);
  for (let i = 1; i < routePath.length; i++) distance += Math.hypot(routePath[i].x - routePath[i - 1].x, routePath[i].z - routePath[i - 1].z);
  $('#route-location').textContent = state.nearest?.id === art.id ? 'Перед вами · E — описание' : `${art.roomTitle} · около ${Math.round(distance)} м`;
}
function distanceToSegment(point, start, end) {
  const dx = end.x - start.x, dz = end.z - start.z;
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(point.x - start.x - t * dx, point.z - start.z - t * dz);
}
function clearSegment(start, end) {
  const steps = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.z - start.z) / .1));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!canStand(start.x + (end.x - start.x) * t, start.z + (end.z - start.z) * t, museum.walkable, museum.obstacles)) return false;
  }
  return true;
}
function startRoute() {
  visit.start(); play(); updateRoute();
  notify('Маршрут начат. Стрелка подскажет направление. E — о картине, N — следующая работа.');
}
function nextInRoute() {
  if (!visit.guided) return;
  const next = visit.next(); updateRoute(); play();
  if (!next) notify('Маршрут завершён. Музей остаётся открытым для свободной прогулки.');
}
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
  routeTargetId = null;
  sessionStarted = true;
  showRoom(); render(); play();
}
function inspectArt() {
  if (state.mode === 'play' && state.nearest) openArt(state.nearest, 'play');
}
function openArt(art, origin) {
  activeArt = art; artReturn = origin;
  visit.markSeen(art.id);
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
  $('#return-art-label').textContent = origin === 'catalog' ? 'Вернуться к коллекции' : 'Продолжить прогулку';
  $('#art-next').classList.toggle('hidden', !visit.guided || visit.current?.id !== art.id);
  setMode('inspect');
}
function closeArt() {
  if (artReturn === 'catalog') { updateCatalog(); setMode('catalog'); }
  else play();
}
function goToArt() {
  const exhibit = museum.exhibits.find(a => a.id === activeArt?.id);
  if (!exhibit || !canStand(exhibit.viewPosition.x, exhibit.viewPosition.z, museum.walkable, museum.obstacles)) return;
  Object.assign(state, exhibit.viewPosition, { pitch: .12 });
  routeTargetId = null;
  sessionStarted = true; showRoom(); updatePrompt(); play();
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
$('#close-art').addEventListener('click', closeArt);
$('#return-art').addEventListener('click', closeArt);
$('#go-to-art').addEventListener('click', goToArt);
$('#welcome-catalog').addEventListener('click', openCatalog);
$('#open-catalog').addEventListener('click', openCatalog);
$('#close-catalog').addEventListener('click', () => setMode(catalogReturn));
$('#start-route').addEventListener('click', startRoute);
$('#route-next').addEventListener('click', nextInRoute);
$('#art-next').addEventListener('click', nextInRoute);
$('#toggle-route').addEventListener('click', () => {
  if (visit.guided) { visit.stop(); updateRoute(); play(); }
  else startRoute();
});
$('#reset-visit').addEventListener('click', () => {
  visit.reset(); sessionStarted = true; Object.assign(state, museum.spawn, { pitch: -.035 });
  $('#visited-count').textContent = '0'; updateRoute(); play();
});
$('#audio-enabled').checked = visit.audioEnabled;
$('#audio-enabled').addEventListener('change', async event => {
  const requested = event.target.checked;
  const enabled = await audio.setEnabled(requested);
  visit.setAudioEnabled(enabled); event.target.checked = enabled;
  if (state.mode !== 'play') audio.pause();
  if (requested && !enabled) notify('В этом браузере звук недоступен. Прогулка продолжится без звука.');
});
$('#inspect-prompt').addEventListener('click', inspectArt);
$('#touch-inspect').addEventListener('click', inspectArt);
$('#fullscreen').addEventListener('click', fullscreen);
$('#restart').addEventListener('click', () => goToRoom('library'));
$('#brand-home').addEventListener('click', e => {
  e.preventDefault();
  if (!museum) return;
  // Save the real visit before moving the landing-page camera to the entrance.
  setMode('start');
  Object.assign(state, destinations.library, { pitch: -.035 });
  sessionStarted = false; routeTargetId = null; render();
});
$('#sensitivity').addEventListener('input', e => {
  state.sensitivity = Number(e.target.value) / 100;
  $('#sensitivity-value').textContent = `${state.sensitivity.toFixed(2)}×`;
});

const gameKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyM', 'KeyC', 'KeyN', 'KeyF', 'KeyP', 'Space']);
document.addEventListener('keydown', event => {
  if (event.code === 'Tab' && modalSelectors[state.mode]) {
    const focusable = [...$(modalSelectors[state.mode]).querySelectorAll('button, a[href], input, summary')].filter(el => !el.disabled && el.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    return;
  }
  if (event.code === 'Escape') {
    if (state.mode === 'play') pause();
    else if (state.mode === 'inspect') { artReturn === 'catalog' ? closeArt() : setMode('pause'); }
    else if (state.mode === 'map') closeMap();
    else if (state.mode === 'catalog') setMode(catalogReturn);
    return;
  }
  if (state.mode !== 'play') return;
  if (gameKeys.has(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.repeat) return;
  if (event.code === 'KeyE') inspectArt();
  if (event.code === 'KeyM') openMap();
  if (event.code === 'KeyC') openCatalog();
  if (event.code === 'KeyN') nextInRoute();
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
    scene.fog = new THREE.Fog('#c7baa4', 48, 100);
    camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, .12, 95);
    museum = createMuseum(scene, collection);
    routePlanner = createRoutePlanner(museum.walkable, museum.obstacles);
    Object.assign(state, museum.spawn);
    // Museum returns spawn in x/z; eye height is fixed for walking.
    const results = await Promise.allSettled(museum.texturePromises || []);
    const missing = results.filter(r => r.status === 'rejected' || r.value?.loaded === false);
    $('#total-count').textContent = ` / ${collection.length}`;
    $('#visited-count').textContent = visit.visited.size;
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
        for (const key of ['map', 'normalMap', 'roughnessMap', 'bumpMap']) {
          if (material?.[key]) material[key].anisotropy = renderer.capabilities.getMaxAnisotropy();
        }
      }
    });
    pipeline = createRendering(renderer, scene, camera);
    resize(); showRoom(); setMode('start'); $('#loading').remove();
    if (missing.length) notify(`Не загрузились изображения: ${missing.length}. Перезагрузите страницу или откройте автономный atlas-museum.html.`);
    console.info(`Атлас: ${museum.rooms.length} зала, ${museum.exhibits.length} произведений. WebGL 2. Частота кадров без программного ограничения.`);
    // Only an explicitly requested test session exposes state for the browser regressions.
    if (new URLSearchParams(location.search).has('test')) {
      window.__museumTest = { state, museum, renderer, camera, pipeline, visit, audio, routePlanner, look, goToRoom, render, updatePrompt, setMode };
    }
  } catch (error) {
    console.error(error);
    $('#loading')?.remove(); $('#unsupported').classList.remove('hidden');
    $('#error-detail').textContent = error.message;
  }
}
init();
