import { mkdir, copyFile, cp, readFile, writeFile } from 'node:fs/promises';
await mkdir(new URL('../vendor/', import.meta.url), { recursive: true });
for (const [from, to] of [['build/three.module.js', 'three.module.js'], ['LICENSE', 'THREE-LICENSE.txt']]) {
  await copyFile(new URL('../node_modules/three/' + from, import.meta.url), new URL('../vendor/' + to, import.meta.url));
}
await cp(new URL('../node_modules/three/examples/jsm/', import.meta.url), new URL('../vendor/addons/', import.meta.url), { recursive: true });
const rounded = await readFile(new URL('../node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js', import.meta.url), 'utf8');
await writeFile(new URL('../vendor/RoundedBoxGeometry.js', import.meta.url), rounded.replaceAll("from 'three'", "from './three.module.js'"));
