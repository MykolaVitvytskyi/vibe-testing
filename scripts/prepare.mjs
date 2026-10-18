import { mkdir, copyFile } from 'node:fs/promises';
await mkdir(new URL('../vendor/', import.meta.url), { recursive: true });
for (const [from, to] of [['build/three.module.js', 'three.module.js'], ['LICENSE', 'THREE-LICENSE.txt']]) {
  await copyFile(new URL('../node_modules/three/' + from, import.meta.url), new URL('../vendor/' + to, import.meta.url));
}
