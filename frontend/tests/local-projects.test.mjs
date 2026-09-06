import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { URL } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { TextEncoder } from 'node:util';
const modules = new Map();
function load(file) {
  if (modules.has(file)) return modules.get(file);
  const code = ts.transpileModule(readFileSync(new URL('../src/services/' + file + '.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} }; modules.set(file, module.exports);
  Function('module', 'exports', 'require', code)(module, module.exports, (name) => { assert.match(name, /^\.\/[a-zA-Z]+$/); return load(name.slice(2)); });
  return module.exports;
}
const { LocalProjects, CATALOG_KEY, FIRST_PROJECT_ID, ACTIVE_PROJECT_KEY, projectKey, parseCatalog, projectTitle } = load('localProjects');
const { DraftConflict } = load('draftStorage');
const draft = load('draftContract'); const file = load('projectFileContract');
const story = load('projectStoryboardContract');
function memory() {
  return { rows: new Map(), fail: false, readsFail: false, beforeWrite: null, batches: [],
    async read(k) { if (this.readsFail) throw new Error('disabled'); return this.rows.get(k) ?? null; },
    async compareAndWrite(key, expected, next) { return this.compareAndWriteBatch([{ key, expected, next }]); },
    async compareAndWriteBatch(writes) {
      if (this.beforeWrite) await this.beforeWrite();
      if (writes.length && this.fail) throw new Error('quota');
      for (const w of writes) if ((this.rows.get(w.key) ?? null) !== w.expected) throw new DraftConflict();
      for (const w of writes) this.rows.set(w.key, w.next);
      if (writes.length) this.batches.push(writes);
    } };
}
function tab() { const rows = new Map(); return { getItem: (k) => rows.get(k) ?? null, setItem: (k, v) => rows.set(k, v) }; }
function researchFixture() { return { loaded: { fileName: 'owned.vtt', sha256: 'a'.repeat(64), transcript: { cues: [{ id: 'cue-1', start: 4.5, end: 9, text: '<img src=x onerror=alert(1)>' }], overlapCount: 0 } }, notes: [{ cueId: 'cue-1', claim: 'Проверяем мастерскую', status: 'unverified', evidenceUrl: '' }], videoUrl: '', page: 0 }; }
async function start(repo = memory(), selection = tab()) {
  const store = new LocalProjects(repo, selection); await store.init();
  const session = store.getSession(); await Promise.all([session.research.init(), session.beats.init()]);
  return { store, repo, selection, ...session };
}
const sample = () => file.parseProjectFile(file.serializeProjectFile({ ...draft.emptyResearchDraft(), videoUrl: 'https://partial' },
  { project: load('beatMapContract').createSyntheticBeatMap(), direction: draft.emptyDirectionDraft() }));
async function settle(...controllers) {
  for (let i = 0; i < 300; i++) { if (controllers.every((c) => !c.hasUnsaved())) return; await setTimeout(5); }
  throw new Error('Not settled');
}

test('legacy adoption does not copy or rewrite either old record and is idempotent', async () => {
  const repo = memory(); repo.rows.set('research', 'corrupt legacy retained');
  const { store } = await start(repo);
  assert.equal(store.getSnapshot().phase, 'ready');
  assert.equal(store.getSession().research.getSnapshot().phase, 'invalid');
  assert.equal(repo.rows.get('research'), 'corrupt legacy retained');
  assert.deepEqual(repo.batches[0].map((w) => w.key), [CATALOG_KEY]);
  await start(repo); assert.equal(repo.batches.length, 1);
});
test('concurrent first load adopts the same first project', async () => {
  const repo = memory(); const [a, b] = await Promise.all([start(repo), start(repo)]);
  assert.deepEqual(a.store.getSnapshot().projects, b.store.getSnapshot().projects);
  assert.equal(parseCatalog(repo.rows.get(CATALOG_KEY)).projects.length, 1);
});
test('create flushes both current sections atomically and switches to an empty project', async () => {
  const { store, repo, research, beats } = await start();
  research.update((d) => ({ ...d, videoUrl: 'https://unfinished' }));
  beats.update(() => sample().beats);
  await store.create('Клип');
  const id = store.getSnapshot().activeId; assert.notEqual(id, FIRST_PROJECT_ID);
  assert.equal(repo.batches.at(-1).length, 5);
  assert.equal(JSON.parse(repo.rows.get('research')).data.videoUrl, 'https://unfinished');
  assert.deepEqual(store.getSession().research.getSnapshot().data, draft.emptyResearchDraft());
  await store.switchTo(FIRST_PROJECT_ID);
  assert.equal(store.getSession().research.getSnapshot().data.videoUrl, 'https://unfinished');
  assert.ok(store.getSession().beats.getSnapshot().data.project);
  await store.switchTo(id); assert.equal(store.getSession().beats.getSnapshot().data.project, null);
});
test('duplicate is a deep independent copy, including unfinished fields', async () => {
  const { store, research } = await start(); research.update(() => sample().research);
  await store.create('Копия', 'duplicate'); const copy = store.getSnapshot().activeId;
  assert.equal(store.getSession().research.getSnapshot().data.videoUrl, 'https://partial');
  store.getSession().research.update((d) => ({ ...d, videoUrl: 'changed copy' }));
  await store.switchTo(FIRST_PROJECT_ID); assert.equal(research.getSnapshot().data.videoUrl, 'https://partial');
  await store.switchTo(copy); assert.equal(store.getSession().research.getSnapshot().data.videoUrl, 'changed copy');
});
test('import creates a new project and never replaces existing content', async () => {
  const { store, research } = await start(); research.update((d) => ({ ...d, videoUrl: 'keep me' }));
  await store.create('Импорт', sample()); const id = store.getSnapshot().activeId;
  assert.equal(store.getSnapshot().projects.length, 2);
  await store.switchTo(FIRST_PROJECT_ID); assert.equal(research.getSnapshot().data.videoUrl, 'keep me');
  await store.switchTo(id); assert.equal(store.getSession().research.getSnapshot().data.videoUrl, 'https://partial');
});
test('clean switching writes nothing and does not produce false conflicts in another tab', async () => {
  const a = await start(); await a.store.create('Второй'); await a.store.switchTo(FIRST_PROJECT_ID);
  const b = await start(a.repo); const count = a.repo.batches.length;
  const second = a.store.getSnapshot().projects[1].id;
  await a.store.switchTo(second); await a.store.switchTo(FIRST_PROJECT_ID);
  assert.equal(a.repo.batches.length, count);
  await b.research.checkExternal(); assert.notEqual(b.research.getSnapshot().phase, 'conflict');
});
test('catalog refresh does not switch another tab; active selection is tab-local and survives reload', async () => {
  const a = await start(); const b = await start(a.repo);
  await a.store.create('А'); const id = a.store.getSnapshot().activeId;
  await b.store.refresh(); assert.equal(b.store.getSnapshot().activeId, FIRST_PROJECT_ID);
  assert.equal(b.store.getSnapshot().projects.length, 2);
  const reload = await start(a.repo, a.selection); assert.equal(reload.store.getSnapshot().activeId, id);
  assert.equal(a.selection.getItem(ACTIVE_PROJECT_KEY), id);
});
test('different project writes never conflict; same project conflicts block leaving', async () => {
  const a = await start(); await a.store.create('Второй'); const b = await start(a.repo);
  a.store.getSession().research.update((d) => ({ ...d, videoUrl: 'second' }));
  b.research.update((d) => ({ ...d, videoUrl: 'first' }));
  await settle(a.store.getSession().research, b.research);
  assert.equal(b.research.getSnapshot().phase, 'saved');
  await a.store.switchTo(FIRST_PROJECT_ID); a.research.update((d) => ({ ...d, videoUrl: 'stale first' }));
  await assert.rejects(a.store.create('Не создавать'), /конфликт|изменились/);
  assert.equal(a.store.getSnapshot().activeId, FIRST_PROJECT_ID);
  await a.research.reload(); assert.equal(a.research.getSnapshot().phase, 'saved');
});
test('quota failure does not create partial project or change selection; retry succeeds', async () => {
  const { store, repo, research, beats } = await start();
  research.update(() => sample().research); beats.update(() => sample().beats);
  const before = new Map(repo.rows); repo.fail = true;
  await assert.rejects(store.create('Ошибка', 'duplicate'), /quota/);
  assert.deepEqual(repo.rows, before); assert.equal(store.getSnapshot().activeId, FIRST_PROJECT_ID);
  assert.equal(store.getSnapshot().projects.length, 1); assert.equal(research.getSnapshot().data.videoUrl, 'https://partial');
  repo.fail = false; await store.create('Повтор', 'duplicate');
  assert.equal(store.getSnapshot().projects.length, 2);
});
test('catalog CAS rejects stale create/rename instead of erasing another tab changes', async () => {
  const a = await start(); const b = await start(a.repo);
  await a.store.rename(FIRST_PROJECT_ID, 'Новое имя');
  await assert.rejects(b.store.rename(FIRST_PROJECT_ID, 'Старое намерение'), /изменились/);
  await assert.rejects(b.store.create('Не потерять имя'), /изменились/);
  await b.store.refresh(); assert.equal(b.store.getSnapshot().projects[0].title, 'Новое имя');
  await b.store.create('Теперь можно'); assert.equal(b.store.getSnapshot().projects.length, 2);
});
test('disabled autosave inherits without persisting private data; memory survives switches, not reload', async () => {
  const { store, repo, research, beats, selection } = await start();
  research.setEnabled(false); beats.setEnabled(false); await settle(research, beats);
  research.update(() => sample().research); beats.update(() => sample().beats);
  await store.create('Приватная копия', 'duplicate'); const id = store.getSnapshot().activeId;
  assert.equal(store.getSession().research.getSnapshot().enabled, false);
  assert.deepEqual(JSON.parse(repo.rows.get(projectKey(id, 'research'))).data, draft.emptyResearchDraft());
  assert.equal(store.hasUnsaved(), true);
  await store.switchTo(FIRST_PROJECT_ID); assert.equal(research.getSnapshot().data.videoUrl, 'https://partial');
  await store.switchTo(id); assert.ok(store.getSession().beats.getSnapshot().data.project);
  const reload = await start(repo, selection); assert.deepEqual(reload.store.getSession().research.getSnapshot().data, draft.emptyResearchDraft());
});
test('unavailable storage supports explicit memory-only projects and file import', async () => {
  const repo = memory(); repo.readsFail = true; repo.fail = true;
  const { store, research, beats } = await start(repo);
  assert.equal(store.getSnapshot().phase, 'error'); await store.continueInMemory();
  research.continueInMemory(); beats.continueInMemory();
  await store.create('В памяти', sample()); const id = store.getSnapshot().activeId;
  assert.equal(store.getSession().research.getSnapshot().enabled, false);
  await store.switchTo(FIRST_PROJECT_ID); await store.switchTo(id);
  assert.equal(store.getSession().research.getSnapshot().data.videoUrl, 'https://partial');
  assert.equal(repo.rows.size, 0);
});
test('invalid catalog is never overwritten or silently replaced by a memory catalog', async () => {
  const repo = memory(); repo.rows.set(CATALOG_KEY, '{invalid');
  const { store } = await start(repo); await store.continueInMemory();
  assert.equal(store.getSnapshot().phase, 'error'); assert.equal(store.getSnapshot().corrupt, true);
  await assert.rejects(store.create('Нет'), /готов/); assert.equal(repo.rows.get(CATALOG_KEY), '{invalid');
});
test('names, namespaces, catalog structure and imported fields are bounded and validated', async () => {
  for (const title of ['', ' '.repeat(12), 'x'.repeat(81), 'x\u202Ey', 'x\ny']) assert.throws(() => projectTitle(title));
  assert.equal(projectTitle('  Русский проект  '), 'Русский проект');
  assert.equal(projectTitle('<img onerror=alert(1)>'), '<img onerror=alert(1)>'); // rendered as text, never HTML
  assert.throws(() => projectKey('../research', 'research'));
  const { store, repo } = await start(); const raw = repo.rows.get(CATALOG_KEY); const valid = JSON.parse(raw);
  for (const bad of [{ ...valid, token: 'no' }, { ...valid, projects: [...valid.projects, valid.projects[0]] },
    { ...valid, projects: [] }, { ...valid, projects: [{ ...valid.projects[0], title: 'x\u0000' }] }]) assert.throws(() => parseCatalog(JSON.stringify(bad)));
  await assert.rejects(store.create('Нет', { ...sample(), accessToken: 'never' })); assert.equal(repo.batches.length, 1);
});
test('pending operation locks source writes and invalidates unfinished asynchronous loads', async () => {
  const { store, repo, research } = await start(); const generation = research.getReplacementVersion();
  let release; repo.beforeWrite = () => new Promise((resolve) => { release = resolve; });
  const pending = store.create('Новый');
  while (!release) await setTimeout(1);
  research.update((d) => ({ ...d, videoUrl: 'late source result' }));
  await assert.rejects(store.create('Двойной клик'), /готов/);
  release(); repo.beforeWrite = null; await pending;
  assert.equal(research.getSnapshot().data.videoUrl, '');
  assert.ok(research.getReplacementVersion() > generation);
});
test('a refreshed catalog cannot silently authorize a stale rename dialog', async () => {
  const a = await start(); const b = await start(a.repo);
  const previousTitle = b.store.getSnapshot().projects[0].title;
  await a.store.rename(FIRST_PROJECT_ID, 'Из другой вкладки'); await b.store.refresh();
  await assert.rejects(b.store.rename(FIRST_PROJECT_ID, 'Старый диалог', previousTitle), /Название изменилось/);
  assert.equal(parseCatalog(a.repo.rows.get(CATALOG_KEY)).projects[0].title, 'Из другой вкладки');
});
test('a late refresh cannot roll catalog state back after a successful mutation', async () => {
  const { store, repo } = await start();
  let resolve; const read = repo.read.bind(repo); const old = repo.rows.get(CATALOG_KEY);
  repo.read = async (key) => key === CATALOG_KEY ? new Promise((r) => { resolve = r; }) : read(key);
  const pending = store.refresh(); while (!resolve) await setTimeout(1);
  await store.rename(FIRST_PROJECT_ID, 'Новое'); resolve(old); await pending;
  assert.equal(store.getSnapshot().projects[0].title, 'Новое');
});

test('thesis scene preserves exact source evidence, does not imply verification and detects drift', () => {
  const research = researchFixture(); const beats = story.addThesisScene(draft.emptyBeatDraft(), research, 'cue-1');
  const scene = beats.storyboard.scenes[0]; assert.equal(scene.duration, 4.5); assert.equal(scene.theses[0].start, 4.5);
  assert.equal(scene.theses[0].excerpt, research.loaded.transcript.cues[0].text); assert.equal(scene.theses[0].status, 'unverified');
  assert.equal(story.thesisChanged(scene.theses[0], research), false);
  research.notes[0].claim = 'Другой тезис'; assert.equal(story.thesisChanged(scene.theses[0], research), true);
  assert.throws(() => story.addThesisScene(beats, research, 'cue-1'), /уже связан/);
  assert.deepEqual(story.missingSceneFields(scene), ['музыка или тишина', 'действие', 'камера']);
});
test('storyboard v2 backup round-trips partial data while v1 still imports unchanged', () => {
  const research = researchFixture(); const beats = story.addThesisScene(draft.emptyBeatDraft(), research, 'cue-1');
  const raw = file.serializeProjectFile(research, beats); const restored = file.parseProjectFile(raw);
  assert.equal(restored.schema, 'eclipse.media-project.v2'); assert.deepEqual(restored.beats, beats);
  assert.equal(sample().schema, 'eclipse.media-project.v1');
  assert.throws(() => file.parseProjectFile(raw.replace('eclipse.media-project.v2', 'eclipse.media-project.v1')));
});
test('storyboard rejects commands as fields, prototype keys, invalid timings and overlong data', () => {
  const board = story.addThesisScene(draft.emptyBeatDraft(), researchFixture(), 'cue-1').storyboard;
  const invalids = [b => b.scenes.push(b.scenes[0]), b => b.scenes[0].duration = Infinity, b => b.scenes[0].duration = 61,
    b => b.scenes[0].theses[0].start = -1, b => b.scenes[0].theses[0].sha256 = 'x', b => b.scenes[0].shell = 'evil',
    b => b.scenes[0].action = 'x'.repeat(401), b => b.scenes[0].title = 'bad\u202etext', b => b.scenes = Array(25).fill(b.scenes[0])];
  for (const modify of invalids) { const value = globalThis.structuredClone(board); modify(value); assert.throws(() => story.validateStoryboard(value)); }
  assert.throws(() => story.validateStoryboard(JSON.parse('{"scenes":[],"__proto__":{}}')));
});
test('archive and restore preserve research plus storyboard, across reload and duplicate', async () => {
  const a = await start(); a.research.update(() => researchFixture()); a.beats.update(() => story.addThesisScene(draft.emptyBeatDraft(), researchFixture(), 'cue-1'));
  await a.store.create('Второй'); await a.store.switchTo(FIRST_PROJECT_ID); await a.store.archive(FIRST_PROJECT_ID);
  assert.notEqual(a.store.getSnapshot().activeId, FIRST_PROJECT_ID); assert.ok(parseCatalog(a.repo.rows.get(CATALOG_KEY)).projects[0].deletedAt);
  await assert.rejects(a.store.switchTo(FIRST_PROJECT_ID), /корзине/);
  const reload = await start(a.repo, a.selection); await reload.store.restore(FIRST_PROJECT_ID); await reload.store.switchTo(FIRST_PROJECT_ID);
  assert.deepEqual(reload.store.getSession().research.getSnapshot().data, researchFixture());
  assert.equal(reload.store.getSession().beats.getSnapshot().data.storyboard.scenes.length, 1);
  await reload.store.create('Копия', 'duplicate'); assert.equal(reload.store.getSession().beats.getSnapshot().data.storyboard.scenes[0].theses[0].start, 4.5);
});
test('archiving the last active project creates a new empty project without deleting records', async () => {
  const a = await start(); a.research.update(() => researchFixture()); await a.store.archive(FIRST_PROJECT_ID);
  assert.equal(a.store.getSnapshot().projects.filter(p => !p.deletedAt).length, 1);
  assert.deepEqual(a.store.getSession().research.getSnapshot().data, draft.emptyResearchDraft());
  await a.store.restore(FIRST_PROJECT_ID); await a.store.switchTo(FIRST_PROJECT_ID); assert.deepEqual(a.research.getSnapshot().data, researchFixture());
});
test('old tab cannot write or explicitly overwrite trash, and restore does not silently overwrite unsaved edits', async () => {
  const a = await start(); a.research.update(() => researchFixture()); await a.store.create('Второй'); await a.store.switchTo(FIRST_PROJECT_ID);
  const b = await start(a.repo); await a.store.archive(FIRST_PROJECT_ID);
  const saved = a.repo.rows.get('research'); b.research.update(d => ({ ...d, videoUrl: 'stale' })); await setTimeout(300);
  assert.equal(b.research.getSnapshot().phase, 'conflict'); assert.equal(a.repo.rows.get('research'), saved);
  await b.research.overwrite(); assert.equal(a.repo.rows.get('research'), saved);
  await b.store.refresh(); await b.store.restore(FIRST_PROJECT_ID); assert.equal(b.research.getSnapshot().data.videoUrl, 'stale');
  assert.equal(b.research.getSnapshot().phase, 'conflict'); assert.equal(a.repo.rows.get('research'), saved);
  await b.research.reload(); assert.deepEqual(b.research.getSnapshot().data, researchFixture());
});
test('archive quota or stale record aborts catalog and both drafts together', async () => {
  const a = await start(); await a.store.create('Второй'); await a.store.switchTo(FIRST_PROJECT_ID);
  const before = new Map(a.repo.rows); a.repo.fail = true;
  await assert.rejects(a.store.archive(FIRST_PROJECT_ID)); assert.deepEqual(a.repo.rows, before); assert.equal(a.store.getSnapshot().activeId, FIRST_PROJECT_ID);
  a.repo.fail = false; const b = await start(a.repo); b.beats.update(() => story.addThesisScene(draft.emptyBeatDraft(), researchFixture(), 'cue-1')); await settle(b.beats);
  const latest = new Map(a.repo.rows); await assert.rejects(a.store.archive(FIRST_PROJECT_ID)); assert.deepEqual(a.repo.rows, latest);
});
test('off storyboard remains transient through archive and restore, but not browser restart', async () => {
  const a = await start(); a.beats.setEnabled(false); await settle(a.beats);
  a.beats.update(() => story.addThesisScene(draft.emptyBeatDraft(), researchFixture(), 'cue-1')); await a.store.archive(FIRST_PROJECT_ID);
  assert.equal(JSON.parse(a.repo.rows.get('beats')).data.storyboard, undefined);
  await a.store.restore(FIRST_PROJECT_ID); await a.store.switchTo(FIRST_PROJECT_ID); assert.equal(a.beats.getSnapshot().data.storyboard.scenes.length, 1);
  const reload = await start(a.repo, a.selection); assert.equal(reload.beats.getSnapshot().data.storyboard, undefined);
});
test('local preview file validation rejects oversized, disguised and spoofed inputs before decoding', () => {
  const preview = load('localVideoPreview'); const header = new TextEncoder().encode('0000ftyp0000');
  preview.validatePreviewFile({ name: 'Мой клип.mp4', size: 512 }, header);
  for (const f of [{ name: 'x.html', size: 512 }, { name: 'x.mp4', size: 61 * 1024 * 1024 }, { name: 'x\u202e.mp4', size: 512 }]) assert.throws(() => preview.validatePreviewFile(f, header));
  assert.throws(() => preview.validatePreviewFile({ name: 'x.mp4', size: 512 }, new Uint8Array(12)));
});
