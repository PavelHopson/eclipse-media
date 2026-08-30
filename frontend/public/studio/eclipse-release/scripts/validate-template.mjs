import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const expectedScenes = [
  { id: 'scene-signal', start: '0' },
  { id: 'scene-inputs', start: '3' },
  { id: 'scene-pipeline', start: '6' },
  { id: 'scene-quality', start: '9' },
  { id: 'scene-close', start: '12' },
];
const [composition, preview, manifestText, gsapBytes, interBytes, variantBuilder, ...sceneSources] = await Promise.all([
  readFile(new URL('index.html', root), 'utf8'),
  readFile(new URL('preview.html', root), 'utf8'),
  readFile(new URL('package.json', root), 'utf8'),
  readFile(new URL('vendor/gsap-3.14.2.min.js', root)),
  readFile(new URL('vendor/inter-cyrillic.woff2', root)),
  readFile(new URL('scripts/create-format-variants.mjs', root), 'utf8'),
  ...expectedScenes.map(({ id }) => readFile(new URL(`compositions/${id}.html`, root), 'utf8')),
]);
const manifest = JSON.parse(manifestText);

const expectedSri = 'sha384-sG0Hv1tP1lZCk9KQmrIbY/XNwi+OY84GQqhMscbnsoBFqAz8KNCil1kvfL3Hbbk2';
const expectedGsapSha256 = 'c174bfce53a729418d57a8ad8625e7247c793a22fef8e2851e3cfa3de9cd8280';
const expectedInterSha256 = '71d5ee93cc1e9f1d520a3a8b66456de18c7879d8df09d57fcd2eaff75fef0075';

assert.match(composition, /data-composition-id="eclipse-release-signal"/);
assert.match(composition, /data-duration="15"/);
assert.match(composition, /data-width="1920"/);
assert.match(composition, /data-height="1080"/);
assert.doesNotMatch(composition, /<section|class="scene clip"/);

for (const [{ id, start }, scene] of expectedScenes.map((entry, index) => [entry, sceneSources[index]])) {
  const hostTag = composition.match(new RegExp(`<div[^>]+id="${id}-slot"[^>]*>`, 's'))?.[0];
  assert.ok(hostTag, `${id} host slot must exist.`);
  assert.match(hostTag, new RegExp(`data-composition-id="${id}"`));
  assert.match(hostTag, new RegExp(`data-composition-src="compositions/${id}\\.html"`));
  assert.match(hostTag, new RegExp(`data-start="${start}"`));
  assert.match(hostTag, /data-duration="3"/);
  assert.match(hostTag, /data-track-index="0"/);
  assert.match(hostTag, /data-width="1920"/);
  assert.match(hostTag, /data-height="1080"/);

  const templateStart = scene.indexOf('<template>');
  const templateEnd = scene.indexOf('</template>');
  const styleIndex = scene.indexOf('<style>');
  const rootIndex = scene.indexOf('<div id="root"');
  const scriptIndex = scene.indexOf('<script>');
  assert.equal(templateStart >= 0 && templateEnd > templateStart, true, `${id} must use a template transport.`);
  assert.equal(styleIndex > templateStart && styleIndex < templateEnd, true, `${id} styles must live inside template.`);
  assert.equal(rootIndex > templateStart && rootIndex < templateEnd, true, `${id} markup must live inside template.`);
  assert.equal(scriptIndex > templateStart && scriptIndex < templateEnd, true, `${id} timeline must live inside template.`);

  const rootTag = scene.match(/<div id="root"[^>]*>/)?.[0];
  assert.ok(rootTag, `${id} internal root must exist.`);
  assert.doesNotMatch(rootTag, /class=/, `${id} root must be styled by #root, not by a class.`);
  assert.match(rootTag, new RegExp(`data-composition-id="${id}"`));
  assert.match(rootTag, /data-width="1920"/);
  assert.match(rootTag, /data-height="1080"/);
  assert.match(rootTag, /data-duration="3"/);
  assert.match(scene, /#root\s*\{/);
  assert.match(scene, new RegExp(`window\\.__timelines\\['${id}'\\]\\s*=\\s*tl`));
  assert.doesNotMatch(scene, /<script[^>]+src=/i, `${id} must use the host's verified GSAP runtime.`);
  assert.doesNotMatch(scene, /https?:\/\//i);
  assert.doesNotMatch(scene, /Roboto|fonts\.google/i);
  assert.match(scene, /url\('vendor\/inter-cyrillic\.woff2'\)/);
  assert.doesNotMatch(scene, /Math\.random|Date\.now|repeat\s*:\s*-1/);
  assert.doesNotMatch(scene, /\btl\.from\s*\(/, `${id} entrances must declare both endpoints with fromTo.`);
  for (const marker of ['eyebrow', 'headline', 'body']) {
    assert.equal((scene.match(new RegExp(`<!--release:${marker}:start-->`, 'g')) ?? []).length, 1);
    assert.equal((scene.match(new RegExp(`<!--release:${marker}:end-->`, 'g')) ?? []).length, 1);
  }
}

assert.equal((composition.match(/class="scene-slot"/g) ?? []).length, expectedScenes.length);
assert.match(composition, /src="vendor\/gsap-3\.14\.2\.min\.js"/);
assert.match(composition, new RegExp(`integrity="${expectedSri.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
assert.match(composition, /crossorigin="anonymous"/);
assert.equal(createHash('sha256').update(gsapBytes).digest('hex'), expectedGsapSha256);
assert.equal(createHash('sha256').update(interBytes).digest('hex'), expectedInterSha256);
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
assert.match(variantBuilder, /generatedSceneName/);
assert.match(variantBuilder, /outputCompositions/);
assert.match(variantBuilder, /outputVendor/);
assert.match(variantBuilder, /copyFile/);
assert.match(variantBuilder, /data-composition-src="generated\/compositions\//);
assert.doesNotMatch(scripts, /(?:lint|check|validate|preview|render) index\.html/);
assert.equal(manifest.scripts?.['render:queue-contract'], 'node scripts/validate-render-queue.mjs');
assert.equal(manifest.hyperframes?.package, 'hyperframes');
assert.equal(manifest.hyperframes?.version, '0.7.88');
assert.match(manifest.hyperframes?.sourceCommit ?? '', /^[a-f0-9]{40}$/);

console.log('Release template contract passed: 5 isolated sub-compositions, 15 seconds, vendored GSAP hash/SRI, fail-closed local CLI runner.');
