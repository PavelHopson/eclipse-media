const assert = require('node:assert/strict');
const https = require('node:https');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const origin = 'https://media.eclipse-forge.ru';
const dist = path.resolve(__dirname, '../frontend/dist');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
function get(route) {
  return new Promise((resolve, reject) => {
    const request = https.get(origin + route, { headers: { 'Cache-Control': 'no-cache' } }, (response) => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error(route + ': HTTP ' + response.statusCode)); return; }
      const chunks = []; let length = 0;
      response.on('data', (chunk) => { length += chunk.length; if (length > 2 * 1024 * 1024) request.destroy(new Error('Response too large')); else chunks.push(chunk); });
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    });
    request.setTimeout(15000, () => request.destroy(new Error('Request timed out')));
    request.on('error', reject);
  });
}
(async () => {
  const localHtml = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
  const remoteHtml = (await get('/?workspace=intake&intakeMode=research')).toString('utf8');
  const names = (html) => [...html.matchAll(/(?:src|href)="(\/assets\/index-[a-zA-Z0-9_-]+\.(?:js|css))"/g)].map((item) => item[1]).sort();
  const expected = names(localHtml);
  assert.equal(expected.length, 2);
  assert.deepEqual(names(remoteHtml), expected);
  const assets = [];
  for (const name of [...expected, '/icon.svg']) {
    const live = await get(name); const local = await fs.readFile(path.join(dist, name.slice(1)));
    assert.equal(digest(live), digest(local), name);
    assets.push({ path: name, bytes: live.length, sha256: digest(live) });
  }
  const health = JSON.parse((await get('/api/health')).toString('utf8'));
  assert.equal(health.ok, true); assert.equal(health.version, '1.6.0'); assert.equal(health.desktop_session, false);
  assert.equal(health.local_edit, 'preview-only'); assert.equal(health.render_queue, 'preview-only');
  const report = { origin, verifiedAt: new Date().toISOString(), defaultDns: true, tlsVerification: true, assets, health };
  await fs.writeFile(path.join(__dirname, '../.runtime/storyboard-20260906/production-release.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
