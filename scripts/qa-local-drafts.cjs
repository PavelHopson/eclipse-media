// Isolated browser profile, synthetic fixtures, no server mutations. Production requires an explicit base.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.ANURA_PLAYWRIGHT_PATH);
const base = process.env.ECLIPSE_MEDIA_QA_BASE || 'http://127.0.0.1:4192';
assert.ok(['http://127.0.0.1:4192', 'https://media.eclipse-forge.ru'].includes(base));
const production = base.startsWith('https:');
const dnsAddress = production ? process.env.ECLIPSE_MEDIA_QA_DNS_ADDRESS : undefined;
if (dnsAddress) assert.ok(/^(?:\d{1,3}\.){3}\d{1,3}$/.test(dnsAddress) && dnsAddress.split('.').every((part) => +part <= 255));
const output = path.resolve(__dirname, '../.runtime/draft-autosave-20260906', production ? 'production' : '.');
const checks = [];
const errors = [];
const external = [];
const mutations = [];
const badResponses = [];
const research = (page) => page.locator('.research-workspace');
const bar = (page, kind = 'research') => page.locator(kind === 'research' ? '.research-workspace .draft-status' : '.beat-planner .draft-status');
const claim = (page) => research(page).getByRole('textbox', { name: 'Тезис своими словами', exact: true });
const action = (page) => page.getByRole('textbox', { name: 'Наблюдаемое действие', exact: true });
async function saved(page, kind = 'research') { await bar(page, kind).getByRole('status').filter({ hasText: 'Сохранено на устройстве' }).waitFor(); }
async function ready(page, kind = 'research') { await page.waitForFunction((kind) => !document.querySelector((kind === 'research' ? '.research-workspace' : '.beat-planner') + ' fieldset.draft-form')?.disabled, kind); }
async function row(page, kind) {
  return page.evaluate((kind) => new Promise((resolve, reject) => {
    const open = indexedDB.open('eclipse-media-drafts', 1);
    open.onerror = () => reject(new Error('open failed'));
    open.onsuccess = () => {
      const db = open.result; const tx = db.transaction('drafts', 'readonly'); const get = tx.objectStore('drafts').get(kind);
      tx.oncomplete = () => { db.close(); resolve(get.result ? JSON.parse(get.result) : null); }; tx.onabort = () => reject(new Error('read failed'));
    };
  }), kind);
}
async function openResearch(page) {
  await page.goto(base + '/?workspace=intake&intakeMode=research'); await ready(page);
  await research(page).getByRole('button', { name: 'Открыть пример', exact: true }).click();
  await research(page).getByRole('button', { name: 'Выбрать фрагмент cue-1', exact: true }).click();
  await claim(page).fill('Незаконченный тезис'); await saved(page);
}
async function noOverflow(page) {
  const layout = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(layout.scroll <= layout.width + 1, JSON.stringify(layout));
}
async function contextFor(browser, width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: width < 1000 ? 'reduce' : 'no-preference' });
  await context.route('**/*', (route) => {
    const request = route.request(); const url = new URL(request.url());
    if (!['GET', 'HEAD'].includes(request.method())) { mutations.push({ path: url.pathname, method: request.method() }); return route.abort(); }
    if (url.origin !== base && !['data:', 'blob:'].includes(url.protocol)) { external.push(url.origin); return route.abort(); }
    return route.continue();
  });
  context.on('page', (page) => {
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => { if (response.status() >= 400) badResponses.push({ path: new URL(response.url()).pathname, status: response.status() }); });
    page.on('dialog', (dialog) => dialog.accept());
  });
  return context;
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ANURA_BROWSER_PATH,
    args: dnsAddress ? ['--host-resolver-rules=MAP media.eclipse-forge.ru ' + dnsAddress] : [] });
  try {
    for (const width of [1440, 390, 320]) {
      const context = await contextFor(browser, width); const page = await context.newPage();
      await openResearch(page);
      await research(page).getByRole('combobox', { name: 'Проверка тезиса', exact: true }).selectOption('confirmed');
      await research(page).getByRole('textbox', { name: 'Источник подтверждения', exact: true }).fill('https://');
      await saved(page); await page.reload(); await ready(page);
      assert.match(page.url(), /intakeMode=research/); assert.equal(await research(page).isVisible(), true);
      assert.equal(await claim(page).inputValue(), 'Незаконченный тезис');
      assert.equal(await research(page).getByRole('textbox', { name: 'Источник подтверждения', exact: true }).inputValue(), 'https://');
      assert.equal(await research(page).getByRole('button', { name: 'Скачать разбор', exact: true }).isEnabled(), false);
      assert.equal(await research(page).getByRole('checkbox', { name: 'У меня есть право обработать эти субтитры', exact: true }).isChecked(), false);
      await bar(page).getByRole('button', { name: 'Удалить черновик', exact: true }).focus();
      assert.notEqual(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'none');
      await noOverflow(page); await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: path.join(output, 'research-' + width + '.png'), fullPage: true, animations: 'disabled' });
      await claim(page).fill('Перед сменой раздела');
      await page.getByRole('navigation', { name: 'Раздел Eclipse Media' }).getByRole('button', { name: 'Бит-карта', exact: true }).click();
      await ready(page, 'beats'); await page.getByRole('button', { name: 'Открыть пример', exact: true }).click();
      await action(page).fill('Смотрит в окно');
      await page.getByRole('textbox', { name: 'Название сцены', exact: true }).first().fill('Первая сцена');
      await page.getByRole('combobox', { name: 'Персонаж во всём плане', exact: true }).selectOption('consented');
      await page.getByRole('combobox', { name: 'Сцена для настройки', exact: true }).selectOption('scene-2');
      await action(page).fill(''); await saved(page, 'beats');
      await page.reload(); await ready(page, 'beats');
      assert.equal(await page.getByRole('combobox', { name: 'Сцена для настройки', exact: true }).inputValue(), 'scene-2');
      assert.equal(await action(page).inputValue(), '');
      assert.equal(await page.getByRole('textbox', { name: 'Название сцены', exact: true }).first().inputValue(), 'Первая сцена');
      assert.equal(await page.getByRole('button', { name: 'Скачать режиссуру', exact: true }).isEnabled(), false);
      await page.getByRole('combobox', { name: 'Сцена для настройки', exact: true }).selectOption('scene-1');
      assert.equal(await action(page).inputValue(), 'Смотрит в окно');
      const snapshot = await row(page, 'beats');
      assert.equal('audio' in snapshot.data, false); assert.equal('rightsConfirmed' in snapshot.data, false);
      await page.locator('.beat-rights input').check();
      await page.locator('#beat-audio-file').setInputFiles({ name: 'invalid.wav', mimeType: 'audio/wav', buffer: Buffer.from('not audio') });
      await page.locator('.beat-feedback [role=alert]').waitFor();
      assert.equal(await action(page).inputValue(), 'Смотрит в окно');
      assert.equal(await page.getByRole('textbox', { name: 'Название сцены', exact: true }).first().inputValue(), 'Первая сцена');
      await saved(page, 'beats'); await noOverflow(page); await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: path.join(output, 'beats-' + width + '.png'), animations: 'disabled' });
      await page.locator('.direction-planner').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, 'direction-' + width + '.png'), animations: 'disabled' });
      await bar(page, 'beats').getByRole('button', { name: 'Удалить черновик', exact: true }).click();
      await page.locator('.beat-empty').waitFor();
      await page.getByRole('navigation', { name: 'Раздел Eclipse Media' }).getByRole('button', { name: 'План', exact: true }).click();
      await ready(page); assert.equal(await claim(page).inputValue(), 'Перед сменой раздела');
      await bar(page).getByRole('checkbox').uncheck(); await bar(page).getByRole('status').filter({ hasText: 'Автосохранение выключено' }).waitFor();
      assert.equal(await claim(page).inputValue(), 'Перед сменой раздела');
      const stored = await row(page, 'research'); assert.equal(stored.enabled, false); assert.equal(stored.data.loaded, null); assert.deepEqual(stored.data.notes, []);
      await page.reload(); await ready(page); assert.equal(await research(page).locator('.research-note').count(), 0);
      assert.equal(await bar(page).getByRole('checkbox').isChecked(), false);
      assert.equal((await row(page, 'beats')).data.project, null);
      checks.push({ width, restorePartialResearch: true, restorePartialDirections: true, navigationFlush: true, badAudioPreservesDraft: true, clearScoped: true, offPurgesData: true, responsive: true, focusVisible: true });
      await context.close();
    }

    const context = await contextFor(browser); const first = await context.newPage();
    await openResearch(first); const second = await context.newPage();
    await second.goto(first.url()); await ready(second);
    await claim(first).fill('Версия первой вкладки'); await saved(first);
    await bar(second).getByRole('status').filter({ hasText: /другой вкладке/ }).waitFor();
    await claim(second).fill('Мой новый вариант');
    assert.equal((await row(first, 'research')).data.notes[0].claim, 'Версия первой вкладки');
    await bar(second).getByRole('button', { name: 'Сохранить мой вариант', exact: true }).click(); await saved(second);
    await bar(first).getByRole('button', { name: 'Загрузить сохранённый', exact: true }).click(); await ready(first);
    assert.equal(await claim(first).inputValue(), 'Мой новый вариант');
    await bar(first).getByRole('button', { name: 'Удалить черновик', exact: true }).click();
    await bar(second).getByRole('status').filter({ hasText: /другой вкладке/ }).waitFor();
    await claim(second).fill('Не должен воскреснуть');
    assert.equal((await row(first, 'research')).data.loaded, null);
    await bar(second).getByRole('button', { name: 'Загрузить сохранённый', exact: true }).click(); await ready(second);
    assert.equal(await research(second).locator('.research-note').count(), 0);
    checks.push({ twoTabs: true, explicitConflictResolution: true, deletedDraftNotResurrected: true });
    await context.close();

    const corruption = await contextFor(browser); const corruptPage = await corruption.newPage();
    await openResearch(corruptPage);
    await corruptPage.evaluate(() => new Promise((resolve) => {
      const open = indexedDB.open('eclipse-media-drafts', 1);
      open.onsuccess = () => { const db = open.result; const tx = db.transaction('drafts', 'readwrite'); tx.objectStore('drafts').put('{broken', 'research'); tx.oncomplete = () => { db.close(); resolve(); }; };
    }));
    await corruptPage.reload(); await bar(corruptPage).getByRole('status').filter({ hasText: 'не удалось восстановить' }).waitFor();
    assert.equal(await research(corruptPage).getByRole('button', { name: 'Открыть пример', exact: true }).isEnabled(), false);
    await bar(corruptPage).getByRole('button', { name: 'Удалить черновик', exact: true }).click(); await ready(corruptPage);
    await research(corruptPage).getByRole('button', { name: 'Открыть пример', exact: true }).click(); await saved(corruptPage);
    await corruptPage.evaluate(() => { window.originalDraftPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...args) { if (this.name === 'drafts') throw new DOMException('Simulated quota', 'QuotaExceededError'); return window.originalDraftPut.apply(this, args); }; });
    await research(corruptPage).getByRole('button', { name: 'Выбрать фрагмент cue-1', exact: true }).click();
    await claim(corruptPage).fill('Сохрани меня после ошибки');
    await bar(corruptPage).getByRole('status').filter({ hasText: 'Черновик не сохранён' }).waitFor();
    await corruptPage.evaluate(() => { IDBObjectStore.prototype.put = window.originalDraftPut; });
    await bar(corruptPage).getByRole('button', { name: 'Повторить сохранение', exact: true }).click(); await saved(corruptPage);
    await corruptPage.reload(); await ready(corruptPage); assert.equal(await claim(corruptPage).inputValue(), 'Сохрани меня после ошибки');
    checks.push({ corruptRecovery: true, quotaFailureVisible: true, retryRestoresEdits: true });
    await corruption.close();

    const unavailable = await contextFor(browser); await unavailable.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { configurable: true, get() { throw new DOMException('Disabled for QA', 'SecurityError'); } }); });
    const memoryPage = await unavailable.newPage(); await memoryPage.goto(base + '/?workspace=intake&intakeMode=research');
    await bar(memoryPage).getByRole('button', { name: 'Продолжить без сохранения', exact: true }).click(); await ready(memoryPage);
    await research(memoryPage).getByRole('button', { name: 'Открыть пример', exact: true }).click();
    await research(memoryPage).getByRole('button', { name: 'Выбрать фрагмент cue-1', exact: true }).click();
    await claim(memoryPage).fill('Только в памяти'); assert.equal(await bar(memoryPage).getByRole('checkbox').isChecked(), false);
    assert.equal(await research(memoryPage).getByRole('button', { name: 'Скачать разбор', exact: true }).isEnabled(), true);
    checks.push({ unavailableStorageStillUsable: true }); await unavailable.close();

    const largeContext = await contextFor(browser); const largePage = await largeContext.newPage();
    await openResearch(largePage);
    await research(largePage).getByRole('checkbox', { name: 'У меня есть право обработать эти субтитры', exact: true }).check();
    const time = (s) => String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') + '.000';
    const payload = Buffer.from('WEBVTT\n\n' + Array.from({ length: 2000 }, (_, i) => time(i * 2) + ' --> ' + time(i * 2 + 1) + '\n' + 'Тестовый фрагмент для локальной проверки. '.repeat(2) + '\n\n').join(''));
    assert.ok(payload.length < 512 * 1024);
    await research(largePage).locator('input[type=file]').setInputFiles({ name: 'qa-2000-cues.vtt', mimeType: 'text/vtt', buffer: payload });
    await research(largePage).getByText('qa-2000-cues.vtt · 2000 сегментов', { exact: true }).waitFor(); await saved(largePage);
    await research(largePage).getByRole('button', { name: 'Выбрать фрагмент cue-1', exact: true }).click();
    await largePage.evaluate(() => {
      window.draftLongTasks = []; window.draftWrites = 0;
      new PerformanceObserver((list) => { window.draftLongTasks.push(...list.getEntries().map((entry) => entry.duration)); }).observe({ type: 'longtask' });
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) { if (this.name === 'drafts') window.draftWrites++; return put.apply(this, args); };
    });
    await claim(largePage).pressSequentially('Быстрый набор без записи на каждый символ', { delay: 5 }); await saved(largePage);
    const performance = await largePage.evaluate(() => ({ writes: window.draftWrites, longTasks: window.draftLongTasks }));
    assert.ok(performance.writes <= 4, JSON.stringify(performance));
    await largePage.reload(); await ready(largePage);
    assert.equal(await claim(largePage).inputValue(), 'Быстрый набор без записи на каждый символ');
    assert.equal((await row(largePage, 'research')).data.loaded.transcript.cues.length, 2000);
    // Restored HTML is still literal text, never an element or a network request.
    await research(largePage).getByRole('checkbox', { name: 'У меня есть право обработать эти субтитры', exact: true }).check();
    await research(largePage).locator('input[type=file]').setInputFiles({ name: 'literal.vtt', mimeType: 'text/vtt', buffer: Buffer.from('WEBVTT\n\n00:00.000 --> 00:01.000\n<img src="https://invalid.example/x" onerror="window.pwned=1">') });
    await research(largePage).getByText('literal.vtt · 1 сегментов', { exact: true }).waitFor(); await saved(largePage);
    await largePage.reload(); await ready(largePage);
    assert.match(await research(largePage).locator('.research-cues').innerText(), /onerror/);
    assert.equal(await research(largePage).locator('.research-cues img').count(), 0);
    assert.equal(await largePage.evaluate(() => window.pwned), undefined);
    checks.push({ maxCues: 2000, importedBytes: payload.length, restoreLargeDraft: true, typingPerformance: performance, restoredHtmlInert: true });
    await largeContext.close();

    assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(mutations, []); assert.deepEqual(badResponses, []);
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ base, dnsAddress, checks, errors, external, mutations, badResponses }, null, 2));
    console.log(JSON.stringify({ base, scenarios: checks.length, checks, errors, external, mutations, badResponses }));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
