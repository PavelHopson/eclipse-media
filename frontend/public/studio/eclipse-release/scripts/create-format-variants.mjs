import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const output = new URL('generated/', root);
const outputCompositions = new URL('compositions/', output);
const outputVendor = new URL('vendor/', output);
const sceneIds = ['scene-signal', 'scene-inputs', 'scene-pipeline', 'scene-quality', 'scene-close'];
const [source, manifestText, ...sceneSources] = await Promise.all([
  readFile(new URL('index.html', root), 'utf8'),
  readFile(new URL('package.json', root), 'utf8'),
  ...sceneIds.map((id) => readFile(new URL(`compositions/${id}.html`, root), 'utf8')),
]);
const manifest = JSON.parse(manifestText);

assert.match(source, /data-composition-id="eclipse-release-signal"/);
assert.match(source, /data-width="1920"/);
assert.match(source, /data-height="1080"/);
await mkdir(outputCompositions, { recursive: true });
await mkdir(outputVendor, { recursive: true });
await copyFile(new URL('vendor/inter-cyrillic.woff2', root), new URL('inter-cyrillic.woff2', outputVendor));

const resizeComposition = (html, width, height) => html
  .replaceAll('data-width="1920"', `data-width="${width}"`)
  .replaceAll('data-height="1080"', `data-height="${height}"`);

for (const [id, format] of Object.entries(manifest.formats ?? {})) {
  assert.match(id, /^[a-z]+$/);
  assert.equal(Number.isInteger(format.width) && format.width >= 720 && format.width <= 3840, true);
  assert.equal(Number.isInteger(format.height) && format.height >= 720 && format.height <= 3840, true);

  let html = resizeComposition(source, format.width, format.height)
    .replace('data-composition-id="eclipse-release-signal"', `data-composition-id="eclipse-release-${id}"`)
    .replace('1920 × 1080 / LOCAL', `${format.width} × ${format.height} / LOCAL`)
    .replace("window.__timelines['eclipse-release-signal']", `window.__timelines['eclipse-release-${id}']`);

  for (const [sceneIndex, sceneId] of sceneIds.entries()) {
    const generatedSceneName = `${sceneId}-${id}.html`;
    html = html.replace(
      `data-composition-src="compositions/${sceneId}.html"`,
      `data-composition-src="generated/compositions/${generatedSceneName}"`,
    );
    await writeFile(
      new URL(generatedSceneName, outputCompositions),
      resizeComposition(sceneSources[sceneIndex], format.width, format.height),
      'utf8',
    );
  }

  await writeFile(new URL(`eclipse-release-${id}.html`, output), html, 'utf8');
}

console.log('Built deterministic 16:9, 9:16 and 1:1 host + sub-composition variants.');
