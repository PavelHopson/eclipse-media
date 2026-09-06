// Isolated Edge, synthetic text/video; all server mutations are blocked.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.ANURA_PLAYWRIGHT_PATH);
const base = process.env.ECLIPSE_MEDIA_QA_BASE || 'http://127.0.0.1:4192';
assert.ok(['http://127.0.0.1:4192', 'https://media.eclipse-forge.ru'].includes(base));
const out = path.resolve(__dirname, '../.runtime/storyboard-20260906', base.startsWith('https:') ? 'production' : 'local');
const fixture = path.resolve(__dirname, '../.runtime/storyboard-20260906/owned-test.mp4');
const checks = [], errors = [], badResponses = [], external = [], mutations = [];
const nav = (p, n) => p.getByRole('navigation', { name: 'Раздел Eclipse Media' }).getByRole('button', { name: n, exact: true });
const toolbar = p => p.locator('.project-files');
const picker = p => toolbar(p).getByRole('combobox', { name: 'Текущий проект' });
const scenes = p => p.locator('.story-scene');
const firstId = '00000000-0000-4000-8000-000000000001';
async function ready(p) { await p.waitForFunction(() => { const el = document.querySelector('.project-picker select'); return el && !el.disabled; }); }
async function seed(p) {
  await p.goto(base + '/?workspace=intake&intakeMode=research'); await ready(p);
  await p.getByRole('button', { name: 'Открыть пример', exact: true }).click();
  await p.getByRole('button', { name: 'Выбрать фрагмент cue-1' }).click();
  await p.getByRole('textbox', { name: 'Тезис своими словами' }).fill('Мастерская: от идеи к результату');
  await p.getByRole('button', { name: 'Создать сцену', exact: true }).click();
  await p.getByText('Сцена создана с тезисом и таймкодами.', { exact: false }).waitFor();
  await nav(p, 'Сценарий').click(); await scenes(p).first().waitFor();
}
async function saved(p) { await p.locator('.storyboard .draft-status [role=status]').filter({ hasText: 'Сохранено на устройстве' }).waitFor(); }
async function backup(p) {
  const pending = p.waitForEvent('download'); await toolbar(p).getByRole('button', { name: 'Скачать проект', exact: true }).click();
  return JSON.parse(await fs.readFile(await (await pending).path(), 'utf8'));
}
async function archive(p) {
  await toolbar(p).getByRole('button', { name: 'В корзину', exact: true }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Переместить в корзину', exact: true }).click();
  await p.getByRole('dialog').waitFor({ state: 'hidden' }); await ready(p);
}
async function context(browser, width = 1440) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 1000 }, reducedMotion: width < 600 ? 'reduce' : 'no-preference' });
  await ctx.route('**/*', route => {
    const req = route.request(), url = new URL(req.url());
    if (!['GET', 'HEAD'].includes(req.method())) { mutations.push(url.pathname); return route.abort(); }
    if (url.origin !== base && !['data:', 'blob:'].includes(url.protocol)) { external.push(url.origin); return route.abort(); }
    if (base.startsWith('http:') && url.pathname === '/api/local-edit/capability') return route.fulfill({ json: { ok: true, data: {
      enabled: false, ready: false, mode: 'preview-only', profile: 'mp4-h264-aac-720p-v1', maxSourceBytes: 62914560, maxSourceMs: 300000, maxClipMs: 60000, reason: 'qa-local-preview' } } });
    return route.continue();
  });
  ctx.on('page', p => { p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
    p.on('response', r => { if (r.status() >= 400) badResponses.push({ path: new URL(r.url()).pathname, status: r.status() }); }); });
  return ctx;
}
async function noOverflow(p) { assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'Horizontal overflow'); }
(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ANURA_BROWSER_PATH });
  try {
    for (const width of [1440, 390, 320]) {
      const ctx = await context(browser, width); const p = await ctx.newPage(); await seed(p);
      assert.equal(await scenes(p).count(), 1); assert.equal(await scenes(p).first().getByRole('button', { name: 'В безопасный монтаж' }).isDisabled(), true);
      const scene = scenes(p).first(); await scene.getByRole('textbox', { name: 'Музыка / звук' }).fill('Тишина');
      await scene.getByRole('textbox', { name: 'Действие в кадре' }).fill('Руки собирают изделие');
      await scene.getByRole('textbox', { name: 'Камера', exact: true }).fill('Статичный крупный план');
      await scene.getByRole('spinbutton', { name: 'Длительность, сек' }).fill('4.5'); await saved(p);
      await p.getByRole('button', { name: 'Добавить сцену', exact: true }).click();
      await scenes(p).nth(1).getByRole('textbox', { name: 'Название сцены' }).fill('Финальный кадр');
      await scenes(p).nth(1).getByRole('button', { name: 'Выше', exact: true }).click();
      assert.equal(await scenes(p).first().getByRole('textbox', { name: 'Название сцены' }).inputValue(), 'Финальный кадр');
      await scenes(p).first().getByRole('button', { name: 'Убрать сцену' }).click();
      await p.getByRole('button', { name: 'Вернуть сцену' }).click(); assert.equal(await scenes(p).count(), 2);
      await scenes(p).first().getByRole('button', { name: 'Убрать сцену' }).click();
      await saved(p); const exported = await backup(p); assert.equal(exported.schema, 'eclipse.media-project.v2');
      assert.equal(exported.beats.storyboard.scenes[0].theses[0].start, 0); assert.equal(exported.beats.storyboard.scenes[0].theses[0].end, 4);
      await noOverflow(p); await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({ path: path.join(out, 'story-' + width + '.png'), fullPage: true });
      await scene.getByRole('button', { name: 'В безопасный монтаж' }).click();
      await p.getByRole('heading', { name: 'Мастерская: от идеи к результату', exact: true }).waitFor();
      await p.getByRole('checkbox', { name: 'У меня есть право просмотреть этот файл' }).check();
      await p.getByLabel('Локальный MP4 для предпросмотра').setInputFiles(fixture);
      await p.getByRole('button', { name: 'Посмотреть выбранный фрагмент' }).waitFor();
      assert.equal(await p.getByRole('spinbutton', { name: 'Конец, сек', exact: true }).inputValue(), '4.5');
      await p.getByRole('button', { name: 'Посмотреть выбранный фрагмент' }).click();
      await p.waitForFunction(() => document.querySelector('video')?.currentTime > 0.1);
      await p.getByRole('spinbutton', { name: 'Конец, сек', exact: true }).fill('99');
      assert.equal(await p.getByRole('button', { name: 'Посмотреть выбранный фрагмент' }).isDisabled(), true);
      await p.getByRole('spinbutton', { name: 'Конец, сек', exact: true }).fill('4.5');
      assert.equal(await p.getByRole('button', { name: 'Экспорт доступен в desktop-приложении', exact: true }).isDisabled(), true);
      await noOverflow(p); await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({ path: path.join(out, 'preview-' + width + '.png'), fullPage: true });
      await p.getByLabel('Локальный MP4 для предпросмотра').setInputFiles({ name: 'fake.mp4', mimeType: 'video/mp4', buffer: Buffer.from('<html>not video at all</html>') });
      await p.getByRole('alert').filter({ hasText: 'не похоже на MP4' }).waitFor();
      assert.equal(await p.locator('video').count(), 1); // Previous valid preview is kept.
      await p.getByRole('button', { name: 'Вернуться к сценарию' }).click(); await scene.waitFor();
      await nav(p, 'План').click(); await p.getByRole('textbox', { name: 'Тезис своими словами' }).fill('Обновлённый тезис');
      await nav(p, 'Сценарий').click(); await p.getByText('Разбор изменён или удалён.', { exact: false }).waitFor();
      await p.reload(); await ready(p); assert.equal(await scenes(p).count(), 1);
      await archive(p); assert.notEqual(await picker(p).inputValue(), firstId);
      await toolbar(p).getByRole('button', { name: 'Корзина (1)', exact: true }).click();
      await toolbar(p).getByRole('button', { name: 'Восстановить «Первый проект»' }).click();
      await picker(p).selectOption(firstId); await ready(p); await scene.waitFor(); assert.equal(await scene.getByRole('textbox', { name: 'Музыка / звук' }).inputValue(), 'Тишина');
      await toolbar(p).locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
      await p.getByRole('dialog').getByRole('button', { name: 'Добавить и открыть', exact: true }).click();
      await p.getByRole('dialog').waitFor({ state: 'hidden' }); await ready(p); assert.equal(await scenes(p).count(), 1);
      const imported = await backup(p); assert.deepEqual(imported.beats, exported.beats);
      checks.push({ width, thesisScene: true, reorderUndo: true, sourceDrift: true, v2BackupImport: true, trashRestore: true, actualLocalVideo: true, unsafeVideoRejected: true, previewOnly: true });
      await ctx.close();
    }
    const ctx = await context(browser); const a = await ctx.newPage(); await seed(a); await saved(a);
    const b = await ctx.newPage(); await b.goto(base + '/?workspace=storyboard'); await ready(b); await scenes(b).first().waitFor();
    await archive(a); await b.getByRole('alert').filter({ hasText: 'перемещён в корзину другой вкладкой' }).waitFor();
    assert.equal(await b.locator('.storyboard').evaluate(el => !!el.closest('[inert]')), true);
    await picker(b).selectOption(await picker(a).inputValue()); await ready(b); assert.equal(await scenes(b).count(), 0);
    checks.push({ crossTabArchiveInert: true, switchAwayFromArchived: true }); await ctx.close();
    assert.deepEqual(errors, []); assert.deepEqual(badResponses, []); assert.deepEqual(external, []); assert.deepEqual(mutations, []);
    const result = { base, checks, errors, badResponses, external, mutations };
    await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
