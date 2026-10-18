// Only synthetic local project state; disposable Edge profile; all network mutations blocked.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.ECLIPSE_PLAYWRIGHT_PATH);
const base = 'http://127.0.0.1:4192';
const out = path.resolve(__dirname, '../.runtime/tools-adoption-20260910');
const errors = [], mutations = [], external = [], checks = [];
(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.ECLIPSE_BROWSER_PATH, headless: true });
  try {
    for (const width of [1440, 390, 320]) {
      const ctx = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion: width < 600 ? 'reduce' : 'no-preference' });
      await ctx.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (!['GET', 'HEAD'].includes(request.method())) { mutations.push(url.pathname); return route.abort(); }
        if (url.origin !== base && !['data:', 'blob:'].includes(url.protocol)) { external.push(url.origin); return route.abort(); }
        if (url.pathname === '/api/local-edit/capability') return route.fulfill({ json: { ok: true, data: { enabled: false, ready: false, mode: 'preview-only', profile: 'mp4-h264-aac-720p-v1', maxSourceBytes: 62914560, maxSourceMs: 300000, maxClipMs: 60000, reason: 'qa-local-preview' } } });
        if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, json: { error: 'Local UI QA: API disabled' } });
        return route.continue();
      });
      const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
      await p.goto(base + '/?workspace=storyboard');
      await p.waitForFunction(() => { const select = document.querySelector('.project-picker select'); return select && !select.disabled; });
      await p.getByRole('button', { name: 'Добавить сцену', exact: true }).click();
      const scenes = p.locator('.story-scene');
      await scenes.first().getByRole('textbox', { name: 'Название сцены', exact: true }).fill('Моя исходная сцена');
      const template = p.locator('.storyboard-template'); await template.locator('summary').click();
      await template.getByRole('textbox', { name: 'О каком продукте ролик' }).fill('Eclipse Library');
      await template.getByRole('button', { name: 'Добавить 4 сцены', exact: true }).click();
      assert.equal(await scenes.count(), 5);
      assert.equal(await template.getByRole('button', { name: 'Добавить 4 сцены', exact: true }).isDisabled(), true);
      const durations = await scenes.getByRole('spinbutton', { name: 'Длительность, сек' }).evaluateAll(inputs => inputs.map(input => Number(input.value)));
      assert.equal(durations.slice(1).reduce((a, b) => a + b, 0), 30);
      await template.getByRole('button', { name: 'Отменить добавление шаблона', exact: true }).click();
      assert.equal(await scenes.count(), 1); assert.equal(await scenes.first().getByRole('textbox', { name: 'Название сцены', exact: true }).inputValue(), 'Моя исходная сцена');
      await template.getByRole('button', { name: 'Добавить 4 сцены', exact: true }).click();
      await scenes.nth(1).getByRole('textbox', { name: 'Действие в кадре', exact: true }).fill('Моя проверенная правка');
      assert.equal(await template.getByRole('button', { name: 'Отменить добавление шаблона', exact: true }).isDisabled(), true);
      await p.locator('.storyboard .draft-status [role=status]').filter({ hasText: 'Сохранено на устройстве' }).waitFor();
      await template.scrollIntoViewIfNeeded();
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await p.screenshot({ path: path.join(out, `storyboard-${width}.png`) });
      await p.reload(); await scenes.nth(4).waitFor();
      assert.equal(await scenes.nth(1).getByRole('textbox', { name: 'Действие в кадре', exact: true }).inputValue(), 'Моя проверенная правка');
      const download = p.waitForEvent('download');
      await p.locator('.project-files').getByRole('button', { name: 'Скачать проект', exact: true }).click();
      const payload = JSON.parse(await fs.readFile(await (await download).path(), 'utf8'));
      assert.equal(payload.schema, 'eclipse.media-project.v2'); assert.equal(payload.beats.storyboard.scenes.length, 5);
      checks.push({ width, reducedMotion: width < 600, fourScenes30Seconds: true, appendPreservesExisting: true, duplicateGuard: true, undo: true, editedSceneProtected: true, reloadPersistence: true, backupV2: true, noHorizontalOverflow: true });
      await ctx.close();
    }
    assert.deepEqual(errors, []); assert.deepEqual(mutations, []); assert.deepEqual(external, []);
    const result = { checks, errors, mutations, external };
    await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
