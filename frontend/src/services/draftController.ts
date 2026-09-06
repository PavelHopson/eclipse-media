import { DRAFT_SCHEMA, decodeDraft, type DraftKind } from './draftContract';
import { DraftConflict, type DraftRepository } from './draftStorage';

export type DraftPhase = 'loading' | 'empty' | 'saving' | 'saved' | 'off' | 'error' | 'invalid' | 'conflict';
export interface DraftSnapshot<T> { data: T; phase: DraftPhase; enabled: boolean; ready: boolean; updatedAt: number | null; message: string }

// A workspace store outlives its mounted form, so switching sections cannot drop queued writes.
export class DraftController<T> {
  private snapshot: DraftSnapshot<T>;
  private listeners = new Set<() => void>();
  private base: string | null = null;
  private started = false;
  private running = false;
  private dirty = false;
  private version = 0;
  private blocked = false;
  private baseKnown = false;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private notifying: () => void = () => {};
  constructor(readonly kind: DraftKind, private empty: () => T, private validate: (value: unknown) => void, private repository: DraftRepository) {
    this.snapshot = { data: empty(), phase: 'loading', enabled: true, ready: false, updatedAt: null, message: '' };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit(patch: Partial<DraftSnapshot<T>>) { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach((listener) => listener()); }
  setNotifier(notify: () => void) { this.notifying = notify; }
  hasUnsaved = () => this.running || this.dirty;
  async init() {
    if (this.started) return;
    this.started = true;
    await this.reload();
  }
  async reload() {
    if (this.running) return;
    clearTimeout(this.saveTimer); this.saveTimer = undefined;
    this.emit({ phase: 'loading', ready: false, message: '' });
    try {
      const raw = await this.repository.read(this.kind);
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
    }
  }
  update = (update: (current: T) => T) => {
    if (!this.snapshot.ready) return;
    const next = update(this.snapshot.data);
    this.emit({ data: next });
    if (this.snapshot.enabled) {
      this.dirty = true; this.version++;
      if (!this.blocked) {
        // Coalesce typing without tying the timer to a component's lifetime.
        clearTimeout(this.saveTimer);
        this.emit({ phase: 'saving', message: '' });
        this.saveTimer = setTimeout(() => { this.saveTimer = undefined; void this.flush(); }, 250);
      }
    }
  };
  setEnabled = (enabled: boolean) => {
    if (!this.snapshot.ready || this.blocked) return;
    if (enabled && !this.baseKnown) {
      this.blocked = true;
      this.emit({ phase: 'conflict', message: 'Сначала выберите: загрузить прежний черновик или сохранить текущий вариант. Старые данные не будут перезаписаны без вашего решения.' });
      return;
    }
    this.emit({ enabled }); this.dirty = true; this.version++; void this.flush();
  };
  clear = () => {
    if (!this.snapshot.ready && this.snapshot.phase !== 'invalid') return;
    if (!this.baseKnown) { this.emit({ data: this.empty() }); return; }
    this.blocked = false; this.dirty = true; this.version++;
    this.emit({ data: this.empty(), ready: true, message: '' });
    void this.flush();
  };
  retry = async () => {
    if (!this.snapshot.ready) { await this.reload(); return; }
    if (this.snapshot.phase === 'conflict' || this.snapshot.phase === 'invalid') return;
    this.blocked = false; await this.flush();
  };
  overwrite = async () => {
    if (this.running || !this.snapshot.ready) return;
    this.emit({ phase: 'saving' });
    try { this.base = await this.repository.read(this.kind); this.baseKnown = true; }
    catch { this.emit({ phase: 'conflict', message: 'Не удалось открыть хранилище. Ваши правки пока только в памяти. Можно снова нажать «Сохранить мой вариант».' }); return; }
    this.emit({ enabled: true });
    this.blocked = false; this.dirty = true; this.version++; await this.flush();
  };
  continueInMemory = () => {
    if (this.snapshot.ready || this.snapshot.phase !== 'error') return;
    this.blocked = false; this.dirty = false;
    this.emit({ ready: true, enabled: false, phase: 'off', message: '' });
  };
  async checkExternal() {
    if (!this.snapshot.ready || this.running || this.dirty) return;
    try {
      if (await this.repository.read(this.kind) !== this.base) {
        this.blocked = true;
        this.emit({ phase: 'conflict', message: 'Черновик изменён или удалён в другой вкладке. Выберите, какую версию оставить.' });
      }
    } catch { /* A subsequent save still reports errors and uses the transaction's revision check. */ }
  }
  private async flush() {
    if (this.running || !this.dirty || this.blocked) return;
    clearTimeout(this.saveTimer); this.saveTimer = undefined;
    this.running = true;
    try {
      while (this.dirty && !this.blocked) {
        const version = this.version;
        this.emit({ phase: 'saving', message: '' });
        const raw = JSON.stringify({ schema: DRAFT_SCHEMA, kind: this.kind, revision: crypto.randomUUID(), updatedAt: Date.now(),
          enabled: this.snapshot.enabled, data: this.snapshot.enabled ? this.snapshot.data : this.empty() });
        const record = decodeDraft<T>(raw, this.kind, this.validate);
        await this.repository.compareAndWrite(this.kind, this.base, raw);
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
