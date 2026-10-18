import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const baseURL = process.env.MUSEUM_TEST_URL || 'http://127.0.0.1:4173';
const results = fileURLToPath(new URL('../test-results/', import.meta.url));
await mkdir(results, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, acceptDownloads: true });
// Browser automation often cannot acquire an OS pointer lock. Exercise the
// supported drag fallback with real mouse events, rather than bypassing look().
await context.addInitScript(() => {
  Object.defineProperty(Element.prototype, 'requestPointerLock', { value: undefined, configurable: true });
  window.__testAudioContexts = [];
  const NativeAudioContext = window.AudioContext;
  if (NativeAudioContext) window.AudioContext = class extends NativeAudioContext {
    constructor(...args) { super(...args); window.__testAudioContexts.push(this); }
  };
});
const page = await context.newPage();
page.setDefaultTimeout(60_000);
const errors = [];
const consoleErrors = [];
const failedRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('requestfailed', request => failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`));
page.on('response', response => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`); });
const log = message => console.log(`✓ ${message}`);
const modeIs = mode => page.waitForFunction(value => window.__museumTest?.state.mode === value, mode);

try {
  await page.goto(`${baseURL}/?test=1`, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.waitForFunction(() => Boolean(window.__museumTest), null, { timeout: 120_000 });
  assert.equal(await page.locator('#unsupported').isVisible(), false);
  assert.equal(await page.locator('#welcome').isVisible(), true);
  assert.equal(await page.locator('#enter-label').textContent(), 'Войти в музей');
  assert.equal(await page.locator('#audio-enabled').isChecked(), false);
  assert.equal(await page.evaluate(() => window.__testAudioContexts.length), 0, 'sound is never created before opting in');
  assert.equal(await page.locator('select').count(), 0, 'there are no graphics or FPS selectors');
  assert.equal(await page.locator('input[type=range]').count(), 1, 'only mouse sensitivity is adjustable');
  const rendered = await page.evaluate(async () => {
    const { museum, renderer, pipeline, render } = window.__museumTest;
    const textures = await Promise.all(museum.texturePromises);
    render();
    const gl = renderer.getContext();
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const colors = new Set();
    let lit = 0;
    for (let i = 0; i < pixels.length; i += 4096) {
      colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
      if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 40) lit++;
    }
    return { rooms: museum.rooms.map(r => r.id), artIds: museum.exhibits.map(a => a.id), textures, calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles, colors: colors.size, lit,
      shadows: renderer.shadowMap.enabled, staticShadows: !renderer.shadowMap.autoUpdate,
      antialias: gl.getContextAttributes().antialias, msaa: pipeline.samples,
      environment: Boolean(pipeline.composer.passes[0].scene.environment?.isTexture), ao: pipeline.ao.enabled };
  });
  assert.deepEqual(rendered.rooms, ['library', 'west', 'east', 'north']);
  assert.equal(rendered.artIds.length, 6);
  assert.deepEqual(rendered.textures.filter(t => rendered.artIds.includes(t.id)).map(t => t.id).sort(), [...rendered.artIds].sort(), 'each real artwork has its own successfully decoded texture');
  assert.ok(rendered.textures.every(t => t.loaded), JSON.stringify(rendered.textures));
  assert.ok(rendered.calls > 20 && rendered.triangles > 1000, 'actual geometry is rendered');
  assert.ok(rendered.colors > 50 && rendered.lit > 50, 'the WebGL frame contains a detailed lit scene');
  assert.equal(rendered.shadows, true);
  assert.equal(rendered.staticShadows, true);
  assert.equal(rendered.antialias, true);
  assert.ok(rendered.msaa > 0, 'the postprocessing render target uses MSAA');
  assert.equal(rendered.environment, true);
  assert.equal(rendered.ao, true);
  await page.screenshot({ path: `${results}/landing.png` });
  log(`WebGL: ${rendered.calls} draw calls, ${rendered.triangles} triangles; MSAA, AO, environment and static shadows; all ${rendered.textures.length} textures loaded including 6 artworks`);

  await page.locator('#welcome-catalog').click();
  await modeIs('catalog');
  assert.equal(await page.locator('#catalog [data-art]').count(), 6);
  await page.locator('#close-catalog').click();
  await modeIs('start');
  assert.equal(await page.locator('#enter-label').textContent(), 'Войти в музей', 'browsing the collection does not start a visit');

  await page.locator('#enter').click();
  await modeIs('play');
  await page.locator('#mouse-help').waitFor({ state: 'visible' });
  const beforeMouse = await page.evaluate(() => {
    const t = window.__museumTest;
    t.render();
    const target = t.camera.position.clone().addScaledVector(t.camera.getWorldDirection(t.camera.position.clone()), 10);
    return { yaw: t.state.yaw, pitch: t.state.pitch, target: target.toArray() };
  });
  await page.mouse.move(850, 380);
  await page.mouse.down();
  await page.mouse.move(930, 320, { steps: 5 });
  await page.mouse.up();
  const afterMouse = await page.evaluate(before => {
    const t = window.__museumTest;
    t.render();
    const target = t.camera.position.clone().fromArray(before.target).project(t.camera);
    return { yaw: t.state.yaw, pitch: t.state.pitch, projectedX: target.x, projectedY: target.y };
  }, beforeMouse);
  assert.ok(afterMouse.yaw < beforeMouse.yaw && afterMouse.projectedX < -.05, 'mouse right turns view right');
  assert.ok(afterMouse.pitch > beforeMouse.pitch && afterMouse.projectedY < -.05, 'mouse up turns view up');
  log('real mouse drag turns right and up without inversion');

  await page.evaluate(() => Object.assign(window.__museumTest.state, { x: 0, z: 15, yaw: Math.PI, pitch: 0 }));
  for (const [key, axis, sign] of [['w', 'z', -1], ['d', 'x', 1], ['s', 'z', 1], ['a', 'x', -1]]) {
    const previous = await page.evaluate(axis => window.__museumTest.state[axis], axis);
    await page.keyboard.down(key);
    await page.waitForFunction(({ axis, previous, sign }) => (window.__museumTest.state[axis] - previous) * sign > .15, { axis, previous, sign });
    await page.keyboard.up(key);
  }
  log('WASD input moves in all four camera-relative directions');

  const collision = await page.evaluate(async () => {
    const { move, canStand } = await import('/src/navigation.js');
    const { museum } = window.__museumTest;
    const walk = (start, frames) => {
      const state = { pitch: 0, sensitivity: 1, ...start };
      for (let i = 0; i < frames; i++) move(state, new Set(['KeyW']), .05, museum.walkable, museum.obstacles);
      return { ...state, valid: canStand(state.x, state.z, museum.walkable, museum.obstacles) };
    };
    return {
      west: walk({ x: 0, z: 0, yaw: -Math.PI / 2 }, 80),
      east: walk({ x: 0, z: 0, yaw: Math.PI / 2 }, 80),
      north: walk({ x: 0, z: -15, yaw: Math.PI }, 55),
      libraryWall: walk({ x: 0, z: 4, yaw: Math.PI / 2 }, 100),
      outerWall: walk({ x: -20, z: 0, yaw: -Math.PI / 2 }, 100),
      exhibitPositions: museum.exhibits.map(a => ({ id: a.id, valid: canStand(a.viewPosition.x, a.viewPosition.z, museum.walkable, museum.obstacles) })),
    };
  });
  assert.ok(collision.west.x < -10 && collision.west.valid, 'west doorway is traversable');
  assert.ok(collision.east.x > 10 && collision.east.valid, 'east doorway is traversable');
  assert.ok(collision.north.z < -22 && collision.north.valid, 'north doorway is traversable');
  assert.ok(collision.libraryWall.x < 6 && collision.libraryWall.valid, 'solid library side wall blocks movement');
  assert.ok(collision.outerWall.x > -22 && collision.outerWall.valid, 'outer gallery wall blocks movement');
  assert.ok(collision.exhibitPositions.every(p => p.valid), JSON.stringify(collision.exhibitPositions));
  log('actual museum collision map: all doorways connect, walls block, every painting has a reachable viewing position');

  const plannedRoutes = await page.evaluate(async () => {
    const { canStand } = await import('/src/navigation.js');
    const { museum, routePlanner } = window.__museumTest;
    const west = museum.exhibits.find(a => a.room === 'west');
    const east = museum.exhibits.find(a => a.room === 'east');
    const cases = museum.exhibits.map(art => ({ id: art.id, start: museum.spawn, goal: art.viewPosition }));
    cases.push({ id: 'gallery-to-gallery', start: west.viewPosition, goal: east.viewPosition });
    return cases.map(({ id, start, goal }) => {
      const path = routePlanner.find(start, goal);
      let previous = start, invalid = null, length = 0;
      for (const next of path) {
        const distance = Math.hypot(next.x - previous.x, next.z - previous.z);
        length += distance;
        const samples = Math.max(1, Math.ceil(distance / .05));
        for (let i = 0; i <= samples; i++) {
          const t = i / samples;
          const x = previous.x + (next.x - previous.x) * t;
          const z = previous.z + (next.z - previous.z) * t;
          if (!canStand(x, z, museum.walkable, museum.obstacles) && !invalid) invalid = { x, z };
        }
        previous = next;
      }
      return { id, waypoints: path.length, length, invalid, endpointDistance: Math.hypot(previous.x - goal.x, previous.z - goal.z) };
    });
  });
  for (const route of plannedRoutes) {
    assert.ok(route.waypoints > 0, `${route.id}: a walking route exists`);
    assert.equal(route.invalid, null, `${route.id}: every segment clears walls and furniture at 5 cm samples (${JSON.stringify(route.invalid)})`);
    assert.ok(route.endpointDistance < .001, `${route.id}: route ends at the artwork's exact viewing position`);
  }
  const westId = await page.evaluate(() => window.__museumTest.museum.exhibits.find(a => a.room === 'west').id);
  assert.ok(plannedRoutes.find(r => r.id === westId).waypoints > 1, 'the western route bends through a doorway instead of pointing through a wall');
  assert.ok(plannedRoutes.find(r => r.id === 'gallery-to-gallery').waypoints > 1, 'gallery-to-gallery guidance follows the connecting doors');
  log('real museum routes reach all 6 artworks and cross galleries, with every segment clear at 5 cm samples');

  await page.keyboard.press('c');
  await modeIs('catalog');
  const works = await page.evaluate(() => window.__museumTest.museum.exhibits.map(a => ({ id: a.id, title: a.title, artist: a.artist, year: a.year })));
  assert.equal(await page.locator('#catalog [data-art]').count(), works.length);
  for (const art of works) {
    const card = page.locator(`#catalog [data-art="${art.id}"]`);
    assert.equal(await card.locator('strong').textContent(), art.title);
    assert.ok((await card.textContent()).includes(art.artist));
    assert.ok((await card.textContent()).includes(art.year));
    assert.equal(await card.locator('img').getAttribute('alt'), `${art.artist}. ${art.title}`);
    await card.scrollIntoViewIfNeeded();
    await card.locator('img').evaluate(image => image.decode());
    assert.ok(await card.locator('img').evaluate(image => image.naturalWidth > 100), 'catalog has a real image thumbnail');
  }
  await page.locator('#catalog [data-art]').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${results}/catalog.png` });
  const routeStart = await page.evaluate(() => ({ x: window.__museumTest.state.x, z: window.__museumTest.state.z }));
  await page.locator('#start-route').click();
  await modeIs('play');
  for (const art of works) {
    assert.equal(await page.evaluate(() => window.__museumTest.visit.current?.id), art.id);
    assert.equal(await page.locator('#route-card').isVisible(), true);
    assert.equal(await page.locator('#route-title').textContent(), art.title);
    await page.keyboard.press('n');
  }
  assert.equal(await page.evaluate(() => window.__museumTest.visit.guided), false);
  assert.equal(await page.locator('#route-card').isVisible(), false);
  assert.equal(await page.locator('#visited-count').textContent(), '0', 'advancing the route does not falsely mark works as seen');
  assert.deepEqual(await page.evaluate(() => ({ x: window.__museumTest.state.x, z: window.__museumTest.state.z })), routeStart, 'route guidance does not teleport the visitor');
  await page.keyboard.press('Escape');
  await modeIs('pause');
  await page.locator('#open-catalog').click();
  await modeIs('catalog');
  await page.locator('#start-route').click();
  await modeIs('play');
  await page.keyboard.press('Escape');
  await modeIs('pause');
  await page.locator('#toggle-route').click();
  await modeIs('play');
  assert.equal(await page.evaluate(() => window.__museumTest.visit.guided), false, 'the menu can stop a route');
  log('C and pause menu open the illustrated catalog; N advances the route to completion without marking visited or teleporting; stop works');

  await page.keyboard.press('c');
  await modeIs('catalog');
  await page.locator(`#catalog [data-art="${works[0].id}"]`).click();
  await modeIs('inspect');
  assert.equal(await page.locator('#art-title').textContent(), works[0].title);
  assert.equal(await page.locator('#return-art-label').textContent(), 'Вернуться к коллекции');
  await page.locator('#return-art').click();
  await modeIs('catalog');
  assert.ok((await page.locator(`#catalog [data-art="${works[0].id}"] .catalog-seen`).textContent()).includes('✓'));
  await page.locator(`#catalog [data-art="${works[0].id}"]`).click();
  await modeIs('inspect');
  await page.locator('#go-to-art').click();
  await modeIs('play');
  await page.waitForFunction(id => window.__museumTest.state.nearest?.id === id, works[0].id);
  await page.locator('#inspect-prompt').waitFor({ state: 'visible' });
  const actualView = await page.evaluate(() => {
    const t = window.__museumTest, art = t.museum.exhibits[0];
    return Math.hypot(t.state.x - art.viewPosition.x, t.state.z - art.viewPosition.z);
  });
  assert.ok(actualView < .001, 'go to artwork uses its verified viewing position');
  log('catalog artwork returns to the catalog and Go to artwork reaches the painting with an active inspect prompt');

  const beforeHome = await page.evaluate(() => {
    const { x, z, yaw, pitch } = window.__museumTest.state;
    return { x, z, yaw, pitch };
  });
  await page.locator('#brand-home').click();
  await modeIs('start');
  assert.equal(await page.locator('#enter-label').textContent(), 'Продолжить прогулку');
  assert.ok(await page.evaluate(previous => Math.hypot(window.__museumTest.state.x - previous.x, window.__museumTest.state.z - previous.z) > 1, beforeHome), 'the landing camera moves away from the artwork');
  await page.locator('#enter').click();
  await modeIs('play');
  const afterHome = await page.evaluate(() => {
    const { x, z, yaw, pitch } = window.__museumTest.state;
    return { x, z, yaw, pitch };
  });
  for (const field of ['x', 'z', 'pitch']) assert.ok(Math.abs(afterHome[field] - beforeHome[field]) < .001, `logo then Continue preserves ${field}`);
  assert.ok(Math.abs(Math.atan2(Math.sin(afterHome.yaw - beforeHome.yaw), Math.cos(afterHome.yaw - beforeHome.yaw))) < .001, 'logo then Continue preserves view direction');
  log('returning through the logo preserves the actual visit location for Continue');

  for (const room of ['library', 'west', 'east', 'north']) {
    await page.keyboard.press('m');
    await modeIs('map');
    await page.locator(`[data-room="${room}"]`).click();
    await modeIs('play');
    await page.waitForFunction(room => window.__museumTest.museum.rooms.find(r => r.id === room)?.name === document.querySelector('#room-name').textContent, room);
    await page.screenshot({ path: `${results}/${room}.png` });
  }
  log('M opens the map and every room button teleports to the selected room');

  const exhibitCount = await page.evaluate(() => window.__museumTest.museum.exhibits.length);
  for (let index = 0; index < exhibitCount; index++) {
    const expected = await page.evaluate(index => {
      const t = window.__museumTest, art = t.museum.exhibits[index];
      Object.assign(t.state, art.viewPosition, { pitch: 0 });
      t.updatePrompt(); t.render();
      return { id: art.id, title: art.title, artist: art.artist, description: art.description, source: art.source, nearest: t.state.nearest?.id };
    }, index);
    assert.equal(expected.nearest, expected.id);
    await page.locator('#inspect-prompt').waitFor({ state: 'visible' });
    await page.keyboard.press('e');
    await modeIs('inspect');
    assert.equal(await page.locator('#art-title').textContent(), expected.title);
    assert.equal(await page.locator('#art-description').textContent(), expected.description);
    assert.ok((await page.locator('#art-artist').textContent()).includes(expected.artist));
    assert.equal(await page.locator('#art-source').getAttribute('href'), expected.source);
    await page.waitForFunction(() => { const img = document.querySelector('#art-image'); return img.complete && img.naturalWidth > 100; });
    await page.locator('#return-art').click();
    await modeIs('play');
  }
  assert.equal(await page.locator('#visited-count').textContent(), String(exhibitCount));
  log('E opens all 6 correct descriptions, sources and image reproductions; return resumes walking');

  await page.keyboard.press('Escape');
  await modeIs('pause');
  await page.locator('#sensitivity').evaluate(input => { input.value = '155'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal(await page.evaluate(() => window.__museumTest.state.sensitivity), 1.55);
  assert.equal(await page.locator('#sensitivity-value').textContent(), '1.55×');
  await page.locator('#audio-enabled').check();
  await page.waitForFunction(() => window.__museumTest.visit.audioEnabled && window.__testAudioContexts[0]?.state === 'suspended');
  assert.equal(await page.evaluate(() => window.__museumTest.audio.enabled), true);
  const renders = await page.evaluate(() => {
    const t = window.__museumTest, original = t.renderer.render.bind(t.renderer);
    window.__testRenderCount = 0;
    t.renderer.render = (...args) => { window.__testRenderCount++; return original(...args); };
    return window.__testRenderCount;
  });
  await page.waitForTimeout(650);
  assert.equal(await page.evaluate(() => window.__testRenderCount), renders, 'pause must stop continuous GPU rendering');
  await page.locator('#resume').click();
  await modeIs('play');
  await page.waitForFunction(() => window.__testAudioContexts[0]?.state === 'running');
  const downloadEvent = page.waitForEvent('download');
  await page.keyboard.press('p');
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), 'atlas-museum.png');
  assert.equal(await download.failure(), null);
  await download.saveAs(`${results}/download.png`);
  await page.keyboard.press('c');
  await modeIs('catalog');
  await page.waitForFunction(() => window.__testAudioContexts[0]?.state === 'suspended');
  await page.locator('#close-catalog').click();
  await modeIs('pause');
  log('sensitivity, optional sound that suspends in menus, pause without continuous rendering, resume, and P screenshot download work');

  const saved = await page.evaluate(async () => {
    const saved = JSON.parse(localStorage.getItem('atlas-museum:visit:v1'));
    const { canStand } = await import('/src/navigation.js');
    const { museum } = window.__museumTest;
    return { ...saved, safe: canStand(saved.pose.x, saved.pose.z, museum.walkable, museum.obstacles) };
  });
  assert.ok(saved.safe, 'the saved last position is physically reachable');
  assert.equal(saved.visited.length, exhibitCount);
  assert.equal(saved.audioEnabled, true);
  await page.reload({ waitUntil: 'networkidle', timeout: 120_000 });
  await page.waitForFunction(() => Boolean(window.__museumTest), null, { timeout: 120_000 });
  await modeIs('start');
  assert.equal(await page.locator('#welcome').isVisible(), true, 'reload waits for an explicit Continue gesture');
  assert.equal(await page.locator('#enter-label').textContent(), 'Продолжить прогулку');
  assert.equal(await page.locator('#visited-count').textContent(), String(exhibitCount));
  assert.equal(await page.locator('#audio-enabled').isChecked(), true, 'the chosen audio preference persists');
  assert.equal(await page.evaluate(() => window.__testAudioContexts.length), 0, 'saved audio preference does not autoplay on reload');
  await page.locator('#enter').click();
  await modeIs('play');
  const restored = await page.evaluate(() => {
    const { x, z, yaw, pitch } = window.__museumTest.state;
    return { x, z, yaw, pitch };
  });
  for (const field of ['x', 'z', 'pitch']) assert.ok(Math.abs(restored[field] - saved.pose[field]) < .001, `Continue restores ${field}`);
  assert.ok(Math.abs(Math.atan2(Math.sin(restored.yaw - saved.pose.yaw), Math.cos(restored.yaw - saved.pose.yaw))) < .001, 'Continue restores view direction');
  await page.waitForFunction(() => window.__testAudioContexts[0]?.state === 'running');
  await page.keyboard.press('Escape');
  await modeIs('pause');
  await page.waitForFunction(() => window.__testAudioContexts[0]?.state === 'suspended');
  await page.locator('#audio-enabled').uncheck();
  await page.waitForFunction(() => !window.__museumTest.visit.audioEnabled && !window.__museumTest.audio.enabled);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('atlas-museum:visit:v1')).audioEnabled), false);
  log('reload keeps all 6 visited artworks, the last safe pose and sound preference; Continue explicitly resumes; sound can be switched off');

  assert.deepEqual(errors, [], 'the live app has no uncaught browser errors');
  assert.deepEqual(consoleErrors, [], 'the live app has no shader, WebGL or other console errors');
  assert.deepEqual(failedRequests, [], 'the live app loads all resources successfully');

  const offline = await context.newPage();
  offline.setDefaultTimeout(90_000);
  const offlineErrors = [], offlineConsoleErrors = [], network = [];
  const standaloneURL = `${baseURL}/atlas-museum.html`;
  offline.on('pageerror', error => offlineErrors.push(error.message));
  offline.on('console', message => { if (message.type() === 'error') offlineConsoleErrors.push(message.text()); });
  offline.on('request', request => {
    if (/^https?:/.test(request.url()) && !(request.isNavigationRequest() && request.url() === standaloneURL)) network.push(request.url());
  });
  let standaloneTransport = 'file://';
  try {
    await offline.goto(pathToFileURL(fileURLToPath(new URL('../atlas-museum.html', import.meta.url))).href, { waitUntil: 'load', timeout: 120_000 });
  } catch (error) {
    if (!error.message.includes('ERR_BLOCKED_BY_ADMINISTRATOR')) throw error;
    // The managed Chromium in some cloud machines forbids all local-file
    // navigation. Respect that policy and test the same generated document via
    // localhost; any dependency request is denied and fails the assertion below.
    console.warn('! Managed Chromium blocks file:// navigation (ERR_BLOCKED_BY_ADMINISTRATOR); local-file opening remains unverified in this environment.');
    await offline.route('**/*', route => {
      if (route.request().isNavigationRequest() && route.request().url() === standaloneURL) return route.continue();
      return route.abort('blockedbyclient');
    });
    await offline.goto(standaloneURL, { waitUntil: 'load', timeout: 120_000 });
    standaloneTransport = 'localhost with every additional network request blocked';
  }
  await offline.locator('#loading').waitFor({ state: 'detached', timeout: 120_000 });
  assert.equal(await offline.locator('#unsupported').isVisible(), false);
  await offline.locator('#enter').press('Enter');
  await offline.locator('#hud').waitFor({ state: 'visible' });
  await offline.keyboard.press('m');
  await offline.locator('[data-room="west"]').click();
  await offline.waitForFunction(() => document.querySelector('#room-number').textContent.includes('02 / 04'));
  await offline.keyboard.press('c');
  await offline.locator('#catalog').waitFor({ state: 'visible' });
  assert.equal(await offline.locator('#catalog [data-art]').count(), 6);
  await offline.locator('#catalog [data-art]').first().click();
  await offline.locator('#inspect').waitFor({ state: 'visible' });
  await offline.waitForFunction(() => { const image = document.querySelector('#art-image'); return image.complete && image.naturalWidth > 100; });
  await offline.locator('#go-to-art').click();
  await offline.locator('#inspect-prompt').waitFor({ state: 'visible' });
  assert.deepEqual(offlineErrors, [], 'standalone file has no uncaught errors');
  assert.deepEqual(offlineConsoleErrors, [], 'standalone file has no shader, WebGL or console errors');
  assert.deepEqual(network, [], 'standalone file requests no external code, styles or images');
  await offline.screenshot({ path: `${results}/standalone.png` });
  log(`standalone atlas-museum.html runs via ${standaloneTransport}, enters with Enter and changes room without external dependencies`);
  console.log(`Screenshots saved in ${results}`);
} catch (error) {
  await page.screenshot({ path: `${results}/failure.png` }).catch(() => {});
  console.error('Browser errors:', errors);
  console.error('Console errors:', consoleErrors);
  console.error('Failed requests:', failedRequests);
  throw error;
} finally {
  await browser.close();
}
