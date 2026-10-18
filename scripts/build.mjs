import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { artworks } from '../src/collection.js';

const inlineImages = {};
for (const art of artworks) {
  const bytes = await readFile(new URL('../' + art.image, import.meta.url));
  const mime = /\.png$/i.test(art.image) ? 'image/png' : 'image/jpeg';
  inlineImages[art.id] = `data:${mime};base64,${bytes.toString('base64')}`;
}
const result = await build({
  entryPoints: [new URL('../src/app.js', import.meta.url).pathname],
  bundle: true, minify: true, format: 'iife', target: ['chrome100', 'firefox100', 'safari15'],
  write: false, legalComments: 'inline', define: { __ART_IMAGES__: JSON.stringify(inlineImages) }
});
let html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const license = await readFile(new URL('../node_modules/three/LICENSE', import.meta.url), 'utf8');
html = html.replace('<link rel="stylesheet" href="styles.css">', `<style>${css}</style>`);
html = html.replace('<script type="module" src="src/app.js"></script>', () => `<script>${result.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>`);
html = html.replace('</head>', `<!--\nthree.js 0.169.0\n${license}\n-->\n</head>`);
await writeFile(new URL('../atlas-museum.html', import.meta.url), html);
console.log(`atlas-museum.html: ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} МБ. Все изображения и код встроены; сеть не нужна.`);
