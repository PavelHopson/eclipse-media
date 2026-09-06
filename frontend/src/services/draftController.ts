import { DRAFT_SCHEMA, decodeDraft, type DraftKind } from './draftContract';
import { DraftConflict, type DraftRepository, type DraftWrite } from './draftStorage';

export type DraftPhase = 'loading' | 'empty' | 'saving' | 'saved' | 'off' | 'error' | 'invalid' | 'conflict';
export interface DraftSnapshot<T> { data: T; phase: DraftPhase; enabled: boolean; ready: boolean; updatedAt: number | null; message: string }

// A workspace store outlives its mounted form, so switching sections cannot drop queued writes.
export class DraftController<T> {
  private snapshot: DraftSnapshot<T>;
  private listeners = new Set<() => void>();
  private base: string | null = null;
  private started = false;
  private running = false;
  private reading = false;
  private locked = false;
  private dirty = false;
  private version = 0;
  private replacementVersion = 0;
  private blocked = false;
  private baseKnown = false;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private notifying: () => void = () => {};
  constructor(readonly kind: DraftKind, private empty: () => T, private validate: (value: unknown) => void, private repository: DraftRepository, readonly storageKey: string = kind) {
    this.snapshot = { data: empty(), phase: 'loading', enabled: true, ready: false, updatedAt: null, message: '' };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit(patch: Partial<DraftSnapshot<T>>) { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach((listener) => listener()); }
  setNotifier(notify: () => void) { this.notifying = notify; }
  hasUnsaved = () => this.running || this.dirty || this.locked;
  getVersion = () => this.version;
  getReplacementVersion = () => this.replacementVersion;
  // Only for a newly created session whose transaction has already committed.
  initializeFromRecord(raw: string, transient?: T) {
    if (this.started) throw new Error('Раздел уже открыт.');
    const record = decodeDraft<T>(raw, this.kind, this.validate);
    if (transient !== undefined) this.validate(transient);
    this.started = true; this.baseKnown = true; this.base = raw; this.version++;
    const data = record.enabled ? record.data : transient ?? this.empty();
    this.snapshot = { data, enabled: record.enabled, ready: true, updatedAt: record.updatedAt, message: '',
      phase: !record.enabled ? 'off' : JSON.stringify(data) === JSON.stringify(this.empty()) ? 'empty' : 'saved' };
  }
  async waitForIdle() {
    for (let i = 0; i < 100 && (this.running || this.reading); i++) await new Promise((resolve) => setTimeout(resolve, 20));
    if (this.running || this.reading) throw new Error('Сохранение ещё идёт. Подождите и повторите действие.');
  }
  // Freeze a departing project; unchanged records must not invalidate other tabs.
  reserveNavigation(forceRevision = false) {
    if (!this.snapshot.ready || this.running || this.reading || this.locked || this.blocked) {
      throw new Error('Сначала устраните ошибку сохранения или конфликт в разделах «План» и «Бит-карта». Текущий проект остаётся открыт.');
    }
    this.validate(this.snapshot.data);
    const raw = JSON.stringify({ schema: DRAFT_SCHEMA, kind: this.kind, revision: crypto.randomUUID(), updatedAt: Date.now(),
      enabled: this.snapshot.enabled, data: this.snapshot.enabled ? this.snapshot.data : this.empty() });
    const record = decodeDraft<T>(raw, this.kind, this.validate);
    const write: DraftWrite | null = this.dirty || forceRevision ? { key: this.storageKey, expected: this.base, next: raw } : null;
    this.locked = true; clearTimeout(this.saveTimer); this.saveTimer = undefined;
    return { write,
      commit: () => {
        if (write) {
          this.base = raw; this.dirty = false;
          this.snapshot = { ...this.snapshot, updatedAt: record.updatedAt, message: '',
            phase: !this.snapshot.enabled ? 'off' : JSON.stringify(this.snapshot.data) === JSON.stringify(this.empty()) ? 'empty' : 'saved' };
        }
        this.replacementVersion++;
      },
      publish: () => { this.listeners.forEach((listener) => listener()); if (write) this.notifying(); },
      release: () => { this.locked = false; if (this.dirty && !this.blocked) this.saveTimer = setTimeout(() => { void this.flush(); }, 250); },
    };
  }
  async init() {
    if (this.started) return;
    this.started = true;
    await this.reload();
  }
  async reload() {
    if (this.running || this.reading || this.locked) return;
    this.reading = true;
    clearTimeout(this.saveTimer); this.saveTimer = undefined;
    this.emit({ phase: 'loading', ready: false, message: '' });
    try {
      const raw = await this.repository.read(this.storageKey);
      this.base = raw;
      this.baseKnown = true;
      let record;
      try { record = raw === null ? null : decodeDraft<T>(raw, this.kind, this.validate); }
      catch { this.blocked = true; this.emit({ phase: 'invalid', ready: false, message: 'Черновик не удалось восстановить. Он не перезаписан. Можно удалить только черновик этого раздела.' }); return; }
      this.blocked = false; this.dirty = false; this.version++;
      this.emit({ data: record?.enabled ? record.data : this.empty(), enabled: record?.enabled ?? true, updatedAt: record?.updatedAt ?? null, ready: true,
        phase: record?.enabled === false ? 'off' : record && JSON.stringify(record.data) !== JSON.stringify(this.empty()) ? 'saved' : 'empty', message: '' });
    } catch {
      this.blocked = true;
      this.emit({ phase: 'error', message: 'Хранилище недоступно. Разрешите хранение данных сайта и повторите попытку.' });
    } finally { this.reading = false; }
  }
  update = (update: (current: T) => T) => {
    if (!this.snapshot.ready || this.locked) return;
    const next = update(this.snapshot.data);
    this.version++;
    this.emit({ data: next });
    if (this.snapshot.enabled) {
      this.dirty = true;
      if (!this.blocked) {
        // Coalesce typing without tying the timer to a component's lifetime.
        clearTimeout(this.saveTimer);
        this.emit({ phase: 'saving', message: '' });
        this.saveTimer = setTimeout(() => { this.saveTimer = undefined; void this.flush(); }, 250);
      }
    }
  };
  setEnabled = (enabled: boolean) => {
    if (!this.snapshot.ready || this.blocked || this.locked) return;
    if (enabled && !this.baseKnown) {
      this.blocked = true;
      this.emit({ phase: 'conflict', message: 'Сначала выберите: загрузить прежний черновик или сохранить текущий вариант. Старые данные не будут перезаписаны без вашего решения.' });
      return;
    }
    this.emit({ enabled }); this.dirty = true; this.version++; void this.flush();
  };
  clear = () => {
    if (this.locked) return;
    if (!this.snapshot.ready && this.snapshot.phase !== 'invalid') return;
    if (!this.baseKnown) { this.version++; this.emit({ data: this.empty() }); return; }
    this.blocked = false; this.dirty = true; this.version++;
    this.emit({ data: this.empty(), ready: true, message: '' });
    void this.flush();
  };
  retry = async () => {
    if (this.locked) return;
    if (!this.snapshot.ready) { await this.reload(); return; }
    if (this.snapshot.phase === 'conflict' || this.snapshot.phase === 'invalid') return;
    this.blocked = false; await this.flush();
  };
  overwrite = async () => {
    if (this.running || this.reading || this.locked || !this.snapshot.ready) return;
    this.reading = true;
    this.emit({ phase: 'saving' });
    try { this.base = await this.repository.read(this.storageKey); this.baseKnown = true; }
    catch { this.emit({ phase: 'conflict', message: 'Не удалось открыть хранилище. Ваши правки пока только в памяти. Можно снова нажать «Сохранить мой вариант».' }); return; }
    finally { this.reading = false; }
    this.emit({ enabled: true });
    this.blocked = false; this.dirty = true; this.version++; await this.flush();
  };
  continueInMemory = () => {
    if (this.locked || this.snapshot.ready || this.snapshot.phase !== 'error') return;
    this.version++;
    this.blocked = false; this.dirty = false;
    this.emit({ ready: true, enabled: false, phase: 'off', message: '' });
  };
  async checkExternal() {
    if (!this.snapshot.ready || this.running || this.dirty || this.locked) return;
    const base = this.base; const version = this.version;
    try {
      const raw = await this.repository.read(this.storageKey);
      if (this.locked || this.running || this.dirty || base !== this.base || version !== this.version) return;
      if (raw !== this.base) {
        this.blocked = true;
        this.emit({ phase: 'conflict', message: 'Черновик изменён или удалён в другой вкладке. Выберите, какую версию оставить.' });
      }
    } catch { /* A subsequent save still reports errors and uses the transaction's revision check. */ }
  }
  // Reservations freeze both controllers synchronously before a single database transaction.
  // No form state changes until BOTH records have committed. Release resumes queued autosaves.
  reserveReplacement(data: T, expectedVersion: number) {
    if (expectedVersion !== this.version) throw new Error('Работа изменилась после проверки файла. Отмените открытие и выберите файл снова.');
    if (!this.snapshot.ready || this.running || this.reading || this.locked || this.blocked) {
      throw new Error('Дождитесь сохранения обоих разделов и устраните ошибки или конфликт вкладок. Затем повторите открытие.');
    }
    if (!this.baseKnown && this.snapshot.enabled) throw new Error('Сначала восстановите доступ к локальному хранилищу.');
    this.validate(data);
    const raw = JSON.stringify({ schema: DRAFT_SCHEMA, kind: this.kind, revision: crypto.randomUUID(), updatedAt: Date.now(),
      enabled: this.snapshot.enabled, data: this.snapshot.enabled ? data : this.empty() });
    const record = decodeDraft<T>(raw, this.kind, this.validate);
    const write: DraftWrite | null = this.baseKnown ? { key: this.storageKey, expected: this.base, next: raw } : null;
    this.locked = true;
    clearTimeout(this.saveTimer); this.saveTimer = undefined;
    let committed = false;
    return {
      write,
      commit: () => {
        if (committed) return;
        committed = true;
        if (write) this.base = raw;
        this.dirty = false; this.blocked = false; this.version++;
        this.replacementVersion++;
        this.snapshot = { ...this.snapshot, data, updatedAt: write ? record.updatedAt : null, message: '',
          phase: !this.snapshot.enabled ? 'off' : JSON.stringify(data) === JSON.stringify(this.empty()) ? 'empty' : 'saved' };
      },
      publish: () => { this.listeners.forEach((listener) => listener()); if (write) this.notifying(); },
      release: () => {
        this.locked = false;
        if (this.dirty && !this.blocked) this.saveTimer = setTimeout(() => { this.saveTimer = undefined; void this.flush(); }, 250);
      },
    };
  }
  private async flush() {
    if (this.running || !this.dirty || this.blocked || this.locked) return;
    clearTimeout(this.saveTimer); this.saveTimer = undefined;
    this.running = true;
    try {
      while (this.dirty && !this.blocked) {
        const version = this.version;
        this.emit({ phase: 'saving', message: '' });
        const raw = JSON.stringify({ schema: DRAFT_SCHEMA, kind: this.kind, revision: crypto.randomUUID(), updatedAt: Date.now(),
          enabled: this.snapshot.enabled, data: this.snapshot.enabled ? this.snapshot.data : this.empty() });
        const record = decodeDraft<T>(raw, this.kind, this.validate);
        await this.repository.compareAndWrite(this.storageKey, this.base, raw);
        this.base = raw;
        this.dirty = version !== this.version;
        this.emit({ updatedAt: record.updatedAt });
        this.notifying();
      }
      this.emit({ phase: !this.snapshot.enabled ? 'off' : JSON.stringify(this.snapshot.data) === JSON.stringify(this.empty()) ? 'empty' : 'saved' });
    } catch (caught) {
      this.blocked = true;
      this.emit({ phase: caught instanceof DraftConflict ? 'conflict' : 'error', message: caught instanceof DraftConflict
        ? 'Черновик изменён или удалён в другой вкладке. Ваши правки не перезаписали его.'
        : 'Черновик не сохранён. Возможно, место закончилось или хранение запрещено. Ваши правки пока только в памяти; скачайте результат или повторите попытку.' });
    } finally { this.running = false; }
  }
}
