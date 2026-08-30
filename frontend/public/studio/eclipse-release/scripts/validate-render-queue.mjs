import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const [runner, contract] = await Promise.all([
  readFile(new URL('scripts/render-queued-job.mjs', root), 'utf8'),
  readFile(new URL('scripts/validate-template.mjs', root), 'utf8'),
]);

assert.doesNotMatch(runner, /exec(?:File|Sync)?\s*\(/);
assert.doesNotMatch(runner, /\bnpx\b|shell:\s*true|https?:\/\//i);
assert.match(runner, /spawn\(process\.execPath/);
assert.match(runner, /Object\.hasOwn\(formats, formatSlug\)/);
assert.match(runner, /\^\[0-9a-f\]\{32\}\$/);
assert.match(runner, /escapeHtml/);
assert.match(runner, /data-composition-src/);
assert.match(contract, /release:\$\{marker\}:start/);

console.log('Render queue runner contract passed: fixed args, no shell/network input, escaped copy and bounded job path.');
