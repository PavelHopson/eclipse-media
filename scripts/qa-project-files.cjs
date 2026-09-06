// Isolated Edge QA. Uses synthetic data and blocks all network mutations. Production requires an explicit base.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.ANURA_PLAYWRIGHT_PATH);
const base = process.env.ECLIPSE_MEDIA_QA_BASE || 'http://127.0.0.1:4192';
assert.ok(['http://127.0.0.1:4192', 'https://media.eclipse-forge.ru'].includes(base));
const output = path.resolve(__dirname, '../.runtime/project-files-20260906', base.startsWith('https:') ? 'production' : '.');
const checks = [], errors = [], external = [], mutations = [], badResponses = [];
const toolbar = (p) => p.locator('.project-files');
const modal = (p) => p.getByRole('dialog', { name: 'Открыть проект?' });
const research = (p) => p.locator('.research-workspace');
const claim = (p) => research(p).getByRole('textbox', { name: 'Тезис своими словами', exact: true });
const nav = (p, name) => p.getByRole('navigation', { name: 'Раздел Eclipse Media' }).getByRole('button', { name, exact: true });
async function ready(p) { await toolbar(p).getByRole('button', { name: 'Открыть проект', exact: true }).waitFor(); await p.waitForFunction(() => ![...document.querySelectorAll('.project-files button')].find((el) => el.textContent === 'Открыть проект')?.disabled); }
async function saved(p, kind = 'research') { await p.locator((kind === 'research' ? '.research-workspace' : '.beat-planner') + ' .draft-status [role=status]').filter({ hasText: 'Сохранено на устройстве' }).waitFor(); }
async function choose(p, raw, name = 'eclipse-media-project.json') {
  await toolbar(p).locator('input[type=file]').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(raw) });
}
async function download(p, locator = toolbar(p)) {
  const event = p.waitForEvent('download');
  await locator.getByRole('button', { name: 'Скачать проект', exact: true }).click();
  const file = await event;
  assert.match(file.suggestedFilename(), /^eclipse-media-project-\d{4}-\d{2}-\d{2}\.json$/);
  return fs.readFile(await file.path(), 'utf8');
}
async function rows(p) {
  return p.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('eclipse-media-drafts', 1);
    open.onerror = () => reject(new Error('Cannot open QA store'));
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction('drafts', 'readonly'), store = tx.objectStore('drafts');
      const r = store.get('research'), b = store.get('beats');
      tx.oncomplete = () => { db.close(); resolve({ research: r.result || null, beats: b.result || null }); };
    };
  }));
}
async function noOverflow(p) {
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  if (await modal(p).count()) assert.ok(await modal(p).evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
}
async function newContext(browser, width = 1440) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 1000 }, reducedMotion: width < 600 ? 'reduce' : 'no-preference' });
  await ctx.route('**/*', (route) => {
    const req = route.request(), url = new URL(req.url());
    if (!['GET', 'HEAD'].includes(req.method())) { mutations.push(url.pathname); return route.abort(); }
    if (url.origin !== base && !['data:', 'blob:'].includes(url.protocol)) { external.push(url.origin); return route.abort(); }
    return route.continue();
  });
  ctx.on('page', (p) => {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('response', (r) => { if (r.status() >= 400) badResponses.push({ url: r.url(), status: r.status() }); });
    p.on('dialog', (d) => d.accept());
  });
  return ctx;
}
async function open(p) { await p.goto(base + '/?workspace=intake&intakeMode=research'); await ready(p); }
async function restore(p, raw) {
  await choose(p, raw); await modal(p).waitFor();
  await modal(p).getByRole('button', { name: 'Заменить и открыть', exact: true }).click();
  await modal(p).waitFor({ state: 'hidden' });
  await toolbar(p).getByRole('status').filter({ hasText: 'Проект открыт' }).waitFor();
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ANURA_BROWSER_PATH });
  try {
    const seed = await newContext(browser), p = await seed.newPage(); await open(p);
    assert.equal(await toolbar(p).getByRole('button', { name: 'Скачать проект' }).isEnabled(), false);
    await research(p).getByRole('button', { name: 'Открыть пример', exact: true }).click();
    await research(p).getByRole('button', { name: 'Выбрать фрагмент cue-1', exact: true }).click();
    await claim(p).fill('Незаконченный тезис');
    await research(p).getByRole('combobox', { name: 'Проверка тезиса', exact: true }).selectOption('confirmed');
    await research(p).getByRole('textbox', { name: 'Источник подтверждения', exact: true }).fill('https://');
    await saved(p);
    await nav(p, 'Бит-карта').click();
    await p.getByRole('button', { name: 'Открыть пример', exact: true }).click();
    await p.getByRole('textbox', { name: 'Название сцены', exact: true }).first().fill('Сцена для переноса');
    await p.getByRole('textbox', { name: 'Наблюдаемое действие', exact: true }).fill('');
    await p.getByRole('combobox', { name: 'Персонаж во всём плане', exact: true }).selectOption('consented');
    await saved(p, 'beats');
    const raw = await download(p), project = JSON.parse(raw);
    assert.equal(project.research.notes[0].claim, 'Незаконченный тезис');
    assert.equal(project.beats.direction.edits['scene-1'].action, '');
    assert.deepEqual(Object.keys(project), ['schema', 'exportedAt', 'research', 'beats']);
    checks.push({ downloadBothWorkspaces: true, partialFields: true });
    await seed.close();

    for (const width of [1440, 390, 320]) {
      const ctx = await newContext(browser, width), page = await ctx.newPage(); await open(page);
      await choose(page, raw); await modal(page).waitFor();
      assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Отмена');
      assert.match(await modal(page).innerText(), /3 \/ 1/);
      assert.match(await modal(page).innerText(), /Аудио и видео не включены/);
      for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => !!document.activeElement.closest('dialog')), true); }
      await noOverflow(page);
      await page.screenshot({ path: path.join(output, 'preview-' + width + '.png'), animations: 'disabled' });
      await page.keyboard.press('Escape'); await modal(page).waitFor({ state: 'hidden' });
      assert.deepEqual(await rows(page), { research: null, beats: null });
      await restore(page, raw);
      assert.equal(await claim(page).inputValue(), 'Незаконченный тезис');
      assert.equal(await research(page).getByRole('button', { name: 'Скачать разбор', exact: true }).isEnabled(), false);
      assert.equal(await research(page).getByRole('checkbox', { name: 'У меня есть право обработать эти субтитры', exact: true }).isChecked(), false);
      await page.reload(); await ready(page);
      assert.equal(await claim(page).inputValue(), 'Незаконченный тезис');
      // The other workspace has not been visited in this profile yet, but must be in the new backup.
      const again = JSON.parse(await download(page));
      assert.deepEqual(again.research, project.research); assert.deepEqual(again.beats, project.beats);
      await nav(page, 'Бит-карта').click();
      assert.equal(await page.getByRole('textbox', { name: 'Название сцены', exact: true }).first().inputValue(), 'Сцена для переноса');
      assert.equal(await page.getByRole('textbox', { name: 'Наблюдаемое действие', exact: true }).inputValue(), '');
      assert.equal(await page.getByRole('button', { name: 'Скачать режиссуру', exact: true }).isEnabled(), false);
      await noOverflow(page); await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: path.join(output, 'restored-' + width + '.png'), animations: 'disabled' });
      checks.push({ width, freshProfileRestore: true, escapeAndFocusTrap: true, reload: true, unvisitedWorkspaceBackedUp: true, responsive: true });
      await ctx.close();
    }

    const ctx = await newContext(browser), page = await ctx.newPage(); await open(page); await restore(page, raw);
    const before = await rows(page);
    for (const [name, invalid] of [['broken.json', '{bad'], ['big.json', ' '.repeat(4 * 1024 * 1024 + 1)],
      ['schema.json', raw.replace('eclipse.media-project.v1', 'other.v9')],
      ['unsafe.json', raw.replace('"research":{', '"research":{"__proto__":{},')],
      ['binary.json', Buffer.from([0xc3, 0x28])], ['wrong.exe', raw]]) {
      await choose(page, invalid, name);
      await toolbar(page).getByRole('alert').waitFor();
      assert.deepEqual(await rows(page), before);
      assert.equal(await claim(page).inputValue(), 'Незаконченный тезис');
      assert.equal(await modal(page).count(), 0);
    }
    await choose(page, raw); await modal(page).waitFor();
    const backup = JSON.parse(await download(page, modal(page)));
    assert.deepEqual(backup.research, project.research);
    await modal(page).getByRole('button', { name: 'Отмена', exact: true }).click();
    // Fail the SECOND put: the first put is queued, but transaction.abort must undo it.
    await page.evaluate(() => {
      window.qaPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) { if (this.name === 'drafts' && args[1] === 'beats') throw new DOMException('QA quota', 'QuotaExceededError'); return window.qaPut.apply(this, args); };
    });
    await choose(page, raw); await modal(page).waitFor();
    await modal(page).getByRole('button', { name: 'Заменить и открыть', exact: true }).click();
    await modal(page).getByRole('alert').waitFor();
    assert.deepEqual(await rows(page), before); assert.equal(await claim(page).inputValue(), 'Незаконченный тезис');
    await page.evaluate(() => { IDBObjectStore.prototype.put = window.qaPut; });
    await modal(page).getByRole('button', { name: 'Заменить и открыть', exact: true }).click(); await modal(page).waitFor({ state: 'hidden' });
    checks.push({ invalidFilesPreserveWork: true, preReplacementBackup: true, secondPutRollback: true, retry: true });

    // Another tab changes the stored draft while a valid preview is open.
    const second = await ctx.newPage(); await open(second);
    await choose(page, raw); await modal(page).waitFor();
    await claim(second).fill('Из другой вкладки'); await saved(second);
    await modal(page).getByRole('button', { name: 'Заменить и открыть', exact: true }).click();
    await modal(page).getByRole('alert').waitFor();
    assert.equal(JSON.parse((await rows(page)).research).data.notes[0].claim, 'Из другой вкладки');
    assert.equal(await claim(page).inputValue(), 'Незаконченный тезис');
    await modal(page).getByRole('button', { name: 'Отмена', exact: true }).click();
    await second.close(); await page.reload(); await ready(page);
    // The toolbar and workspace share a controller: unmounting either must not break notifications.
    await page.locator('.research-workspace .draft-status input[type=checkbox]').uncheck();
    await page.locator('.research-workspace .draft-status [role=status]').filter({ hasText: 'Автосохранение выключено' }).waitFor();
    await restore(page, raw);
    assert.equal(await claim(page).inputValue(), 'Незаконченный тезис');
    assert.equal(await page.locator('.research-workspace .draft-status input[type=checkbox]').isChecked(), false);
    assert.equal(JSON.parse((await rows(page)).research).data.loaded, null);
    await page.reload(); await ready(page); assert.equal(await claim(page).count(), 0);
    checks.push({ otherTabConflict: true, autosavePreferencePreserved: true, disabledContentNotPersisted: true });
    await ctx.close();

    const inert = await newContext(browser), literalPage = await inert.newPage(); await open(literalPage);
    const literal = JSON.parse(raw);
    literal.research.loaded.transcript.cues[0].text = '<img src="https://invalid.example/x" onerror="window.pwned=1">';
    literal.research.loaded.fileName = '<svg onload=alert(1)>.vtt';
    literal.research.notes[0].claim = '<script>alert(1)</script>';
    await restore(literalPage, JSON.stringify(literal));
    assert.match(await research(literalPage).locator('.research-cues').innerText(), /onerror/);
    assert.equal(await research(literalPage).locator('.research-cues img').count(), 0);
    assert.equal(await literalPage.evaluate(() => window.pwned), undefined);
    await inert.close();
    checks.push({ importedHtmlInert: true });
    const memory = await newContext(browser);
    await memory.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { configurable: true, get() { throw new DOMException('QA unavailable', 'SecurityError'); } }); });
    const memoryPage = await memory.newPage();
    await memoryPage.goto(base + '/?workspace=intake&intakeMode=research');
    await research(memoryPage).getByRole('button', { name: 'Продолжить без сохранения', exact: true }).click();
    await nav(memoryPage, 'Бит-карта').click();
    await memoryPage.locator('.beat-planner').getByRole('button', { name: 'Продолжить без сохранения', exact: true }).click();
    await ready(memoryPage); await restore(memoryPage, raw);
    assert.equal(await memoryPage.getByRole('textbox', { name: 'Название сцены', exact: true }).first().inputValue(), 'Сцена для переноса');
    await nav(memoryPage, 'План').click();
    assert.equal(await claim(memoryPage).inputValue(), 'Незаконченный тезис');
    assert.deepEqual(JSON.parse(await download(memoryPage)).beats, project.beats);
    await memory.close(); checks.push({ memoryOnlyImportAndBackup: true });
    assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(mutations, []); assert.deepEqual(badResponses, []);
    const result = { base, checks, errors, external, mutations, badResponses };
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
