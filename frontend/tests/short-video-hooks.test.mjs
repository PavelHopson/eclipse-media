import test from 'node:test';
import assert from 'node:assert/strict';
import { createVideoHooks, hookToScene, prependHook, undoHook, canUndoHook } from '../src/services/shortVideoHooks.ts';
const brief = { product: 'Библиотека', audience: 'Дизайнеры', problem: 'Долго ищут пример', payoff: 'Найдём пример по теме' };
test('six local hooks; review required; scene is three seconds', () => {
  const hooks = createVideoHooks(brief); assert.equal(hooks.length, 6);
  assert.throws(() => hookToScene(hooks[0], false)); assert.equal(hookToScene(hooks[0], true).duration, 3);
});
test('prepend and undo preserve previous scenes; edited hook cannot be removed', () => {
  const scene = hookToScene(createVideoHooks(brief)[0], true), previous = { ...scene, id: crypto.randomUUID(), title: 'Исходная сцена' };
  const next = prependHook([previous], scene); assert.deepEqual(next, [scene, previous]); assert.deepEqual(undoHook(next, scene), [previous]);
  const edited = [{ ...scene, title: 'Моя правка' }, previous]; assert.equal(canUndoHook(edited, scene), false); assert.throws(() => undoHook(edited, scene));
  assert.throws(() => prependHook(Array.from({length:24}, () => ({...previous,id:crypto.randomUUID()})), scene));
});
test('invalid text and injected secrets are rejected, markup stays text', () => {
  for (const product of ['', 'x'.repeat(81), 'abc\u202e', 'sk-' + 'x'.repeat(24)]) assert.throws(() => createVideoHooks({ ...brief, product }));
  assert.equal(createVideoHooks({ ...brief, product: '<img onerror=alert(1)>' })[0].onScreen, '<img onerror=alert(1)>');
});
