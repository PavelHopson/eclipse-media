import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, '..');
const contractPath = path.join(frontendRoot, 'src', 'services', 'beatMapContract.ts');
const componentPath = path.join(frontendRoot, 'src', 'components', 'BeatScenePlanner.tsx');
const appPath = path.join(frontendRoot, 'src', 'App.tsx');
const cssPath = path.join(frontendRoot, 'src', 'beat-scene.css');

function loadContract() {
  const source = fs.readFileSync(contractPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const module = { exports: {} };
  Function('module', 'exports', output)(module, module.exports);
  return module.exports;
}

const contract = loadContract();

test('audio gate accepts common audio and rejects unsafe candidates', () => {
  assert.doesNotThrow(() => contract.validateAudioCandidate({
    name: 'track.wav',
    type: 'audio/wav',
    size: 2_000_000,
  }));

  assert.throws(() => contract.validateAudioCandidate({
    name: 'poster.png',
    type: 'image/png',
    size: 100,
  }), /аудиофайл/i);

  assert.throws(() => contract.validateAudioCandidate({
    name: 'huge.mp3',
    type: 'audio/mpeg',
    size: contract.MAX_AUDIO_BYTES + 1,
  }), /60 МБ/i);
});
test('synthetic fixture produces a bounded local beat map', () => {
  const project = contract.createSyntheticBeatMap();

  assert.equal(project.schemaVersion, contract.BEAT_MAP_SCHEMA);
  assert.equal(project.source.localOnly, true);
  assert.ok(project.analysis.bpm >= 116 && project.analysis.bpm <= 124);
  assert.ok(project.beats.length > 40);
  assert.ok(project.beats.length <= 2_400);
  assert.ok(project.scenes.length >= 4 && project.scenes.length <= 12);
  assert.ok(project.scenes.every((scene) => scene.end > scene.start));
});

test('serialized export is deterministic JSON with a trailing newline', () => {
  const serialized = contract.serializeBeatMap(contract.createSyntheticBeatMap());
  const parsed = JSON.parse(serialized);

  assert.equal(parsed.schemaVersion, contract.BEAT_MAP_SCHEMA);
  assert.equal(parsed.source.localOnly, true);
  assert.equal(serialized.endsWith('\n'), true);
});

test('workspace exposes a local-only accessible workflow', () => {
  const component = fs.readFileSync(componentPath, 'utf8');
  const app = fs.readFileSync(appPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.match(app, /\['beats', 'Бит-карта'\]/);
  assert.match(app, /<BeatScenePlanner key=\{projectGeneration\} \/>/);
  assert.match(component, /accept="audio\/\*,/);
  assert.match(component, /У меня есть право обработать этот файл/);
  assert.match(component, /Открыть пример/);
  assert.match(component, /Скачать JSON/);
  assert.doesNotMatch(component, /fetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage/);
  assert.doesNotMatch(component, /[—–]/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /:focus-visible/);
});
