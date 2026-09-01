import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';
import { parseDesktopUpdateInfo } from '../src/api/desktopRuntime.ts';

test('accepts a bounded semantic desktop update version', () => {
  assert.deepEqual(parseDesktopUpdateInfo({ version: '1.6.1' }), { version: '1.6.1' });
  assert.deepEqual(parseDesktopUpdateInfo({ version: '2.0.0-rc.1' }), { version: '2.0.0-rc.1' });
  assert.equal(parseDesktopUpdateInfo(null), null);
});

test('rejects malformed updater responses before invoking install', () => {
  for (const value of [undefined, {}, { version: 'latest' }, { version: '1.6.1\nhttps://evil.invalid' }]) {
    assert.throws(() => parseDesktopUpdateInfo(value));
  }
});

test('keeps package, Tauri and Cargo desktop versions in sync', () => {
  const packageVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  const tauriVersion = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8')).version;
  const cargo = readFileSync(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8');
  const cargoVersion = cargo.match(/^version = "([^"]+)"/m)?.[1];
  assert.equal(packageVersion, '1.6.0');
  assert.equal(tauriVersion, packageVersion);
  assert.equal(cargoVersion, packageVersion);
});
