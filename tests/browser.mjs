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
await context.addInitScript(() => Object.defineProperty(Element.prototype, 'requestPointerLock', { value: undefined, configurable: true }));
const page = await context.newPage();
page.setDefaultTimeout(60_000);
const errors = [];
const failedRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('requestfailed', request => failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`));
page.on('response', response => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`); });
const log = message => console.log(`✓ ${message}`);
const modeIs = mode => page.waitForFunction(value => window.__museumTest?.state.mode === value, mode);

try {
  await page.goto(`${baseURL}/?test=1`, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.waitForFunction(() => Boolean(window.__museumTest), null, { timeout: 120_000 });
  assert.equal(await page.locator('#unsupported').isVisible(), false);
  assert.equal(await page.locator('#welcome').isVisible(), true);
  assert.equal(await page.locator('select').count(), 0, 'there are no graphics or FPS selectors');
  assert.equal(await page.locator('input[type=range]').count(), 1, 'only mouse sensitivity is adjustable');
  const rendered = await page.evaluate(async () => {
    const { museum, renderer, render } = window.__museumTest;
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
    return { rooms: museum.rooms.map(r => r.id), textures, calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles, colors: colors.size, lit,
      shadows: renderer.shadowMap.enabled, antialias: gl.getContextAttributes().antialias };
  });
  assert.deepEqual(rendered.rooms, ['library', 'west', 'east', 'north']);
  assert.equal(rendered.textures.length, 6);
  assert.ok(rendered.textures.every(t => t.loaded), JSON.stringify(rendered.textures));
  assert.ok(rendered.calls > 20 && rendered.triangles > 1000, 'actual geometry is rendered');
  assert.ok(rendered.colors > 50 && rendered.lit > 50, 'the WebGL frame contains a detailed lit scene');
  assert.equal(rendered.shadows, true);
  assert.equal(rendered.antialias, true);
  await page.screenshot({ path: `${results}/landing.png` });
  log(`WebGL: ${rendered.calls} draw calls, ${rendered.triangles} triangles; 4 rooms and all 6 real artwork textures loaded`);

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
  const downloadEvent = page.waitForEvent('download');
  await page.keyboard.press('p');
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), 'atlas-museum.png');
  assert.equal(await download.failure(), null);
  await download.saveAs(`${results}/download.png`);
  log('sensitivity, pause without continuous rendering, resume, and P screenshot download work');

  assert.deepEqual(errors, [], 'the live app has no uncaught browser errors');
  assert.deepEqual(failedRequests, [], 'the live app loads all resources successfully');

  const offline = await context.newPage();
  offline.setDefaultTimeout(90_000);
  const offlineErrors = [], network = [];
  const standaloneURL = `${baseURL}/atlas-museum.html`;
  offline.on('pageerror', error => offlineErrors.push(error.message));
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
  await offline.waitForFunction(() => document.querySelector('#room-name').textContent === 'Западная галерея');
  assert.deepEqual(offlineErrors, [], 'standalone file has no uncaught errors');
  assert.deepEqual(network, [], 'standalone file requests no external code, styles or images');
  await offline.screenshot({ path: `${results}/standalone.png` });
  log(`standalone atlas-museum.html runs via ${standaloneTransport}, enters with Enter and changes room without external dependencies`);
  console.log(`Screenshots saved in ${results}`);
} catch (error) {
  await page.screenshot({ path: `${results}/failure.png` }).catch(() => {});
  console.error('Browser errors:', errors);
  console.error('Failed requests:', failedRequests);
  throw error;
} finally {
  await browser.close();
}
