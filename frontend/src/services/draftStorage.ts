export const DRAFT_DATABASE = 'eclipse-media-drafts';
export const DRAFT_STORE = 'drafts';
export class DraftConflict extends Error {}
export interface DraftWrite { key: string; expected: string | null; next: string }
export interface DraftRepository {
  read(key: string): Promise<string | null>;
  compareAndWrite(key: string, expected: string | null, next: string): Promise<void>;
}
export interface ProjectRepository extends DraftRepository { compareAndWriteBatch(writes: DraftWrite[]): Promise<void> }
const normalize = (value: unknown): string | null => value === undefined ? null : typeof value === 'string' ? value : '[invalid-record]';
let connection: Promise<IDBDatabase> | undefined;

function database(): Promise<IDBDatabase> {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    let settled = false;
    const fail = () => { if (!settled) { settled = true; clearTimeout(timeout); reject(new Error('Локальное хранилище недоступно.')); } };
    const timeout = setTimeout(fail, 5000);
    try {
      const request = indexedDB.open(DRAFT_DATABASE, 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(DRAFT_STORE)) request.result.createObjectStore(DRAFT_STORE); };
      request.onerror = fail;
      request.onblocked = fail;
      request.onsuccess = () => {
        if (settled) { request.result.close(); return; }
        settled = true; clearTimeout(timeout);
        request.result.onversionchange = () => { request.result.close(); connection = undefined; };
        resolve(request.result);
      };
    } catch { fail(); }
  });
  void connection.catch(() => { connection = undefined; });
  return connection;
}

export const draftRepository: ProjectRepository = {
  async read(key) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DRAFT_STORE, 'readonly');
      const request = transaction.objectStore(DRAFT_STORE).get(key);
      transaction.oncomplete = () => resolve(normalize(request.result));
      transaction.onabort = () => reject(new Error('Не удалось прочитать черновик.'));
    });
  },
  async compareAndWrite(key, expected, next) {
    return this.compareAndWriteBatch([{ key, expected, next }]);
  },
  async compareAndWriteBatch(writes) {
    if (!writes.length) return;
    if (new Set(writes.map((write) => write.key)).size !== writes.length) throw new Error('Повторяющийся раздел.');
    const db = await database();
    return new Promise((resolve, reject) => {
      // Reading and comparing inside the SAME write transaction prevents lost updates across tabs.
      const transaction = db.transaction(DRAFT_STORE, 'readwrite');
      const store = transaction.objectStore(DRAFT_STORE);
      let conflict = false;
      let remaining = writes.length;
      for (const write of writes) {
        const request = store.get(write.key);
        request.onsuccess = () => {
          if (conflict) return;
          if (normalize(request.result) !== write.expected) { conflict = true; transaction.abort(); return; }
          // Validate every revision before writing; quota/errors abort the whole project.
          if (--remaining === 0) {
            try { for (const item of writes) store.put(item.next, item.key); } catch { transaction.abort(); }
          }
        };
      }
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(conflict ? new DraftConflict() : new Error('Не удалось сохранить черновик.'));
    });
  },
};
