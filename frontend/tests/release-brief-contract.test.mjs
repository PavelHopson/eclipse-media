import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReleaseVariables,
  createDefaultReleaseBrief,
  createReleaseBriefFromStoryboard,
  parseReleaseBriefJson,
  serializeReleaseBriefDraft,
  validateReleaseBriefDraft,
} from '../src/services/releaseBriefContract.ts';
import { parseStoryboardJson } from '../src/services/storyboardContract.ts';

const approvedReview = { claimsReviewed: true, noSensitiveData: true };

test('builds deterministic inert composition variables from a valid brief', () => {
  const draft = createDefaultReleaseBrief('9:16');
  const variables = buildReleaseVariables(draft, approvedReview);

  assert.equal(variables.schemaVersion, 'eclipse.release-variables.v1');
  assert.equal(variables.format, '9:16');
  assert.equal(variables.duration, 15);
  assert.deepEqual(variables.execution, {
    network: false,
    shell: false,
    render: false,
    publish: false,
  });
  assert.deepEqual(variables.scenes.map(({ id, start, duration }) => ({ id, start, duration })), [
    { id: 'signal', start: 0, duration: 3 },
    { id: 'inputs', start: 3, duration: 3 },
    { id: 'pipeline', start: 6, duration: 3 },
    { id: 'quality', start: 9, duration: 3 },
    { id: 'close', start: 12, duration: 3 },
  ]);
  assert.equal(Object.hasOwn(variables, 'command'), false);
  assert.equal(Object.hasOwn(variables, 'path'), false);
  assert.equal(Object.hasOwn(variables, 'url'), false);
});

test('keeps shell-like copy inert and requires both review confirmations', () => {
  const draft = createDefaultReleaseBrief();
  draft.scenes[0].body = '$(whoami); process.env.SECRET';

  const variables = buildReleaseVariables(draft, approvedReview);
  assert.equal(variables.scenes[0].body, '$(whoami); process.env.SECRET');
  assert.throws(
    () => buildReleaseVariables(draft, { claimsReviewed: false, noSensitiveData: true }),
    /подтвердите факты/i,
  );
});

test('rejects hidden direction controls, unknown fields and changed timeline', () => {
  const draft = createDefaultReleaseBrief();
  draft.scenes[0].headline = `safe${String.fromCodePoint(0x202e)}gpj.exe`;
  assert.match(validateReleaseBriefDraft(draft)[0].message, /символы запрещены/i);

  const unknown = JSON.parse(serializeReleaseBriefDraft(createDefaultReleaseBrief()));
  unknown.command = 'render --publish';
  assert.throws(() => parseReleaseBriefJson(JSON.stringify(unknown)), /неизвестные поля/i);

  const changed = createDefaultReleaseBrief();
  changed.scenes[2].start = 7;
  assert.match(validateReleaseBriefDraft(changed)[0].message, /timeline/i);
});

test('blocks obvious credentials before they can enter variables', () => {
  const draft = createDefaultReleaseBrief();
  draft.scenes[1].body = `api_key=${'A'.repeat(24)}`;
  assert.match(validateReleaseBriefDraft(draft)[0].message, /похожа на секрет/i);
  assert.throws(() => buildReleaseVariables(draft, approvedReview), /похожа на секрет/i);
});

test('maps a validated storyboard into the fixed five-scene release template', () => {
  const storyboard = parseStoryboardJson(JSON.stringify({
    schemaVersion: 'eclipse.release-storyboard.v1',
    title: 'Обновление библиотеки',
    format: '1:1',
    duration: 15,
    publishRequiresApproval: true,
    scenes: ['signal', 'problem', 'changes', 'proof', 'action'].map((id, index) => ({
      id,
      start: index * 3,
      duration: 3,
      eyebrow: `Шаг ${index + 1}`,
      headline: `Заголовок ${index + 1}`,
      body: `Описание ${index + 1}`,
    })),
  }));

  const draft = createReleaseBriefFromStoryboard(storyboard);
  assert.equal(draft.title, 'Обновление библиотеки');
  assert.equal(draft.format, '1:1');
  assert.deepEqual(draft.scenes.map((scene) => scene.id), ['signal', 'inputs', 'pipeline', 'quality', 'close']);
  assert.equal(draft.scenes[4].headline, 'Заголовок 5');
});
