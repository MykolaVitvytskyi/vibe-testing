import { build } from 'esbuild';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { artworks } from '../src/collection.js';

const inlineImages = {};
const inlineMaterials = {};
for (const filename of await readdir(new URL('../assets/materials/', import.meta.url)).catch(() => [])) {
  if (!/\.(png|jpe?g|webp)$/i.test(filename)) continue;
  const path = 'assets/materials/' + filename;
  const bytes = await readFile(new URL('../' + path, import.meta.url));
  const ext = filename.split('.').at(-1).toLowerCase();
  inlineMaterials[path] = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${bytes.toString('base64')}`;
}
for (const art of artworks) {
  const bytes = await readFile(new URL('../' + art.image, import.meta.url));
  const mime = /\.png$/i.test(art.image) ? 'image/png' : 'image/jpeg';
  inlineImages[art.id] = `data:${mime};base64,${bytes.toString('base64')}`;
}
const result = await build({
  entryPoints: [new URL('../src/app.js', import.meta.url).pathname],
  bundle: true, minify: true, format: 'iife', target: ['chrome100', 'firefox100', 'safari15'],
  write: false, legalComments: 'inline', alias: { three: new URL('../vendor/three.module.js', import.meta.url).pathname },
  define: { __ART_IMAGES__: JSON.stringify(inlineImages), __MATERIAL_IMAGES__: JSON.stringify(inlineMaterials) }
});
let html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const license = await readFile(new URL('../node_modules/three/LICENSE', import.meta.url), 'utf8');
const materialCredits = await readFile(new URL('../docs/MATERIALS.md', import.meta.url), 'utf8').catch(() => '');
html = html.replace('<link rel="stylesheet" href="styles.css">', `<style>${css}</style>`);
html = html.replace('<script type="module" src="src/app.js"></script>', () => `<script>${result.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>`);
html = html.replace('</head>', `<!--\nthree.js 0.169.0\n${license}\n${materialCredits.replaceAll('--', '—')}\n-->\n</head>`);
await writeFile(new URL('../atlas-museum.html', import.meta.url), html);
console.log(`atlas-museum.html: ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} МБ. Все изображения и код встроены; сеть не нужна.`);
