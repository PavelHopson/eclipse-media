import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceMediaLibraryItem,
  createMediaLibraryItem,
  MEDIA_LIBRARY_SCHEMA,
  serializeMediaLibraryItem,
} from '../src/services/mediaLibraryContract.ts';

function ownedInput() {
  return {
    title: 'Оригинальный тизер Eclipse',
    project: 'Eclipse Media',
    file: { name: 'eclipse-teaser.mp4', sizeBytes: 1024, mimeType: 'video/mp4', sha256: 'a'.repeat(64) },
    rights: {
      basis: 'owned', owner: 'Eclipse Forge', sourceUrl: '', sourceAssetId: '',
      licenseName: 'Собственный материал', licenseUrl: '', acquiredAt: '2026-09-02T00:00:00.000Z', expiresAt: '',
      clientScope: '', allowedChannels: ['internal', 'web'], certificateFileName: '',
      trainingAllowed: false, confirmed: true,
    },
  };
}

test('creates a local metadata-only media card with a strict rights receipt', () => {
  const item = createMediaLibraryItem(ownedInput(), new Date('2026-09-02T10:00:00.000Z'), 'asset-1');
  assert.equal(item.schemaVersion, MEDIA_LIBRARY_SCHEMA);
  assert.equal(item.file.storedByEclipse, false);
  assert.equal(item.workflow.progress, 25);
  assert.deepEqual(item.policy, { torrentAcquisition: false, scraperAcquisition: false, drmBypass: false, remoteFetch: false, autoPublish: false });
  assert.doesNotMatch(serializeMediaLibraryItem(item), /apiKey|accessToken|cookie/i);
});

test('requires evidence for licensed assets and blocks rejected source domains', () => {
  const licensed = {
    ...ownedInput(),
    rights: {
      ...ownedInput().rights,
      basis: 'licensed',
      sourceUrl: 'https://artlist.io/royalty-free-music/song/example/12345',
      sourceAssetId: 'artlist-12345',
      licenseName: 'Artlist Pro',
      licenseUrl: 'https://artlist.io/help-center/privacy-terms/artlist-license/',
      certificateFileName: 'artlist-license-12345.pdf',
    },
  };
  assert.equal(createMediaLibraryItem(licensed).rightsReceipt.sourceAssetId, 'artlist-12345');
  assert.throws(() => createMediaLibraryItem({ ...licensed, rights: { ...licensed.rights, certificateFileName: '' } }), /сертификата/);
  assert.throws(() => createMediaLibraryItem({ ...licensed, rights: { ...licensed.rights, sourceUrl: 'https://kemono.cr/post/1' } }), /запрещён/);
  assert.throws(() => createMediaLibraryItem({ ...licensed, rights: { ...licensed.rights, sourceUrl: 'https://playtorrio.pages.dev/' } }), /запрещён/);
});

test('keeps client scope, training permission and expiry explicit', () => {
  const input = ownedInput();
  input.rights.allowedChannels = ['client'];
  assert.throws(() => createMediaLibraryItem(input), /клиента/);
  input.rights.clientScope = 'Договор EF-2026-09';
  input.rights.trainingAllowed = true;
  input.rights.expiresAt = '2027-09-02T00:00:00.000Z';
  const item = createMediaLibraryItem(input);
  assert.equal(item.rightsReceipt.trainingAllowed, true);
  assert.equal(item.rightsReceipt.clientScope, 'Договор EF-2026-09');
});

test('advances through a resumable workflow without performing media actions', () => {
  let item = createMediaLibraryItem(ownedInput(), new Date(), 'asset-2');
  item = advanceMediaLibraryItem(item, 'Паспорт и источник проверены');
  item = advanceMediaLibraryItem(item, 'Проект монтажа выбран');
  item = advanceMediaLibraryItem(item, 'Экспорт проверен вручную');
  assert.equal(item.workflow.stage, 'ready');
  assert.equal(item.workflow.progress, 100);
  assert.equal(item.workflow.canResume, true);
  assert.throws(() => advanceMediaLibraryItem(item, 'Ещё шаг'), /уже готова/);
});
