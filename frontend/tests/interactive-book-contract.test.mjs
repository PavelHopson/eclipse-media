import assert from 'node:assert/strict';
import test from 'node:test';
import { createInteractiveBookProject, serializeInteractiveBookProject, totalBookDuration, validateInteractiveBookProject } from '../src/services/interactiveBookContract.ts';

const source = { fileName: 'guide.pdf', mimeType: 'application/pdf', bytes: 4096, sha256: 'a'.repeat(64), rightsConfirmed: true, sourceKeptPrivate: true };

test('interactive book pilot creates a private source manifest and editable beats', () => {
  const project = createInteractiveBookProject({ title: 'Пособие Eclipse', audience: 'Команда', chapterTitle: 'Старт', source });
  assert.equal(project.schema, 'eclipse.media.interactive-book.v1');
  assert.equal(project.source.sourceKeptPrivate, true);
  assert.equal(project.chapters[0].beats.length, 4);
  assert.equal(totalBookDuration(project), 50);
  assert.match(serializeInteractiveBookProject(project), /"not-generated"/);
});

test('interactive book pilot rejects missing rights, wrong source and invalid hashes', () => {
  assert.throws(() => createInteractiveBookProject({ title: 'Книга', audience: 'Команда', chapterTitle: 'Глава', source: { ...source, rightsConfirmed: false } }), /право/);
  assert.throws(() => createInteractiveBookProject({ title: 'Книга', audience: 'Команда', chapterTitle: 'Глава', source: { ...source, mimeType: 'text/plain' } }), /PDF/);
  const project = createInteractiveBookProject({ title: 'Книга', audience: 'Команда', chapterTitle: 'Глава', source });
  assert.throws(() => validateInteractiveBookProject({ ...project, source: { ...project.source, sha256: 'nope' } }), /SHA-256/);
});

test('interactive book pilot rejects control characters and invalid quiz choices', () => {
  assert.throws(() => createInteractiveBookProject({ title: 'Кни\u202eга', audience: 'Команда', chapterTitle: 'Глава', source }), /управляющие/);
  const project = createInteractiveBookProject({ title: 'Книга', audience: 'Команда', chapterTitle: 'Глава', source });
  project.chapters[0].beats[1].quiz.answer = 9;
  assert.throws(() => validateInteractiveBookProject(project), /Квиз/);
});
