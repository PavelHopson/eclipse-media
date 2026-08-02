import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('index.html', root), 'utf8');
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const output = new URL('generated/', root);

assert.match(source, /data-composition-id="eclipse-release-signal"/);
assert.match(source, /data-width="1920" data-height="1080"/);
await mkdir(output, { recursive: true });

for (const [id, format] of Object.entries(manifest.formats ?? {})) {
  assert.match(id, /^[a-z]+$/);
  assert.equal(Number.isInteger(format.width) && format.width >= 720 && format.width <= 3840, true);
  assert.equal(Number.isInteger(format.height) && format.height >= 720 && format.height <= 3840, true);
  const html = source
    .replace('data-composition-id="eclipse-release-signal"', `data-composition-id="eclipse-release-${id}"`)
    .replace('data-width="1920" data-height="1080"', `data-width="${format.width}" data-height="${format.height}"`)
    .replace('1920 × 1080 / LOCAL', `${format.width} × ${format.height} / LOCAL`)
    .replace("window.__timelines['eclipse-release-signal']", `window.__timelines['eclipse-release-${id}']`);
  await writeFile(new URL(`eclipse-release-${id}.html`, output), html, 'utf8');
}

console.log('Built deterministic 16:9, 9:16 and 1:1 composition variants.');
