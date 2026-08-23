import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getReceiptDisplayName,
  getSafeSuggestedName,
} from '../src/services/saveReceipt.ts';

test('keeps a normal Cyrillic filename for the native save dialog', () => {
  assert.equal(getSafeSuggestedName('Ураганные хроники.mp4', 'download.mp4'), 'Ураганные хроники.mp4');
});

test('fails closed for paths, reserved characters and traversal markers', () => {
  for (const value of ['../video.mp4', 'C:\\video.mp4', 'folder/video.mp4', '..', 'bad?.mp4']) {
    assert.equal(getSafeSuggestedName(value, 'download.mp4'), 'download.mp4');
  }
});

test('removes spoofing and control sequences from the receipt boundary', () => {
  assert.equal(getReceiptDisplayName('safe\u202Egpj.exe', 'download.mp4'), 'download.mp4');
  assert.equal(getReceiptDisplayName('line\nfeed.mp4', 'download.mp4'), 'download.mp4');
});

test('bounds the filename rendered into the success receipt', () => {
  assert.equal(getReceiptDisplayName(`${'a'.repeat(241)}.mp4`, 'download.mp4'), 'download.mp4');
});
