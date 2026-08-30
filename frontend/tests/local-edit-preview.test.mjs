import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLocalEditPlan,
  digestLocalEditPlan,
  formatEditTime,
  LOCAL_EDIT_PROFILE,
  LOCAL_EDIT_SCHEMA,
  serializeLocalEditPlan,
} from '../src/services/localEditPreview.ts';

const input = {
  assetId: '00000000-0000-4000-8000-000000000005',
  sourceSha256: 'a'.repeat(64),
  sourceDurationMs: 120_000,
  startMs: 12_000,
  endMs: 42_000,
};

test('builds the same bounded trim plan shape as the backend contract', async () => {
  const plan = createLocalEditPlan(input);
  assert.deepEqual(plan, {
    schemaVersion: LOCAL_EDIT_SCHEMA,
    source: { assetId: input.assetId, sha256: input.sourceSha256 },
    trim: { startMs: 12_000, endMs: 42_000 },
    outputProfile: LOCAL_EDIT_PROFILE,
  });
  assert.equal(serializeLocalEditPlan(plan), JSON.stringify({
    outputProfile: LOCAL_EDIT_PROFILE,
    schemaVersion: LOCAL_EDIT_SCHEMA,
    source: { assetId: input.assetId, sha256: input.sourceSha256 },
    trim: { endMs: 42_000, startMs: 12_000 },
  }));
  assert.equal(await digestLocalEditPlan(plan), '145ea63410c1e3f822fffa6518311df04a5f99e2348d33ae471eb981b826e26f');
});

test('rejects arbitrary commands, changed source identity and unsafe ranges by construction', () => {
  assert.throws(() => createLocalEditPlan({ ...input, assetId: '../video.mp4' }), /идентификатор/);
  assert.throws(() => createLocalEditPlan({ ...input, sourceSha256: 'changed' }), /контрольная сумма/);
  assert.throws(() => createLocalEditPlan({ ...input, startMs: -1 }), /границы/i);
  assert.throws(() => createLocalEditPlan({ ...input, endMs: 120_001 }), /границы/i);
  assert.throws(() => createLocalEditPlan({ ...input, startMs: 0, endMs: 60_001 }), /не больше 60/);
  assert.equal(Object.hasOwn(createLocalEditPlan(input), 'command'), false);
});

test('formats exact millisecond boundaries for a human-readable preview', () => {
  assert.equal(formatEditTime(0), '00:00.000');
  assert.equal(formatEditTime(62_345), '01:02.345');
  assert.equal(formatEditTime(Number.NaN), '00:00.000');
});
