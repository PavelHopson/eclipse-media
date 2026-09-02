import assert from 'node:assert/strict';
import test from 'node:test';
import {
  approveGpuHandoff,
  completeCaptionReview,
  createDatasetManifest,
  serializeDatasetManifest,
} from '../src/services/datasetManifestContract.ts';

function input() {
  return {
    name: 'Оригинальный персонаж Eclipse',
    purpose: 'Обучить стилистическую LoRA для собственных иллюстраций цифрового компаньона.',
    owner: 'Eclipse Forge',
    rightsBasis: 'owned',
    containsRealPeople: false,
    likenessConsentConfirmed: false,
    rightsConfirmed: true,
    files: [
      { fileName: 'frame-01.png', mimeType: 'image/png', sizeBytes: 1024, sha256: 'a'.repeat(64) },
      { fileName: 'frame-02.webp', mimeType: 'image/webp', sizeBytes: 2048, sha256: 'b'.repeat(64) },
    ],
    baseModel: { id: 'wan-image-base', revision: 'commit-20260902', sha256: 'c'.repeat(64), license: 'Apache-2.0' },
  };
}

test('creates a local dataset manifest with TagGUI and kohya isolated', () => {
  const manifest = createDatasetManifest(input(), new Date('2026-09-02T10:00:00.000Z'), 'dataset-1');
  assert.equal(manifest.captionReview.toolBoundary, 'taggui-separate-gpl-process');
  assert.equal(manifest.gpuHandoff.toolBoundary, 'kohya-ss-isolated-gpu-worker');
  assert.deepEqual(manifest.policy, { network: false, hiddenDownloads: false, currentVpsAllowed: false, trainingStarted: false, autoPublish: false });
  assert.doesNotMatch(serializeDatasetManifest(manifest), /apiKey|accessToken|privateKey/i);
});

test('requires rights and explicit likeness consent for real people', () => {
  assert.throws(() => createDatasetManifest({ ...input(), rightsConfirmed: false }), /права/);
  assert.throws(() => createDatasetManifest({ ...input(), containsRealPeople: true, likenessConsentConfirmed: false }), /явное согласие/);
});

test('rejects duplicate files and unpinned base models', () => {
  const duplicated = { ...input(), files: [...input().files, { ...input().files[0], fileName: 'copy.png' }] };
  assert.throws(() => createDatasetManifest(duplicated), /одинаковые/);
  assert.throws(() => createDatasetManifest({ ...input(), baseModel: { ...input().baseModel, sha256: 'bad' } }), /SHA-256/);
});
test('rejects control characters in dataset metadata and file names', () => {
  assert.throws(() => createDatasetManifest({
    ...input(),
    files: [{ ...input().files[0], fileName: 'frame\u0000.png' }],
  }), /служебные символы/);
  assert.throws(() => createDatasetManifest({
    ...input(),
    purpose: 'Подготовить\u0000 обучающий набор из собственных изображений.',
  }), /символов/);
});


test('gates GPU handoff behind caption review and a pinned base model', () => {
  let manifest = createDatasetManifest(input(), new Date(), 'dataset-2');
  assert.throws(() => approveGpuHandoff(manifest, 'Павел'), /captions/);
  manifest = completeCaptionReview(manifest, 'Павел');
  manifest = approveGpuHandoff(manifest, 'Павел');
  assert.equal(manifest.gpuHandoff.status, 'approved_not_started');
  assert.equal(manifest.policy.trainingStarted, false);
  const withoutModel = completeCaptionReview(createDatasetManifest({ ...input(), baseModel: null }), 'Павел');
  assert.throws(() => approveGpuHandoff(withoutModel, 'Павел'), /pinned base model/);
});
