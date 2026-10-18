import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSnapdeckPrompt, createPresentationBrief, serializePresentationBrief, validatePresentationBrief } from '../src/services/presentationBriefContract.ts';

const source = { id: 'source-1', title: 'Официальная документация', url: 'https://example.com/docs', claim: 'Описание проверяемой функции.', review: 'checked' };
const input = { title: 'Eclipse deck', goal: 'Объяснить проверенный рабочий процесс команде.', audience: 'Команда', format: 'ppt-16-9', slideCount: 8, visualDirection: 'Тёмный editorial', sources: [source], forbiddenClaims: ['Не обещать гарантированный результат'], rightsConfirmed: true, privateDataExcluded: true };

test('presentation brief creates a gated, inert Snapdeck handoff', () => {
  const brief = createPresentationBrief(input);
  validatePresentationBrief(brief);
  assert.match(buildSnapdeckPrompt(brief), /Сначала покажи outline/);
  assert.match(serializePresentationBrief(brief), /"status": "draft"/);
});

test('presentation brief rejects unapproved data and unsafe URLs', () => {
  assert.throws(() => createPresentationBrief({ ...input, rightsConfirmed: false }), /права/);
  assert.throws(() => createPresentationBrief({ ...input, privateDataExcluded: false }), /Приватные/);
  assert.throws(() => createPresentationBrief({ ...input, sources: [{ ...source, url: 'javascript:alert(1)' }] }), /публичным HTTP/);
  assert.throws(() => createPresentationBrief({ ...input, sources: [{ ...source, url: 'https://user:pass@example.com' }] }), /логина/);
});

test('presentation brief rejects injected text and invalid source review', () => {
  assert.throws(() => createPresentationBrief({ ...input, title: 'Eclipse\u202edeck' }), /управляющие/);
  const brief = createPresentationBrief(input); brief.sources[0].review = 'unknown';
  assert.throws(() => validatePresentationBrief(brief), /статус/);
});
