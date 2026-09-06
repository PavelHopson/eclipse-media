import { DraftController } from './draftController';
import { DRAFT_SCHEMA, emptyResearchDraft, emptyBeatDraft, validateResearchDraft, validateBeatDraft } from './draftContract';
import { DraftConflict, type ProjectRepository, type DraftWrite } from './draftStorage';
import { hasProjectContent, parseProjectFile, serializeProjectFile, type MediaProjectFile } from './projectFileContract';

export const CATALOG_KEY = 'project-catalog-v1';
export const FIRST_PROJECT_ID = '00000000-0000-4000-8000-000000000001';
export const ACTIVE_PROJECT_KEY = 'eclipse-media-active-project';
const SCHEMA = 'eclipse.local-projects.v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export interface LocalProject { id: string; title: string; createdAt: number; deletedAt?: number }
interface Catalog { schema: typeof SCHEMA; revision: string; projects: LocalProject[] }
type Phase = 'loading' | 'ready' | 'memory' | 'error';
export interface ProjectsSnapshot { projects: LocalProject[]; activeId: string; phase: Phase; busy: boolean; error: string; corrupt: boolean }
export function projectKey(id: string, kind: 'research' | 'beats') {
  if (!UUID.test(id)) throw new Error('Некорректный проект.');
  // Adopt existing keys, without copying, deleting or rewriting the user's old drafts.
  return id === FIRST_PROJECT_ID ? kind : 'project:' + id + ':' + kind;
}
export function projectTitle(value: string) {
  const title = value.trim();
  if (!title || title.length > 80 || /[\p{Cc}\p{Cf}]/u.test(title)) throw new Error('Название должно содержать от 1 до 80 символов без управляющих знаков.');
  return title;
}
export function parseCatalog(raw: string): Catalog {
  if (raw.length > 100000) throw new Error('Каталог проектов повреждён.');
  const value = JSON.parse(raw);
  const keys = (v: unknown, expected: string[]) => v && typeof v === 'object' && !Array.isArray(v) &&
    Object.keys(v).length === expected.length && expected.every((key) => Object.hasOwn(v, key));
  if (!keys(value, ['schema', 'revision', 'projects']) || value.schema !== SCHEMA || !UUID.test(value.revision) ||
    !Array.isArray(value.projects) || !value.projects.length || value.projects.length > 256) throw new Error('Каталог проектов повреждён.');
  const ids = new Set<string>();
  for (const p of value.projects) {
    if (!keys(p, Object.hasOwn(p, 'deletedAt') ? ['id', 'title', 'createdAt', 'deletedAt'] : ['id', 'title', 'createdAt']) ||
      (Object.hasOwn(p, 'deletedAt') && (!Number.isSafeInteger(p.deletedAt) || p.deletedAt < 1)) || typeof p.id !== 'string' || !UUID.test(p.id) || ids.has(p.id) ||
      typeof p.title !== 'string' || projectTitle(p.title) !== p.title || !Number.isSafeInteger(p.createdAt) || p.createdAt < 1) throw new Error('Каталог проектов повреждён.');
    ids.add(p.id);
  }
  if (!ids.has(FIRST_PROJECT_ID) || !value.projects.some((p: LocalProject) => !p.deletedAt)) throw new Error('В каталоге отсутствует активный проект.');
  return value;
}
const first = (): LocalProject => ({ id: FIRST_PROJECT_ID, title: 'Первый проект', createdAt: Date.now() });
const catalogRaw = (projects: LocalProject[]) => JSON.stringify({ schema: SCHEMA, revision: crypto.randomUUID(), projects });
const memoryRepository: ProjectRepository = {
  async read() { throw new Error('Только память'); }, async compareAndWrite() { throw new Error('Только память'); },
  async compareAndWriteBatch(writes) { if (writes.length) throw new Error('Только память'); },
};
export class LocalProjects {
  private snapshot: ProjectsSnapshot = { projects: [first()], activeId: FIRST_PROJECT_ID, phase: 'loading', busy: false, error: '', corrupt: false };
  private listeners = new Set<() => void>();
  private sessions = new Map<string, ReturnType<LocalProjects['makeSession']>>();
  private base: string | null = null;
  private initialized: Promise<void> | undefined;
  private notify = () => {};
  constructor(private repository: ProjectRepository, private selection?: Pick<Storage, 'getItem' | 'setItem'>) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit(patch: Partial<ProjectsSnapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach((l) => l()); }
  setNotifier(notify: () => void) { this.notify = notify; }
  private makeSession(id: string) {
    const repository = this.snapshot.phase === 'memory' ? memoryRepository : {
      read: (key: string) => this.repository.read(key),
      compareAndWrite: async (key: string, expected: string | null, next: string) => {
        // Check archive membership inside the SAME transaction as the draft write.
        // Reading first alone would allow a background tab to resurrect a trashed project.
        const catalog = await this.repository.read(CATALOG_KEY);
        if (catalog === null || !parseCatalog(catalog).projects.some((p) => p.id === id && !p.deletedAt)) throw new DraftConflict();
        await this.repository.compareAndWriteBatch([
          ...(catalog === null ? [] : [{ key: CATALOG_KEY, expected: catalog, next: catalog }]), { key, expected, next },
        ]);
      },
    };
    return {
      research: new DraftController('research', emptyResearchDraft, validateResearchDraft, repository, projectKey(id, 'research')),
      beats: new DraftController('beats', emptyBeatDraft, validateBeatDraft, repository, projectKey(id, 'beats')),
    };
  }
  getSession(id = this.snapshot.activeId) {
    if (!this.snapshot.projects.some((p) => p.id === id)) throw new Error('Проект не найден.');
    if (!this.sessions.has(id)) this.sessions.set(id, this.makeSession(id));
    return this.sessions.get(id)!;
  }
  init() { return this.initialized ??= this.load(); }
  retry = async () => { if (this.snapshot.busy || this.snapshot.phase === 'loading') return; this.initialized = this.load(); await this.initialized; };
  private async load() {
    this.emit({ phase: 'loading', error: '', corrupt: false });
    try {
      let raw = await this.repository.read(CATALOG_KEY);
      if (raw === null) {
        const created = catalogRaw([first()]);
        try { await this.repository.compareAndWrite(CATALOG_KEY, null, created); raw = created; }
        catch (error) { if (!(error instanceof DraftConflict)) throw error; raw = await this.repository.read(CATALOG_KEY); }
      }
      let catalog;
      try { catalog = parseCatalog(raw!); }
      catch { this.emit({ phase: 'error', corrupt: true, error: 'Каталог проектов повреждён. Данные не перезаписаны. Первый проект доступен ниже; восстановление каталога требует отдельной проверки.' }); return; }
      this.base = raw;
      let activeId = this.snapshot.activeId;
      try { const saved = this.selection?.getItem(ACTIVE_PROJECT_KEY); if (catalog.projects.some((p) => p.id === saved)) activeId = saved!; } catch { /* Selection is optional, never content. */ }
      if (!catalog.projects.some((p) => p.id === activeId && !p.deletedAt)) activeId = catalog.projects.find((p) => !p.deletedAt)!.id;
      this.emit({ projects: catalog.projects, activeId, phase: 'ready' });
    } catch { this.emit({ phase: 'error', error: 'Не удалось открыть список проектов. Разрешите хранение данных сайта и повторите попытку или работайте только до закрытия страницы.' }); }
  }
  continueInMemory = async () => {
    if (this.snapshot.phase !== 'error' || this.snapshot.corrupt || this.snapshot.busy) return;
    this.emit({ busy: true });
    try {
      const session = this.getSession();
      await Promise.all([session.research.init(), session.beats.init()]);
      await Promise.all([session.research.waitForIdle(), session.beats.waitForIdle()]);
      // Recover both unavailable sections with one action. Readable data is never cleared.
      session.research.continueInMemory(); session.beats.continueInMemory();
      this.emit({ phase: 'memory', error: '' });
    } catch { this.emit({ error: 'Дождитесь открытия черновиков и повторите действие. Сохранённые данные не изменены.' }); }
    finally { this.emit({ busy: false }); }
  };
  async refresh() {
    if (this.snapshot.phase !== 'ready' || this.snapshot.busy) return;
    const base = this.base;
    try {
      const raw = await this.repository.read(CATALOG_KEY);
      if (this.snapshot.busy || base !== this.base || raw === this.base) return;
      const catalog = parseCatalog(raw!);
      if (!catalog.projects.some((p) => p.id === this.snapshot.activeId)) throw new Error('Проект отсутствует.');
      this.base = raw; this.emit({ projects: catalog.projects, error: '' });
    } catch { this.emit({ error: 'Не удалось обновить список проектов. Текущая работа остаётся открыта.' }); }
  }
  private activate(id: string) {
    try { this.selection?.setItem(ACTIVE_PROJECT_KEY, id); } catch { /* Optional tab preference. */ }
    this.emit({ activeId: id });
  }
  private async operation(action: () => Promise<void>) {
    if (this.snapshot.busy || !['ready', 'memory'].includes(this.snapshot.phase)) throw new Error('Список проектов ещё не готов.');
    this.emit({ busy: true, error: '' });
    try { await action(); }
    catch (error) {
      const message = error instanceof DraftConflict ? 'Данные изменились в другой вкладке. Обновите список и разрешите конфликт черновиков перед повтором.'
        : error instanceof Error ? error.message : 'Не удалось изменить проект.';
      this.emit({ error: message }); throw new Error(message, { cause: error });
    } finally { this.emit({ busy: false }); }
  }
  private async reserveCurrent() {
    if (this.snapshot.projects.find((p) => p.id === this.snapshot.activeId)?.deletedAt) return [];
    const session = this.getSession();
    await Promise.all([session.research.waitForIdle(), session.beats.waitForIdle()]);
    const research = session.research.reserveNavigation();
    try { return [research, session.beats.reserveNavigation()]; }
    catch (error) { research.release(); throw error; }
  }
  async switchTo(id: string) {
    if (id === this.snapshot.activeId) return;
    if (!this.snapshot.projects.some((p) => p.id === id && !p.deletedAt)) throw new Error('Проект не найден или находится в корзине.');
    await this.operation(async () => {
      const reservations = await this.reserveCurrent();
      try {
        const target = this.getSession(id);
        await Promise.all([target.research.init(), target.beats.init()]);
        // Unvisited cached sessions still check revisions before displaying old data.
        await Promise.all([target.research.checkExternal(), target.beats.checkExternal()]);
        const writes = reservations.flatMap((r) => r.write ? [r.write] : []);
        if (writes.length && this.snapshot.phase === 'ready' && this.base) writes.push({ key: CATALOG_KEY, expected: this.base, next: this.base });
        await this.repository.compareAndWriteBatch(writes);
        reservations.forEach((r) => r.commit()); reservations.forEach((r) => r.publish());
        this.activate(id);
      } finally { reservations.forEach((r) => r.release()); }
    });
  }
  async create(title: string, input?: MediaProjectFile | 'duplicate') {
    if (this.snapshot.projects.find((p) => p.id === this.snapshot.activeId)?.deletedAt) throw new Error('Сначала восстановите проект из корзины или выберите другой.');
    title = projectTitle(title);
    const imported = input && input !== 'duplicate' ? parseProjectFile(JSON.stringify(input)) : null;
    await this.operation(async () => {
      if (this.snapshot.projects.length >= 256) throw new Error('В этом браузере уже 256 проектов. Сохраните резервные копии; расширение каталога требует отдельного этапа.');
      const reservations = await this.reserveCurrent();
      try {
        const current = this.getSession();
        const data = imported ?? parseProjectFile(serializeProjectFile(input === 'duplicate' ? current.research.getSnapshot().data : emptyResearchDraft(),
          input === 'duplicate' ? current.beats.getSnapshot().data : emptyBeatDraft()));
        const item = { id: crypto.randomUUID(), title, createdAt: Date.now() };
        const projects = [...this.snapshot.projects, item]; const nextCatalog = catalogRaw(projects);
        const persistent = this.snapshot.phase === 'ready';
        const records = { research: '', beats: '' };
        const writes: DraftWrite[] = reservations.flatMap((r) => r.write ? [r.write] : []);
        for (const kind of ['research', 'beats'] as const) {
          const enabled = persistent && current[kind].getSnapshot().enabled;
          records[kind] = JSON.stringify({ schema: DRAFT_SCHEMA, kind, revision: crypto.randomUUID(), updatedAt: Date.now(), enabled,
            data: enabled ? data[kind] : kind === 'research' ? emptyResearchDraft() : emptyBeatDraft() });
          if (persistent) writes.push({ key: projectKey(item.id, kind), expected: null, next: records[kind] });
        }
        if (persistent) writes.push({ key: CATALOG_KEY, expected: this.base, next: nextCatalog });
        await this.repository.compareAndWriteBatch(writes);
        reservations.forEach((r) => r.commit()); reservations.forEach((r) => r.publish());
        if (persistent) this.base = nextCatalog;
        const session = this.makeSession(item.id);
        session.research.initializeFromRecord(records.research, data.research);
        session.beats.initializeFromRecord(records.beats, data.beats);
        this.sessions.set(item.id, session);
        this.emit({ projects }); this.activate(item.id); if (persistent) this.notify();
      } finally { reservations.forEach((r) => r.release()); }
    });
  }
  async rename(id: string, title: string, expectedTitle?: string) {
    title = projectTitle(title);
    const current = this.snapshot.projects.find((p) => p.id === id);
    if (!current || current.deletedAt) throw new Error('Проект не найден или находится в корзине.');
    if (expectedTitle !== undefined && current.title !== expectedTitle) throw new Error('Название изменилось в другой вкладке. Отмените переименование и откройте его снова.');
    await this.operation(async () => {
      const projects = this.snapshot.projects.map((p) => p.id === id ? { ...p, title } : p);
      const raw = catalogRaw(projects);
      if (this.snapshot.phase === 'ready') { await this.repository.compareAndWrite(CATALOG_KEY, this.base, raw); this.base = raw; this.notify(); }
      this.emit({ projects });
    });
  }
  async archive(id: string) {
    if (id !== this.snapshot.activeId || this.snapshot.projects.find((p) => p.id === id)?.deletedAt) throw new Error('Откройте проект перед удалением.');
    // Retain one usable project; failure here cannot remove the user's existing work.
    if (this.snapshot.projects.filter((p) => !p.deletedAt).length === 1) await this.create('Новый проект');
    await this.operation(async () => {
      const session = this.getSession(id);
      await Promise.all([session.research.waitForIdle(), session.beats.waitForIdle()]);
      const persistent = this.snapshot.phase === 'ready';
      const a = session.research.reserveNavigation(persistent); let b;
      try {
        b = session.beats.reserveNavigation(persistent);
        const projects = this.snapshot.projects.map((p) => p.id === id ? { ...p, deletedAt: Date.now() } : p);
        const raw = catalogRaw(projects);
        const writes: DraftWrite[] = [];
        if (persistent) {
          // Both revisions change atomically with the archive flag, never accepting a stale base.
          writes.push(a.write!, b.write!);
          writes.push({ key: CATALOG_KEY, expected: this.base, next: raw });
          await this.repository.compareAndWriteBatch(writes); this.base = raw;
        }
        // Keep memory-only content in the cached session, but no scheduled writes survive.
        a.commit(); b.commit(); a.publish(); b.publish();
        this.emit({ projects });
        if (this.snapshot.activeId === id) this.activate(projects.find((p) => !p.deletedAt)!.id);
        if (persistent) this.notify();
      } finally { a.release(); b?.release(); }
    });
  }
  async restore(id: string) {
    if (!this.snapshot.projects.some((p) => p.id === id && p.deletedAt)) throw new Error('Проект не найден в корзине.');
    await this.operation(async () => {
      const projects = this.snapshot.projects.map((p) => p.id === id ? { id: p.id, title: p.title, createdAt: p.createdAt } : p);
      const raw = catalogRaw(projects);
      if (this.snapshot.phase === 'ready') {
        await this.repository.compareAndWrite(CATALOG_KEY, this.base, raw); this.base = raw;
        // Cached forms keep their content; switchTo checks revisions without silently replacing it.
        this.notify();
      }
      this.emit({ projects });
    });
  }
  hasUnsaved = () => [...this.sessions.values()].some(({ research, beats }) => research.hasUnsaved() || beats.hasUnsaved() ||
    hasProjectContent(research.getSnapshot().enabled ? emptyResearchDraft() : research.getSnapshot().data,
      beats.getSnapshot().enabled ? emptyBeatDraft() : beats.getSnapshot().data));
}
