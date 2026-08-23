import assert from 'node:assert/strict';
import test from 'node:test';
import { DOWNLOAD_PHASE_STEPS, getDownloadProgressView } from '../src/services/downloadProgress.ts';

const base = {
  eta: '',
  fragmentCurrent: null,
  fragmentTotal: null,
  progress: 0,
  speed: '',
};

test('describes all four local pipeline phases in order', () => {
  assert.deepEqual(DOWNLOAD_PHASE_STEPS.map((step) => step.id), [
    'preparing',
    'downloading',
    'processing',
    'finalizing',
  ]);

  assert.equal(getDownloadProgressView({ ...base, phase: 'preparing' }).activeStep, 0);
  assert.equal(getDownloadProgressView({ ...base, phase: 'finalizing' }).activeStep, 3);
});

test('reports real download percentage without inventing pipeline completion', () => {
  const downloading = getDownloadProgressView({
    ...base,
    phase: 'downloading',
    progress: 42.75,
    speed: '2.4 MiB/s',
    eta: '00:18',
  });

  assert.equal(downloading.ariaValueNow, 42.75);
  assert.equal(downloading.progressScale, 0.4275);
  assert.equal(downloading.metaLead, '42.8% · 2.4 MiB/s');
  assert.equal(downloading.metaTail, 'Осталось ≈ 00:18');

  const processing = getDownloadProgressView({ ...base, phase: 'processing', progress: 100 });
  assert.equal(processing.ariaValueNow, undefined);
  assert.equal(processing.metaLead, 'Поток загружен');
  assert.match(processing.ariaValueText, /собираем итоговый файл/i);
});

test('clamps malformed progress values before rendering or announcing them', () => {
  assert.equal(getDownloadProgressView({ ...base, phase: 'downloading', progress: -10 }).progressScale, 0);
  assert.equal(getDownloadProgressView({ ...base, phase: 'downloading', progress: 170 }).progressScale, 1);
  assert.equal(getDownloadProgressView({ ...base, phase: 'downloading', progress: Number.NaN }).ariaValueNow, 0);
});
