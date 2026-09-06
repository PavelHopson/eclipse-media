import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { URL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers';

const modules = new Map();
function load(file) {
  if (modules.has(file)) return modules.get(file);
  const code = ts.transpileModule(readFileSync(new URL('../src/services/' + file + '.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  modules.set(file, module.exports);
  Function('module', 'exports', 'require', code)(module, module.exports, (name) => {
    assert.match(name, /^\.\/[a-zA-Z]+$/); return load(name.slice(2));
  });
  return module.exports;
}
const contract = load('draftContract');
const { DraftController } = load('draftController');
const { DraftConflict } = load('draftStorage');
const { createSyntheticBeatMap, analyzeEnvelope } = load('beatMapContract');
const { defaultDirection } = load('sceneDirectionContract');
const { parseTranscript } = load('researchContract');
const example = () => ({ ...contract.emptyResearchDraft(), loaded: {
  transcript: parseTranscript('WEBVTT\n\n00:00.000 --> 00:04.000\n<img src=x onerror=alert(1)>'),
  sha256: 'a'.repeat(64), fileName: 'test.vtt',
}, notes: [{ cueId: 'cue-1', claim: '', status: 'confirmed', evidenceUrl: 'https://' }], videoUrl: 'unfinished' });
const encode = (data, kind = 'research') => JSON.stringify({ schema: contract.DRAFT_SCHEMA, kind, revision: randomUUID(), updatedAt: Date.now(), enabled: true, data });
function memory() {
  const rows = new Map();
  return { rows, fail: false, writes: 0, async read(key) { if (this.fail) throw new Error('offline'); return rows.get(key) ?? null; },
    async compareAndWrite(key, expected, next) {
      if (this.fail) throw new Error('quota');
      if ((rows.get(key) ?? null) !== expected) throw new DraftConflict();
      rows.set(key, next); this.writes++;
    } };
}
const researchStore = (repo) => new DraftController('research', contract.emptyResearchDraft, contract.validateResearchDraft, repo);
async function settled(store) {
  for (let i = 0; i < 600; i++) {
    if (store.getSnapshot().phase !== 'saving') return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('Store did not settle');
}

test('drafts preserve incomplete fields and literal untrusted text without relaxing export rules', () => {
  const data = example();
  assert.doesNotThrow(() => contract.validateResearchDraft(data));
  assert.deepEqual(contract.decodeDraft(encode(data), 'research', contract.validateResearchDraft).data, data);
  assert.throws(() => load('researchContract').buildResearchExport(data.loaded.transcript, data.notes, { ...data.loaded, videoUrl: '' }));
});

test('draft parser rejects corruption, unknown schemas/keys, dangerous object keys and size overflow', () => {
  const raw = encode(example());
  for (const invalid of ['{bad', raw.replace('eclipse.local-draft.v1', 'future.v9'), raw.replace('"research"', '"beats"'),
    raw.replace('"data":{', '"data":{"__proto__":{},'), raw.replace('"data":{', '"data":{"password":"secret",'),
    ' '.repeat(contract.MAX_DRAFT_BYTES + 1)]) {
    assert.throws(() => contract.decodeDraft(invalid, 'research', contract.validateResearchDraft));
  }
  for (const edit of [
    (d) => { d.loaded.sha256 = 'invalid'; }, (d) => { d.page = 99; },
    (d) => { d.notes[0].cueId = 'missing'; }, (d) => { d.notes.push(d.notes[0]); },
    (d) => { d.loaded.transcript.cues[0].start = NaN; },
    (d) => { d.loaded.transcript.cues[0].end = 0; },
    (d) => { d.notes[0].claim = 'x'.repeat(301); },
    (d) => { d.notes[0].claim = '\u0000'; },
  ]) { const data = example(); edit(data); assert.throws(() => contract.validateResearchDraft(data)); }
});

test('beat draft validates generated projects and partial direction while rejecting foreign scene IDs and unsafe values', () => {
  const data = { project: createSyntheticBeatMap(), direction: contract.emptyDirectionDraft() };
  data.direction.edits['scene-1'] = { ...defaultDirection(), action: '' };
  data.direction.performer = { kind: 'consented', consentReference: '' };
  assert.doesNotThrow(() => contract.validateBeatDraft(data));
  assert.deepEqual(contract.decodeDraft(encode(data, 'beats'), 'beats', contract.validateBeatDraft).data, data);
  for (const duration of [1, 8, 44.999, 45, 300, 720]) {
    const envelope = Array.from({ length: 100 }, (_, i) => ({ time: i * duration / 100, energy: i % 3 ? .1 : .8 }));
    assert.doesNotThrow(() => contract.validateBeatDraft({ project: analyzeEnvelope(envelope, duration, { fileName: 'own.wav', bytes: 1024 }), direction: contract.emptyDirectionDraft() }));
  }
  for (const edit of [
    (d) => { d.project.source.localOnly = false; }, (d) => { d.project.source.duration = Infinity; },
    (d) => { d.direction.activeId = 'scene-99'; }, (d) => { d.direction.edits['__proto__'] = { pollution: true }; Object.defineProperty(d.direction.edits, '__proto__', { value: {}, enumerable: true }); },
    (d) => { d.direction.edits['scene-1'].camera = 'x'.repeat(401); },
    (d) => { d.project.scenes[0].shot = 'unknown'; }, (d) => { d.project.scenes[0].start = -1; },
  ]) { const changed = globalThis.structuredClone(data); edit(changed); assert.throws(() => contract.validateBeatDraft(changed)); }
});

test('controller saves and restores each workspace independently, including partial notes', async () => {
  const repo = memory(); const store = researchStore(repo); await store.init();
  assert.equal(store.getSnapshot().phase, 'empty');
  store.update(() => example()); await settled(store);
  assert.equal(store.getSnapshot().phase, 'saved');
  assert.equal(store.hasUnsaved(), false);
  const restored = researchStore(repo); await restored.init();
  assert.deepEqual(restored.getSnapshot().data, example());
  repo.rows.set('beats', 'other workspace'); store.clear(); await settled(store);
  assert.equal(repo.rows.get('beats'), 'other workspace');
  assert.deepEqual(JSON.parse(repo.rows.get('research')).data, contract.emptyResearchDraft());
});

test('stale tabs cannot overwrite edits or resurrect a deleted draft; overwrite is explicit', async () => {
  const repo = memory(); const first = researchStore(repo); const second = researchStore(repo);
  await Promise.all([first.init(), second.init()]);
  first.update(() => example()); await settled(first);
  second.update((d) => ({ ...d, videoUrl: 'my pending edit' })); await settled(second);
  assert.equal(second.getSnapshot().phase, 'conflict');
  assert.equal(JSON.parse(repo.rows.get('research')).data.videoUrl, 'unfinished');
  await second.overwrite(); assert.equal(second.getSnapshot().phase, 'saved');
  await first.reload(); first.clear(); await settled(first);
  second.update((d) => ({ ...d, videoUrl: 'cannot resurrect' })); await settled(second);
  assert.equal(second.getSnapshot().phase, 'conflict');
  assert.deepEqual(JSON.parse(repo.rows.get('research')).data, contract.emptyResearchDraft());
  await second.reload(); assert.deepEqual(second.getSnapshot().data, contract.emptyResearchDraft());
});

test('quota failure is not success and retry preserves all current edits', async () => {
  const repo = memory(); const store = researchStore(repo); await store.init(); repo.fail = true;
  store.update(() => example()); await settled(store);
  assert.equal(store.getSnapshot().phase, 'error'); assert.equal(store.hasUnsaved(), true);
  store.update((d) => ({ ...d, videoUrl: 'edited after error' }));
  repo.fail = false; await store.retry();
  assert.equal(store.getSnapshot().phase, 'saved');
  assert.equal(JSON.parse(repo.rows.get('research')).data.videoUrl, 'edited after error');
});

test('off removes persisted personal data, keeps form in memory, and persists across reload', async () => {
  const repo = memory(); const store = researchStore(repo); await store.init();
  store.update(() => example()); await settled(store); store.setEnabled(false); await settled(store);
  assert.equal(store.getSnapshot().phase, 'off'); assert.deepEqual(store.getSnapshot().data, example());
  const raw = JSON.parse(repo.rows.get('research')); assert.equal(raw.enabled, false); assert.deepEqual(raw.data, contract.emptyResearchDraft());
  const count = repo.writes; store.update((d) => ({ ...d, videoUrl: 'memory only' })); assert.equal(repo.writes, count);
  const restored = researchStore(repo); await restored.init();
  assert.equal(restored.getSnapshot().phase, 'off'); assert.deepEqual(restored.getSnapshot().data, contract.emptyResearchDraft());
});

test('corrupt draft is retained until explicit clear and cannot be automatically replaced', async () => {
  const repo = memory(); repo.rows.set('research', '{broken');
  const store = researchStore(repo); await store.init();
  assert.equal(store.getSnapshot().phase, 'invalid'); store.update(() => example());
  assert.equal(repo.rows.get('research'), '{broken');
  store.clear(); await settled(store); assert.equal(store.getSnapshot().phase, 'empty');
});

test('storage unavailable at startup still offers memory-only editing without overwriting an unread draft', async () => {
  const repo = memory(); repo.fail = true;
  const store = researchStore(repo); await store.init(); assert.equal(store.getSnapshot().phase, 'error');
  store.continueInMemory(); store.update(() => example()); assert.equal(store.getSnapshot().phase, 'off');
  repo.fail = false; store.setEnabled(true); assert.equal(store.getSnapshot().phase, 'conflict');
  assert.equal(repo.writes, 0);
  await store.overwrite(); assert.equal(store.getSnapshot().phase, 'saved');
});

test('writes coalesce while pending and remain queued without any mounted subscribers', async () => {
  const repo = memory(); const write = repo.compareAndWrite;
  let release; const gate = new Promise((resolve) => { release = resolve; });
  let first = true;
  repo.compareAndWrite = async function (...args) { if (first) { first = false; await gate; } return write.apply(this, args); };
  const store = researchStore(repo); await store.init();
  const unsubscribe = store.subscribe(() => {});
  store.update(() => example()); unsubscribe();
  await new Promise((resolve) => setTimeout(resolve, 300));
  for (let i = 0; i < 30; i++) store.update((d) => ({ ...d, videoUrl: 'latest ' + i }));
  assert.equal(store.hasUnsaved(), true);
  release(); await settled(store);
  assert.equal(repo.writes, 2); assert.equal(JSON.parse(repo.rows.get('research')).data.videoUrl, 'latest 29');
});
