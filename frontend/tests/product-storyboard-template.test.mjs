import assert from 'node:assert/strict';
import test from 'node:test';
import { createProductStoryboard, appendStoryboardBatch, canUndoStoryboardBatch, undoStoryboardBatch } from '../src/services/productStoryboardTemplate.ts';
import { newStoryScene, validateStoryboard } from '../src/services/projectStoryboardContract.ts';

test('product template creates four valid editable scenes totaling 30 seconds without touching source data', () => {
  const current = [newStoryScene()]; const original = JSON.parse(JSON.stringify(current));
  const batch = createProductStoryboard('Eclipse Library'); const result = appendStoryboardBatch(current, batch);
  assert.deepEqual(current, original); assert.equal(result.length, 5); assert.equal(batch.reduce((sum, scene) => sum + scene.duration, 0), 30);
  assert.equal(new Set(batch.map(scene => scene.id)).size, 4); validateStoryboard({ scenes: result });
  assert.ok(batch.every(scene => scene.music === 'Тишина' && scene.theses.length === 0));
  assert.ok(batch[2].action.includes('Концепт')); result[1].title = 'Changed'; assert.notEqual(batch[0].title, 'Changed');
});
test('undo removes only the unchanged batch and preserves other work', () => {
  const existing = newStoryScene(); const batch = createProductStoryboard('Учебный продукт'); const addedLater = newStoryScene();
  const current = [...appendStoryboardBatch([existing], batch), addedLater];
  assert.equal(canUndoStoryboardBatch(current, batch), true); assert.deepEqual(undoStoryboardBatch(current, batch), [existing, addedLater]);
  current[1].action = 'Пользовательская правка'; assert.equal(canUndoStoryboardBatch(current, batch), false);
  assert.throws(() => undoStoryboardBatch(current, batch), /уже изменены/);
});
test('full, duplicate, cross-project, missing and invalid data fail without losing scenes', () => {
  const batch = createProductStoryboard('Учебный продукт');
  assert.throws(() => appendStoryboardBatch(Array.from({ length: 21 }, () => newStoryScene()), batch), /четыре/);
  assert.throws(() => appendStoryboardBatch(batch, batch));
  assert.equal(canUndoStoryboardBatch(createProductStoryboard('Другой проект'), batch), false);
  assert.equal(canUndoStoryboardBatch(batch.slice(1), batch), false);
  for (const value of ['', 'ab', 'x'.repeat(81), 'a\u202eb', 'a\nname']) assert.throws(() => createProductStoryboard(value));
});
