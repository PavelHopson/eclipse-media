// Fresh, isolated Edge profiles; synthetic fixtures only. No server writes or external requests.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.ANURA_PLAYWRIGHT_PATH);
const base = process.env.ECLIPSE_MEDIA_QA_BASE || 'http://127.0.0.1:4192';
assert.ok(['http://127.0.0.1:4192', 'https://media.eclipse-forge.ru'].includes(base));
const output = path.resolve(__dirname, '../.runtime/local-projects-20260906', base.startsWith('https:') ? 'production' : '.');
const checks = [], errors = [], external = [], mutations = [], badResponses = [];
const firstId = '00000000-0000-4000-8000-000000000001';
const toolbar = (p) => p.locator('.project-files');
const modal = (p) => p.getByRole('dialog');
const select = (p) => toolbar(p).getByRole('combobox', { name: 'Текущий проект', exact: true });
const research = (p) => p.locator('.research-workspace');
const claim = (p) => research(p).getByRole('textbox', { name: 'Тезис своими словами', exact: true });
const nav = (p, name) => p.getByRole('navigation', { name: 'Раздел Eclipse Media' }).getByRole('button', { name, exact: true });
async function ready(p) { await select(p).waitFor(); await p.waitForFunction(() => !document.querySelector('.project-picker select')?.disabled); }
async function open(p) { await p.goto(base + '/?workspace=intake&intakeMode=research'); await ready(p); }
async function saved(p, kind = 'research') { await p.locator((kind === 'research' ? '.research-workspace' : '.beat-planner') + ' .draft-status [role=status]').filter({ hasText: 'Сохранено на устройстве' }).waitFor(); }
async function choose(p, raw, name = 'Перенос.json') { await toolbar(p).locator('input[type=file]').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(raw) }); }
async function download(p) {
  const pending = p.waitForEvent('download'); await toolbar(p).getByRole('button', { name: 'Скачать проект', exact: true }).click();
  const file = await pending; return JSON.parse(await fs.readFile(await file.path(), 'utf8'));
}
async function named(p, button, name, submit = 'Создать проект') {
  await toolbar(p).getByRole('button', { name: button, exact: true }).click();
  await modal(p).getByRole('textbox', { name: 'Название проекта', exact: true }).fill(name);
  await modal(p).getByRole('button', { name: submit, exact: true }).click(); await modal(p).waitFor({ state: 'hidden' }); await ready(p);
}
async function switchTo(p, id) { await select(p).selectOption(id); await ready(p); assert.equal(await select(p).inputValue(), id); }
async function imported(p, raw) { await choose(p, raw); await modal(p).getByRole('button', { name: 'Добавить и открыть', exact: true }).click(); await modal(p).waitFor({ state: 'hidden' }); await ready(p); }
async function rows(p) {
  return p.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('eclipse-media-drafts', 1); open.onerror = () => reject(new Error('QA store unavailable'));
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction('drafts', 'readonly'), store = tx.objectStore('drafts');
      const keys = store.getAllKeys(), values = store.getAll();
      tx.oncomplete = () => { db.close(); resolve(Object.fromEntries(keys.result.map((key, i) => [key, values.result[i]]))); };
    };
  }));
}
async function noOverflow(p) {
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  if (await modal(p).count()) assert.ok(await modal(p).evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
}
async function context(browser, width = 1440) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 1000 }, reducedMotion: width < 600 ? 'reduce' : 'no-preference' });
  await ctx.route('**/*', (route) => {
    const req = route.request(), url = new URL(req.url());
    if (!['GET', 'HEAD'].includes(req.method())) { mutations.push(url.pathname); return route.abort(); }
    if (url.origin !== base && !['data:', 'blob:'].includes(url.protocol)) { external.push(url.origin); return route.abort(); }
    return route.continue();
  });
  ctx.on('page', (p) => {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('response', (r) => { if (r.status() >= 400) badResponses.push({ path: new URL(r.url()).pathname, status: r.status() }); });
    p.on('dialog', (d) => d.accept());
  });
  return ctx;
}
async function seed(p) {
  await research(p).getByRole('button', { name: 'Открыть пример', exact: true }).click();
  await research(p).getByRole('button', { name: 'Выбрать фрагмент cue-1', exact: true }).click();
  await claim(p).fill('Незаконченный тезис');
  await research(p).getByRole('combobox', { name: 'Проверка тезиса', exact: true }).selectOption('confirmed');
  await research(p).getByRole('textbox', { name: 'Источник подтверждения', exact: true }).fill('https://');
  await saved(p); await nav(p, 'Бит-карта').click();
  await p.getByRole('button', { name: 'Открыть пример', exact: true }).click();
  await p.getByRole('textbox', { name: 'Название сцены', exact: true }).first().fill('Сцена для переноса');
  await p.getByRole('textbox', { name: 'Наблюдаемое действие', exact: true }).fill('');
  await p.getByRole('combobox', { name: 'Персонаж во всём плане', exact: true }).selectOption('consented');
  await saved(p, 'beats'); const data = await download(p); await nav(p, 'План').click(); return data;
}
(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ANURA_BROWSER_PATH });
  try {
    let fixture;
    for (const width of [1440, 390, 320]) {
      const ctx = await context(browser, width), p = await ctx.newPage(); await open(p);
      const data = await seed(p); fixture = data;
      await named(p, 'Переименовать', 'Музыкальный клип', 'Сохранить название');
      await named(p, 'Создать копию', 'Клип: другая версия'); const copy = await select(p).inputValue();
      assert.notEqual(copy, firstId); assert.equal(await claim(p).inputValue(), 'Незаконченный тезис');
      await claim(p).fill('Изменение только в копии');
      await named(p, 'Новый проект', 'Чистый проект'); const blank = await select(p).inputValue();
      assert.equal(await claim(p).count(), 0);
      await switchTo(p, firstId); assert.equal(await claim(p).inputValue(), 'Незаконченный тезис');
      const backup = await download(p); assert.deepEqual(backup.research, data.research); assert.deepEqual(backup.beats, data.beats);
      await switchTo(p, copy); assert.equal(await claim(p).inputValue(), 'Изменение только в копии');
      await switchTo(p, blank); const beforeCancel = await rows(p);
      await choose(p, JSON.stringify(data)); await modal(p).waitFor();
      assert.match(await modal(p).innerText(), /отдельный проект/);
      for (let i = 0; i < 8; i++) { await p.keyboard.press('Tab'); assert.equal(await p.evaluate(() => !!document.activeElement.closest('dialog')), true); }
      await noOverflow(p); await p.screenshot({ path: path.join(output, 'import-' + width + '.png'), animations: 'disabled' });
      await p.keyboard.press('Escape'); await modal(p).waitFor({ state: 'hidden' }); assert.deepEqual(await rows(p), beforeCancel);
      await imported(p, JSON.stringify(data)); const importedId = await select(p).inputValue();
      assert.equal(await select(p).locator('option').count(), 4); assert.equal(await claim(p).inputValue(), 'Незаконченный тезис');
      assert.equal(await research(p).getByRole('button', { name: 'Скачать разбор', exact: true }).isEnabled(), false);
      assert.equal(await research(p).getByRole('checkbox', { name: 'У меня есть право обработать эти субтитры', exact: true }).isChecked(), false);
      await p.reload(); await ready(p); assert.equal(await select(p).inputValue(), importedId);
      const restored = await download(p); assert.deepEqual(restored.research, data.research); assert.deepEqual(restored.beats, data.beats);
      await nav(p, 'Бит-карта').click();
      assert.equal(await p.getByRole('textbox', { name: 'Название сцены', exact: true }).first().inputValue(), 'Сцена для переноса');
      assert.equal(await p.getByRole('textbox', { name: 'Наблюдаемое действие', exact: true }).inputValue(), '');
      assert.equal(await p.getByRole('button', { name: 'Скачать режиссуру', exact: true }).isEnabled(), false);
      await noOverflow(p); await p.evaluate(() => scrollTo(0, 0)); await p.screenshot({ path: path.join(output, 'projects-' + width + '.png'), animations: 'disabled' });
      checks.push({ width, createRenameDuplicateSwitchImport: true, originalPreserved: true, reloadTabSelection: true, focusEscape: true, partialExportsStillBlocked: true, responsive: true });
      await ctx.close();
    }
    const raw = JSON.stringify(fixture);
    const ctx = await context(browser), p = await ctx.newPage(); await open(p); await imported(p, raw);
    const original = await select(p).inputValue(), before = await rows(p);
    for (const [name, invalid] of [['broken.json', '{bad'], ['big.json', ' '.repeat(4 * 1024 * 1024 + 1)],
      ['schema.json', raw.replace('eclipse.media-project.v1', 'future.v9')], ['unsafe.json', raw.replace('"research":{', '"research":{"__proto__":{},')],
      ['binary.json', Buffer.from([0xc3, 0x28])], ['wrong.exe', raw]]) {
      await choose(p, invalid, name); await toolbar(p).getByRole('alert').waitFor(); assert.deepEqual(await rows(p), before);
      assert.equal(await select(p).inputValue(), original); assert.equal(await modal(p).count(), 0);
    }
    checks.push({ malformedImportsPreserveEverything: true });
    await p.evaluate(() => {
      window.qaOriginalPut = IDBObjectStore.prototype.put; let count = 0;
      IDBObjectStore.prototype.put = function (...args) { if (++count === 2) throw new DOMException('QA quota', 'QuotaExceededError'); return window.qaOriginalPut.apply(this, args); };
    });
    await choose(p, raw); await modal(p).getByRole('button', { name: 'Добавить и открыть', exact: true }).click();
    await modal(p).getByRole('alert').waitFor(); assert.deepEqual(await rows(p), before); assert.equal(await select(p).inputValue(), original);
    await p.evaluate(() => { IDBObjectStore.prototype.put = window.qaOriginalPut; delete window.qaOriginalPut; });
    await modal(p).getByRole('button', { name: 'Добавить и открыть', exact: true }).click(); await modal(p).waitFor({ state: 'hidden' }); await ready(p);
    checks.push({ actualIndexedDbSecondPutRollback: true, retry: true });

    const b = await ctx.newPage(); await open(b); assert.equal(await select(b).inputValue(), firstId);
    const count = await select(b).locator('option').count(); await named(p, 'Новый проект', 'Вкладка А');
    await b.waitForFunction((count) => document.querySelector('.project-picker select').options.length > count, count);
    assert.equal(await select(b).inputValue(), firstId);
    await toolbar(b).getByRole('button', { name: 'Переименовать', exact: true }).click();
    await switchTo(p, firstId); await named(p, 'Переименовать', 'Имя из другой вкладки', 'Сохранить название');
    await b.waitForFunction(() => document.querySelector('.project-picker select').selectedOptions[0].textContent === 'Имя из другой вкладки');
    await modal(b).getByRole('button', { name: 'Сохранить название', exact: true }).click();
    await modal(b).getByRole('alert').filter({ hasText: 'Название изменилось' }).waitFor();
    await modal(b).getByRole('button', { name: 'Отмена', exact: true }).click();
    await switchTo(b, original); await switchTo(p, original);
    await claim(p).fill('Из вкладки А'); await saved(p);
    await b.locator('.draft-status [role=status]').filter({ hasText: 'другой вкладке' }).waitFor();
    await toolbar(b).getByRole('button', { name: 'Новый проект', exact: true }).click();
    await modal(b).getByRole('button', { name: 'Создать проект', exact: true }).click();
    await modal(b).getByRole('alert').waitFor(); assert.equal(await select(b).inputValue(), original);
    await modal(b).getByRole('button', { name: 'Отмена', exact: true }).click();
    await b.getByRole('button', { name: 'Загрузить сохранённый', exact: true }).click();
    await b.waitForFunction(() => document.querySelector('.research-note textarea')?.value === 'Из вкладки А');
    assert.equal(await claim(b).inputValue(), 'Из вкладки А');
    checks.push({ tabSelectionIndependent: true, catalogUpdates: true, sameProjectConflictBlocksSwitch: true, staleRenameDialogProtected: true });
    await b.close(); await ctx.close();

    const offCtx = await context(browser), off = await offCtx.newPage(); await open(off); await imported(off, raw);
    const offId = await select(off).inputValue();
    await research(off).getByRole('checkbox', { name: 'Сохранять на этом устройстве', exact: true }).uncheck();
    await research(off).locator('.draft-status [role=status]').filter({ hasText: 'Автосохранение выключено' }).waitFor();
    await named(off, 'Создать копию', 'Без записи текста'); const offCopy = await select(off).inputValue();
    assert.equal(await claim(off).inputValue(), 'Незаконченный тезис');
    const offRows = await rows(off); assert.equal(JSON.parse(offRows['project:' + offCopy + ':research']).data.loaded, null);
    await switchTo(off, offId); assert.equal(await claim(off).inputValue(), 'Незаконченный тезис');
    await switchTo(off, offCopy); await off.reload(); await ready(off); assert.equal(await claim(off).count(), 0);
    checks.push({ offInherited: true, offContentOnlyInMemory: true, reloadClearsOffContent: true }); await offCtx.close();

    const memCtx = await context(browser); await memCtx.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('QA blocked', 'SecurityError'); } }); });
    const mem = await memCtx.newPage(); await mem.goto(base + '/?workspace=intake&intakeMode=research');
    await toolbar(mem).getByRole('button', { name: 'Проекты без сохранения', exact: true }).click();
    await ready(mem); await imported(mem, raw); assert.equal(await claim(mem).inputValue(), 'Незаконченный тезис');
    const memoryBackup = await download(mem); assert.deepEqual(memoryBackup.research, fixture.research);
    await named(mem, 'Новый проект', 'Ещё один в памяти'); assert.equal(await claim(mem).count(), 0);
    checks.push({ unavailableStorageMemoryProjects: true, memoryImportDownload: true }); await memCtx.close();

    const xssCtx = await context(browser), xss = await xssCtx.newPage(); await open(xss);
    const evil = structuredClone(fixture); evil.research.notes[0].claim = '<img src=x onerror=alert(1)>';
    await imported(xss, JSON.stringify(evil));
    await named(xss, 'Переименовать', '<img src=x onerror=alert(1)>', 'Сохранить название');
    assert.equal(await claim(xss).inputValue(), evil.research.notes[0].claim); assert.equal(await toolbar(xss).locator('img').count(), 0);
    assert.deepEqual(await xss.evaluate(() => [...document.querySelectorAll('img[src="x"]')].length), 0);
    checks.push({ untrustedNamesAndImportedTextInert: true }); await xssCtx.close();
    const legacyCtx = await context(browser), legacy = await legacyCtx.newPage(); await open(legacy);
    await legacy.evaluate((data) => new Promise((resolve, reject) => {
      const open = indexedDB.open('eclipse-media-drafts', 1); open.onerror = () => reject(new Error('QA setup'));
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction('drafts', 'readwrite'), store = tx.objectStore('drafts');
        for (const kind of ['research', 'beats']) store.put(JSON.stringify({ schema: 'eclipse.local-draft.v1', kind,
          revision: crypto.randomUUID(), updatedAt: Date.now(), enabled: true, data: data[kind] }), kind);
        store.delete('project-catalog-v1'); tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(new Error('QA setup abort'));
      };
    }), fixture);
    const oldRows = await rows(legacy); await legacy.reload(); await ready(legacy);
    assert.equal(await select(legacy).inputValue(), firstId); assert.equal(await select(legacy).locator('option').count(), 1);
    const adopted = await rows(legacy); assert.equal(adopted.research, oldRows.research); assert.equal(adopted.beats, oldRows.beats);
    assert.equal(await claim(legacy).inputValue(), fixture.research.notes[0].claim);
    await legacy.evaluate(() => new Promise((resolve) => {
      const open = indexedDB.open('eclipse-media-drafts', 1); open.onsuccess = () => {
        const db = open.result, tx = db.transaction('drafts', 'readwrite'); tx.objectStore('drafts').put('{broken', 'project-catalog-v1');
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    }));
    await legacy.reload(); await toolbar(legacy).getByRole('alert').filter({ hasText: 'Каталог проектов повреждён' }).waitFor();
    assert.equal((await rows(legacy))['project-catalog-v1'], '{broken');
    const rescued = await download(legacy); assert.deepEqual(rescued.research, fixture.research);
    checks.push({ legacyDataAdoptedWithoutRewrite: true, corruptCatalogRetained: true, firstProjectBackupStillAvailable: true }); await legacyCtx.close();
    assert.deepEqual(errors, []); assert.deepEqual(badResponses, []); assert.deepEqual(external, []); assert.deepEqual(mutations, []);
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ base, checks, errors, badResponses, external, mutations }, null, 2));
    console.log(JSON.stringify({ checks, errors, badResponses, external, mutations, output }));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
