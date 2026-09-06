import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { URL } from 'node:url';
import { setTimeout } from 'node:timers/promises';

const modules = new Map();
function load(file) {
  if (modules.has(file)) return modules.get(file);
  const code = ts.transpileModule(readFileSync(new URL('../src/services/' + file + '.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} }; modules.set(file, module.exports);
  Function('module', 'exports', 'require', code)(module, module.exports, (name) => {
    assert.match(name, /^\.\/[a-zA-Z]+$/); return load(name.slice(2));
  });
  return module.exports;
}
const drafts = load('draftContract');
const files = load('projectFileContract');
const { restoreProject, projectVersions } = load('projectTransfer');
const { DraftController } = load('draftController');
const { DraftConflict } = load('draftStorage');
const sample = () => {
  const research = drafts.emptyResearchDraft();
  research.loaded = { transcript: load('researchContract').parseTranscript('WEBVTT\n\n00:00.000 --> 00:04.000\n<img src=x onerror=alert(1)>'), sha256: 'a'.repeat(64), fileName: 'test.vtt' };
  research.videoUrl = 'https://';
  research.notes = [{ cueId: 'cue-1', claim: '', evidenceUrl: 'not-yet-valid', status: 'confirmed' }];
  const beats = { project: load('beatMapContract').createSyntheticBeatMap(), direction: drafts.emptyDirectionDraft() };
  beats.direction.activeId = 'scene-1';
  beats.direction.edits['scene-1'] = { ...load('sceneDirectionContract').defaultDirection(), action: '', camera: 'черновик' };
  beats.direction.performer = { kind: 'consented', consentReference: '' };
  return files.parseProjectFile(files.serializeProjectFile(research, beats));
};
function memory() {
  return { rows: new Map(), fail: false, calls: 0, beforeWrite: null,
    async read(key) { return this.rows.get(key) ?? null; },
    async compareAndWrite(key, expected, next) { return this.compareAndWriteBatch([{ key, expected, next }]); },
    async compareAndWriteBatch(writes) {
      if (this.beforeWrite) await this.beforeWrite();
      if (this.fail) throw new Error('quota');
      for (const w of writes) if ((this.rows.get(w.key) ?? null) !== w.expected) throw new DraftConflict();
      for (const w of writes) this.rows.set(w.key, w.next);
      this.calls++;
    } };
}
async function stores(repo = memory()) {
  const research = new DraftController('research', drafts.emptyResearchDraft, drafts.validateResearchDraft, repo);
  const beats = new DraftController('beats', drafts.emptyBeatDraft, drafts.validateBeatDraft, repo);
  await Promise.all([research.init(), beats.init()]);
  return { repo, research, beats, versions: () => projectVersions(research, beats) };
}
async function settle(...controllers) {
  for (let i = 0; i < 1000; i++) {
    if (controllers.every((c) => !c.hasUnsaved())) return;
    await setTimeout(2);
  }
  throw new Error('Not settled');
}

test('portable file round-trips all partial fields, but no local preferences, media or revisions', () => {
  const project = sample();
  const roundTrip = files.parseProjectFile(files.serializeProjectFile(project.research, project.beats));
  assert.deepEqual(roundTrip.research, project.research);
  assert.deepEqual(roundTrip.beats, project.beats);
  assert.deepEqual(Object.keys(project), ['schema', 'exportedAt', 'research', 'beats']);
  assert.equal(files.hasProjectContent(project.research, project.beats), true);
  assert.equal(files.hasProjectContent(drafts.emptyResearchDraft(), drafts.emptyBeatDraft()), false);
  assert.throws(() => load('researchContract').buildResearchExport(project.research.loaded.transcript, project.research.notes, project.research.loaded));
});

test('parser rejects malformed, unsupported, oversized and injected structures without executing content', () => {
  const raw = JSON.stringify(sample());
  for (const input of ['{bad', '', ' '.repeat(files.MAX_PROJECT_BYTES + 1), raw.replace(files.PROJECT_SCHEMA, 'future.v9'),
    raw.replace('"research":{', '"research":{"__proto__":{},'), raw.replace('"beats":{', '"beats":{"token":"not-allowed",'),
    raw.replace('"schema":', '"audio":"data:audio/wav;base64,AA", "schema":'), raw.replace('"scene-1"', '"scene-999"')]) assert.throws(() => files.parseProjectFile(input));
  for (const exportedAt of ['yesterday', '2026-02-30T00:00:00.000Z', 123]) assert.throws(() => files.validateProjectFile({ ...sample(), exportedAt }));
  assert.equal(files.parseProjectFile(raw).research.loaded.transcript.cues[0].text, '<img src=x onerror=alert(1)>');
});

test('file reader checks extension/size before reading and rejects invalid UTF-8', async () => {
  const file = { name: 'project.exe', size: 1, arrayBuffer() { throw new Error('must not read'); } };
  await assert.rejects(files.readProjectFile(file), /расширением/);
  await assert.rejects(files.readProjectFile({ ...file, name: 'p.json', size: files.MAX_PROJECT_BYTES + 1 }), /4 МБ/);
  await assert.rejects(files.readProjectFile({ name: 'p.json', size: 2, async arrayBuffer() { return new Uint8Array([0xc3, 0x28]).buffer; } }), /UTF-8/);
});

test('restore commits both records together, publishes only complete state and persists through new controllers', async () => {
  const s = await stores(); const project = sample(); const snapshots = [];
  s.research.subscribe(() => snapshots.push([s.research.getSnapshot().data, s.beats.getSnapshot().data]));
  await restoreProject(project, s.versions(), s.research, s.beats, s.repo);
  assert.equal(s.repo.calls, 1);
  assert.deepEqual(snapshots, [[project.research, project.beats]]);
  const reopened = await stores(s.repo);
  assert.deepEqual(reopened.research.getSnapshot().data, project.research);
  assert.deepEqual(reopened.beats.getSnapshot().data, project.beats);
  project.research.videoUrl = 'changed outside';
  assert.equal(s.research.getSnapshot().data.videoUrl, 'https://');
  assert.equal(s.research.getReplacementVersion(), 1);
});

test('quota failure preserves both saved and visible work, and retry succeeds', async () => {
  const s = await stores(); s.research.update((d) => ({ ...d, videoUrl: 'my work' })); await settle(s.research);
  const before = new Map(s.repo.rows); const snapshot = s.research.getSnapshot();
  s.repo.fail = true;
  await assert.rejects(restoreProject(sample(), s.versions(), s.research, s.beats, s.repo), /quota/);
  assert.deepEqual(s.repo.rows, before); assert.equal(s.research.getSnapshot(), snapshot);
  assert.equal(s.research.hasUnsaved(), false); assert.equal(s.beats.getReplacementVersion(), 0);
  s.repo.fail = false;
  await restoreProject(sample(), s.versions(), s.research, s.beats, s.repo);
});

test('a stale preview is refused even with autosave disabled', async () => {
  const s = await stores(); s.research.setEnabled(false); await settle(s.research);
  const versions = s.versions(); s.research.update((d) => ({ ...d, videoUrl: 'new unsaved text' }));
  await assert.rejects(restoreProject(sample(), versions, s.research, s.beats, s.repo), /изменилась/);
  assert.equal(s.research.getSnapshot().data.videoUrl, 'new unsaved text');
});

test('another tab changing either record aborts the whole replacement', async () => {
  for (const key of ['research', 'beats']) {
    const s = await stores(); const versions = s.versions(); s.repo.rows.set(key, 'another tab');
    await assert.rejects(restoreProject(sample(), versions, s.research, s.beats, s.repo), /Другая вкладка/);
    assert.deepEqual(s.repo.rows, new Map([[key, 'another tab']]));
    assert.deepEqual(s.research.getSnapshot().data, drafts.emptyResearchDraft());
    assert.deepEqual(s.beats.getSnapshot().data, drafts.emptyBeatDraft());
  }
});

test('disabled autosave preferences are preserved; only enabled section contents persist', async () => {
  const s = await stores(); s.beats.setEnabled(false); await settle(s.beats);
  const project = sample(); await restoreProject(project, s.versions(), s.research, s.beats, s.repo);
  assert.equal(s.beats.getSnapshot().enabled, false);
  assert.deepEqual(s.beats.getSnapshot().data, project.beats);
  assert.deepEqual(JSON.parse(s.repo.rows.get('beats')).data, drafts.emptyBeatDraft());
  const reopened = await stores(s.repo);
  assert.deepEqual(reopened.beats.getSnapshot().data, drafts.emptyBeatDraft());
  assert.deepEqual(reopened.research.getSnapshot().data, project.research);
});

test('pending autosaves cannot overwrite a successful project restore', async () => {
  const s = await stores(); s.research.update((d) => ({ ...d, videoUrl: 'pending' }));
  const project = sample(); await restoreProject(project, s.versions(), s.research, s.beats, s.repo);
  await setTimeout(350);
  assert.equal(s.repo.calls, 1);
  assert.deepEqual(JSON.parse(s.repo.rows.get('research')).data, project.research);
});

test('failed second reservation releases the first and resumes its pending autosave', async () => {
  const s = await stores(); const versions = s.versions();
  s.beats.update(() => sample().beats); s.research.update((d) => ({ ...d, videoUrl: 'keep me' }));
  versions.research = s.research.getVersion();
  await assert.rejects(restoreProject(sample(), versions, s.research, s.beats, s.repo), /изменилась/);
  await settle(s.research, s.beats);
  assert.equal(JSON.parse(s.repo.rows.get('research')).data.videoUrl, 'keep me');
});

test('invalid project never writes or acquires locks', async () => {
  const s = await stores();
  await assert.rejects(restoreProject({ ...sample(), beats: null }, s.versions(), s.research, s.beats, s.repo));
  assert.equal(s.repo.calls, 0); assert.equal(s.research.hasUnsaved(), false);
});

test('both memory-only workspaces restore without opening unavailable storage', async () => {
  const repo = memory();
  repo.read = async () => { throw new Error('storage disabled'); };
  repo.compareAndWriteBatch = async (writes) => { assert.deepEqual(writes, []); };
  const s = await stores(repo); s.research.continueInMemory(); s.beats.continueInMemory();
  const project = sample();
  await restoreProject(project, s.versions(), s.research, s.beats, repo);
  assert.deepEqual(s.research.getSnapshot().data, project.research);
  assert.deepEqual(s.beats.getSnapshot().data, project.beats);
  assert.equal(s.research.getSnapshot().enabled, false); assert.equal(s.beats.getSnapshot().enabled, false);
  assert.equal(repo.rows.size, 0);
});

test('pending transaction locks both forms and rejects competing replacements', async () => {
  const s = await stores(); const project = sample(); let finish;
  s.repo.beforeWrite = () => new Promise((resolve) => { finish = resolve; });
  const task = restoreProject(project, s.versions(), s.research, s.beats, s.repo);
  s.research.update((d) => ({ ...d, videoUrl: 'late old operation' })); s.beats.clear(); s.beats.setEnabled(false);
  assert.deepEqual(s.research.getSnapshot().data, drafts.emptyResearchDraft());
  assert.equal(s.research.hasUnsaved(), true);
  await assert.rejects(restoreProject(project, s.versions(), s.research, s.beats, s.repo), /Дождитесь/);
  finish(); await task;
  assert.deepEqual(s.research.getSnapshot().data, project.research);
  assert.equal(s.beats.getSnapshot().enabled, true);
});
