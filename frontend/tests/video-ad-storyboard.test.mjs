import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { URL } from 'node:url';
import test from 'node:test';
import { newStoryScene, validateStoryboard } from '../src/services/projectStoryboardContract.ts';
import { createVideoAdStoryboard, videoAdImportProblem, appendVideoAdStoryboard, canUndoVideoAdStoryboard, undoVideoAdStoryboard } from '../src/services/videoAdStoryboard.ts';

const sample = () => ({ schemaVersion: 'eclipse.video-ad-plan.v1', plan: {
  id: 'ad-1', title: 'Проверенный продукт', format: '9:16', duration: 15, referenceBoardId: 'board-1',
  claimsRequireReview: true, publishRequiresApproval: true,
  scenes: ['hook', 'proof', 'action'].map((id, index) => ({ id, start: index * 5, duration: 5, purpose: id, copy: `Действие ${index + 1}`, referenceIds: ['reference-1'] })),
} });

test('converts a plan to three editable scenes, keeps provenance and invents no assets or approvals', () => {
  const plan = sample(); const original = globalThis.structuredClone(plan); const scenes = createVideoAdStoryboard(plan);
  validateStoryboard({ scenes }); assert.deepEqual(plan, original);
  assert.deepEqual(scenes.map(scene => scene.title), ['Зацепка', 'Доказательство', 'Следующий шаг']);
  assert.deepEqual(scenes.map(scene => scene.action), ['Действие 1', 'Действие 2', 'Действие 3']);
  assert.equal(scenes.reduce((sum, scene) => sum + scene.duration, 0), 15);
  assert.equal(new Set(scenes.map(scene => scene.id)).size, 3);
  assert.ok(scenes.every(scene => scene.music === '' && scene.camera === '' && scene.theses.length === 0));
  assert.deepEqual(scenes[0].sourcePlan, { schemaVersion: 'eclipse.video-ad-plan.v1', planId: 'ad-1', planTitle: 'Проверенный продукт',
    referenceBoardId: 'board-1', sceneId: 'hook', referenceIds: ['reference-1'], format: '9:16', claimsRequireReview: true, publishRequiresApproval: true });
  scenes[0].sourcePlan.referenceIds.push('local-edit'); assert.deepEqual(plan.plan.scenes[0].referenceIds, ['reference-1']);
});

test('revalidates raw runtime plans and treats reference IDs as plain text', () => {
  for (const mutate of [plan => plan.plan.publishRequiresApproval = false, plan => plan.plan.claimsRequireReview = false,
    plan => plan.plan.scenes.pop(), plan => plan.plan.scenes[0].duration = 10, plan => plan.plan.approvedAt = 'today']) {
    const plan = sample(); mutate(plan); assert.throws(() => createVideoAdStoryboard(plan));
    assert.throws(() => videoAdImportProblem([], plan));
  }
  const plan = sample(); plan.plan.scenes[0].referenceIds = ['javascript:alert(1)', '<img src=x onerror=alert(1)>'];
  const scene = createVideoAdStoryboard(plan)[0]; assert.deepEqual(scene.sourcePlan.referenceIds, plan.plan.scenes[0].referenceIds);
  assert.equal(scene.theses.length, 0); assert.equal(Object.hasOwn(scene.sourcePlan, 'url'), false);
});

test('accepts legacy scenes and rejects unknown, malformed or approving source metadata', () => {
  const legacy = newStoryScene(); validateStoryboard({ scenes: [legacy] }); assert.equal(Object.hasOwn(legacy, 'sourcePlan'), false);
  for (const mutate of [scene => scene.sourcePlan = null, scene => scene.sourcePlan = undefined,
    scene => scene.sourcePlan.schemaVersion = 'v2', scene => scene.sourcePlan.planId = '', scene => scene.sourcePlan.planId = 'a'.repeat(81),
    scene => scene.sourcePlan.planTitle = 'a'.repeat(91), scene => scene.sourcePlan.referenceBoardId = ' ',
    scene => scene.sourcePlan.sceneId = 'other', scene => scene.sourcePlan.format = '4:3',
    scene => scene.sourcePlan.claimsRequireReview = false, scene => scene.sourcePlan.publishRequiresApproval = false,
    scene => scene.sourcePlan.approvedAt = 'today', scene => scene.sourcePlan.referenceIds = Array(25).fill('a'),
    scene => scene.sourcePlan.referenceIds = [true], scene => scene.sourcePlan.referenceIds = ['a'.repeat(81)],
    scene => scene.sourcePlan.referenceIds = ['a\u202eb'], scene => scene.sourcePlan.referenceIds = ['a\u0085b'],
    scene => scene.sourcePlan.planTitle = 'a\nb', scene => scene.unknown = 'value']) {
    const scene = createVideoAdStoryboard(sample())[0]; mutate(scene); assert.throws(() => validateStoryboard({ scenes: [scene] }));
  }
});

test('append preserves existing scenes and snapshots its source batch', () => {
  const plan = sample(); const existing = newStoryScene(); existing.action = 'Моя работа';
  const current = [existing]; const original = globalThis.structuredClone(current); const batch = createVideoAdStoryboard(plan);
  const result = appendVideoAdStoryboard(current, plan, batch);
  assert.equal(result.length, 4); assert.deepEqual(current, original); assert.deepEqual(result[0], original[0]);
  result[1].sourcePlan.referenceIds.push('changed'); assert.deepEqual(batch[0].sourcePlan.referenceIds, ['reference-1']);
});

test('duplicate detection survives changed copy, partial removal and edited scene fields', () => {
  const plan = sample(); const scenes = createVideoAdStoryboard(plan); scenes[0].action = 'Правка автора';
  const changed = sample(); changed.plan.title = 'Новая версия'; changed.plan.scenes[0].copy = 'Другой текст';
  for (const current of [scenes, scenes.slice(0, 1), scenes.slice(1)]) {
    assert.match(videoAdImportProblem(current, changed), /уже добавлен/);
    assert.throws(() => appendVideoAdStoryboard(current, changed, createVideoAdStoryboard(changed)), /уже добавлен/);
  }
  assert.equal(videoAdImportProblem([], changed), null);
  for (const field of ['id', 'referenceBoardId', 'format']) {
    const another = sample(); another.plan[field] = field === 'format' ? '16:9' : 'another';
    assert.equal(videoAdImportProblem(scenes, another), null);
  }
});

test('capacity and mismatched batches fail atomically', () => {
  const plan = sample(); const batch = createVideoAdStoryboard(plan); const current = Array.from({ length: 21 }, () => newStoryScene());
  assert.equal(appendVideoAdStoryboard(current, plan, batch).length, 24);
  current.push(newStoryScene()); const original = globalThis.structuredClone(current);
  assert.match(videoAdImportProblem(current, plan), /три свободных/);
  assert.throws(() => appendVideoAdStoryboard(current, plan, batch), /три свободных/); assert.deepEqual(current, original);
  for (const mutate of [items => items.pop(), items => items.reverse(), items => items[1].action = 'Подмена',
    items => items[1].sourcePlan.referenceIds = ['other'], items => items[1].id = items[0].id,
    items => items[1].sourcePlan = { ...items[1].sourcePlan, approvedAt: 'today' }]) {
    const wrong = globalThis.structuredClone(batch); mutate(wrong); assert.throws(() => appendVideoAdStoryboard([], plan, wrong));
  }
});

test('undo only removes the unchanged imported batch, even after reordering', () => {
  const plan = sample(); const old = newStoryScene(); const later = newStoryScene(); const batch = createVideoAdStoryboard(plan);
  const current = [...appendVideoAdStoryboard([old], plan, batch), later].reverse();
  assert.equal(canUndoVideoAdStoryboard(current, batch), true); assert.deepEqual(undoVideoAdStoryboard(current, batch), [later, old]);
  assert.equal(current.length, 5);
});

test('undo preserves user edits and rejects missing, foreign or forged batches', () => {
  const plan = sample(); const batch = createVideoAdStoryboard(plan);
  for (const mutate of [items => items[0].action = 'Моя правка', items => items[0].sourcePlan.referenceIds.push('edited'),
    items => items.pop(), items => items[0].sourcePlan.planId = 'other', items => items[1].id = items[0].id]) {
    const current = globalThis.structuredClone(batch); mutate(current); const original = globalThis.structuredClone(current);
    assert.equal(canUndoVideoAdStoryboard(current, batch), false); assert.throws(() => undoVideoAdStoryboard(current, batch)); assert.deepEqual(current, original);
  }
  assert.equal(canUndoVideoAdStoryboard(batch, createVideoAdStoryboard(plan)), false);
  assert.equal(canUndoVideoAdStoryboard(batch, []), false);
  const forged = [batch[0], batch[0], batch[0]];
  assert.equal(canUndoVideoAdStoryboard(batch, forged), false);
});

test('project export and import preserve provenance alongside legacy scenes', async () => {
  // Existing app contracts use extensionless TS imports; resolve only those service imports in this Node test.
  const serviceRoot = new URL('../src/services/', import.meta.url).href;
  const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith(serviceRoot) && /^\.\/[a-zA-Z]+$/.test(specifier)) return nextResolve(specifier + '.ts', context);
    return nextResolve(specifier, context);
  } });
  let files; let drafts;
  try {
    files = await import('../src/services/projectFileContract.ts'); drafts = await import('../src/services/draftContract.ts');
  } finally { hooks.deregister(); }
  const scenes = [newStoryScene(), ...createVideoAdStoryboard(sample())];
  const raw = files.serializeProjectFile(drafts.emptyResearchDraft(), { ...drafts.emptyBeatDraft(), storyboard: { scenes } });
  const restored = files.parseProjectFile(raw);
  assert.equal(restored.schema, 'eclipse.media-project.v2'); assert.deepEqual(restored.beats.storyboard.scenes, scenes);
  assert.equal(Object.hasOwn(restored.beats.storyboard.scenes[0], 'sourcePlan'), false);
  const changed = JSON.parse(raw); changed.beats.storyboard.scenes[1].sourcePlan.publishRequiresApproval = false;
  assert.throws(() => files.parseProjectFile(JSON.stringify(changed)));
});
