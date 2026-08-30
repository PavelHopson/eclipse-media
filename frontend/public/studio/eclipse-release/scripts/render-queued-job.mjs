import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sceneIds = ['signal', 'inputs', 'pipeline', 'quality', 'close'];
const sceneFiles = sceneIds.map((id) => `scene-${id}`);
const formats = {
  landscape: { ratio: '16:9', width: 1920, height: 1080 },
  vertical: { ratio: '9:16', width: 1080, height: 1920 },
  square: { ratio: '1:1', width: 1080, height: 1080 },
};

function fail(message) {
  console.error(message);
  process.exit(2);
}

function inside(path, root) {
  return path === root || path.startsWith(`${root}${sep}`);
}

function cleanText(value, maximum) {
  assert.equal(typeof value, 'string');
  const normalized = value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  assert.ok(normalized.length > 0 && normalized.length <= maximum);
  assert.doesNotMatch(value, /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u);
  assert.doesNotMatch(value, /(?:https?:\/\/|www\.)/i);
  return normalized;
}

function exactObject(value, keys) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort());
  return value;
}

function validateVariables(value, format) {
  const root = exactObject(value, [
    'schemaVersion', 'sourceBriefSchemaVersion', 'templateId', 'title', 'format',
    'duration', 'renderRequiresApproval', 'publishRequiresApproval', 'execution', 'scenes',
  ]);
  assert.equal(root.schemaVersion, 'eclipse.release-variables.v1');
  assert.equal(root.sourceBriefSchemaVersion, 'eclipse.release-brief.v1');
  assert.equal(root.templateId, 'eclipse-release-signal');
  assert.equal(root.format, format.ratio);
  assert.equal(root.duration, 15);
  assert.equal(root.renderRequiresApproval, true);
  assert.equal(root.publishRequiresApproval, true);
  cleanText(root.title, 80);
  const execution = exactObject(root.execution, ['network', 'shell', 'render', 'publish']);
  assert.deepEqual(execution, { network: false, shell: false, render: false, publish: false });
  assert.ok(Array.isArray(root.scenes) && root.scenes.length === 5);
  root.scenes.forEach((sceneValue, index) => {
    const scene = exactObject(sceneValue, ['id', 'start', 'duration', 'eyebrow', 'headline', 'body']);
    assert.equal(scene.id, sceneIds[index]);
    assert.equal(scene.start, index * 3);
    assert.equal(scene.duration, 3);
    cleanText(scene.eyebrow, 48);
    cleanText(scene.headline, 96);
    cleanText(scene.body, 220);
  });
  return root;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function replaceMarker(source, name, value) {
  const start = `<!--release:${name}:start-->`;
  const end = `<!--release:${name}:end-->`;
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `Missing ${name} marker.`);
  assert.equal(source.indexOf(start, startIndex + start.length), -1, `Duplicate ${name} marker.`);
  return `${source.slice(0, startIndex + start.length)}${escapeHtml(value)}${source.slice(endIndex)}`;
}

function resized(source, width, height) {
  return source
    .replaceAll('data-width="1920"', `data-width="${width}"`)
    .replaceAll('data-height="1080"', `data-height="${height}"`);
}

const [jobId, formatSlug, ...extra] = process.argv.slice(2);
if (!/^[0-9a-f]{32}$/.test(jobId ?? '') || !Object.hasOwn(formats, formatSlug) || extra.length) {
  fail('Invalid fixed render queue arguments.');
}

try {
  const format = formats[formatSlug];
  const jobsRoot = resolve(workspace, 'queue', 'jobs');
  const jobDir = resolve(jobsRoot, jobId);
  const realWorkspace = await realpath(workspace);
  const realJobDir = await realpath(jobDir);
  if (!inside(realJobDir, realWorkspace) || !inside(realJobDir, await realpath(jobsRoot))) {
    fail('Unsafe render job directory.');
  }
  const variablesFile = resolve(realJobDir, 'variables.json');
  const variablesStat = await stat(variablesFile);
  if (!variablesStat.isFile() || variablesStat.size > 32 * 1024) {
    fail('Invalid render variables file.');
  }

  const raw = await readFile(variablesFile, 'utf8');
  const variables = validateVariables(JSON.parse(raw), format);
  const compositionDir = resolve(realJobDir, 'composition');
  const sceneDir = resolve(compositionDir, 'compositions');
  const vendorDir = resolve(compositionDir, 'vendor');
  await mkdir(sceneDir, { recursive: true });
  await mkdir(vendorDir, { recursive: true });
  await copyFile(resolve(workspace, 'vendor', 'inter-cyrillic.woff2'), resolve(vendorDir, 'inter-cyrillic.woff2'));

  const [hostSource, ...sceneSources] = await Promise.all([
    readFile(resolve(workspace, 'index.html'), 'utf8'),
    ...sceneFiles.map((name) => readFile(resolve(workspace, 'compositions', `${name}.html`), 'utf8')),
  ]);
  assert.doesNotMatch(hostSource, /https?:\/\//i);

  const compositionId = `eclipse-release-job-${jobId}`;
  let host = resized(hostSource, format.width, format.height)
    .replace('data-composition-id="eclipse-release-signal"', `data-composition-id="${compositionId}"`)
    .replace('1920 × 1080 / LOCAL', `${format.width} × ${format.height} / LOCAL`)
    .replace("window.__timelines['eclipse-release-signal']", `window.__timelines['${compositionId}']`);

  for (const [index, sceneName] of sceneFiles.entries()) {
    const scene = variables.scenes[index];
    let source = resized(sceneSources[index], format.width, format.height);
    source = replaceMarker(source, 'eyebrow', scene.eyebrow);
    source = replaceMarker(source, 'headline', scene.headline);
    source = replaceMarker(source, 'body', scene.body);
    assert.doesNotMatch(source, /https?:\/\//i);
    await writeFile(resolve(sceneDir, `${sceneName}.html`), source, 'utf8');
    const relativeScene = relative(workspace, resolve(sceneDir, `${sceneName}.html`)).replaceAll('\\', '/');
    host = host.replace(
      `data-composition-src="compositions/${sceneName}.html"`,
      `data-composition-src="${relativeScene}"`,
    );
  }

  const hostPath = resolve(compositionDir, 'index.html');
  const outputPath = resolve(realJobDir, 'output.mp4');
  await writeFile(hostPath, host, 'utf8');
  const runner = resolve(workspace, 'scripts', 'run-hyperframes.mjs');
  const child = spawn(process.execPath, [
    runner,
    'render',
    '-c', relative(workspace, hostPath).replaceAll('\\', '/'),
    '--output', relative(workspace, outputPath).replaceAll('\\', '/'),
  ], {
    cwd: workspace,
    env: process.env,
    stdio: 'inherit',
    shell: false,
  });
  child.once('error', () => { process.exitCode = 3; });
  child.once('exit', (code, signal) => { process.exitCode = signal ? 4 : (code ?? 1); });
} catch {
  fail('Render queue input or workspace validation failed.');
}
