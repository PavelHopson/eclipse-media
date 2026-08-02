import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const [composition, preview, manifestText, gsapBytes, variantBuilder] = await Promise.all([
  readFile(new URL('index.html', root), 'utf8'),
  readFile(new URL('preview.html', root), 'utf8'),
  readFile(new URL('package.json', root), 'utf8'),
  readFile(new URL('vendor/gsap-3.14.2.min.js', root)),
  readFile(new URL('scripts/create-format-variants.mjs', root), 'utf8'),
]);
const manifest = JSON.parse(manifestText);

const expectedSri = 'sha384-sG0Hv1tP1lZCk9KQmrIbY/XNwi+OY84GQqhMscbnsoBFqAz8KNCil1kvfL3Hbbk2';
const expectedGsapSha256 = 'c174bfce53a729418d57a8ad8625e7247c793a22fef8e2851e3cfa3de9cd8280';
const expectedScenes = [
  ['scene-signal', '0'],
  ['scene-inputs', '3'],
  ['scene-pipeline', '6'],
  ['scene-quality', '9'],
  ['scene-close', '12'],
];

assert.match(composition, /data-composition-id="eclipse-release-signal"/);
assert.match(composition, /data-duration="15"/);
assert.match(composition, /data-width="1920"/);
assert.match(composition, /data-height="1080"/);

for (const [id, start] of expectedScenes) {
  const pattern = new RegExp(`<section[^>]+id="${id}"[^>]+data-start="${start}"[^>]+data-duration="3"`);
  assert.match(composition, pattern, `${id} must occupy its fixed three-second window.`);
}

assert.equal((composition.match(/class="scene clip"/g) ?? []).length, expectedScenes.length);
assert.match(composition, /src="vendor\/gsap-3\.14\.2\.min\.js"/);
assert.match(composition, new RegExp(`integrity="${expectedSri.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
assert.match(composition, /crossorigin="anonymous"/);
assert.equal(createHash('sha256').update(gsapBytes).digest('hex'), expectedGsapSha256);
assert.equal(`sha384-${createHash('sha384').update(gsapBytes).digest('base64')}`, expectedSri);
assert.doesNotMatch(composition, /@hyperframes\/core|hyperframe\.runtime/i);
assert.doesNotMatch(composition, /Math\.random|Date\.now|repeat\s*:\s*-1/);
assert.match(composition, /window\.__timelines\['eclipse-release-signal'\]\s*=\s*tl/);

assert.match(preview, /src="index\.html"/);
assert.match(preview, /sandbox="allow-scripts allow-same-origin"/);
assert.doesNotMatch(preview, /searchParams|location\.search/);

const scripts = Object.values(manifest.scripts ?? {}).join('\n');
assert.doesNotMatch(scripts, /\bnpx\b|--yes/);
assert.equal(manifest.scripts?.['hyperframes:check'], 'node scripts/run-hyperframes.mjs check .');
assert.equal(manifest.scripts?.render, 'npm run render:landscape');
assert.deepEqual(Object.keys(manifest.formats ?? {}), ['landscape', 'vertical', 'square']);
assert.equal(manifest.formats.vertical.ratio, '9:16');
assert.equal(manifest.formats.square.ratio, '1:1');
assert.doesNotMatch(variantBuilder, /exec|spawn|fetch|https?:\/\//);
assert.doesNotMatch(scripts, /(?:lint|check|validate|preview|render) index\.html/);
assert.equal(manifest.hyperframes?.package, 'hyperframes');
assert.equal(manifest.hyperframes?.version, '0.7.88');
assert.match(manifest.hyperframes?.sourceCommit ?? '', /^[a-f0-9]{40}$/);

console.log('Release template contract passed: 5 scenes, 15 seconds, vendored GSAP hash/SRI, fail-closed local CLI runner.');
