import { useDownloads, HistoryEntry } from '../store/downloads';

function timeAgo(ts: number): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  return `${Math.floor(diff / 86400)} дн назад`;
}

function EntryRow({ entry }: { entry: HistoryEntry }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-lg"
      style={{ background: 'var(--surface2)' }}
    >
      <span className="text-lg flex-shrink-0">
        {entry.format === 'audio' ? '🎵' : '🎬'}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate font-medium" style={{ color: 'var(--text)' }}>
          {entry.title}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
          {entry.filename} · {timeAgo(entry.downloadedAt)}
        </p>
      </div>
      <a
        href={entry.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
        style={{ color: 'var(--accent)' }}
      >
        ↗
      </a>
    </div>
  );
}

export function History() {
  const { history, clearHistory } = useDownloads();

  if (history.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-dim)' }}>
          История загрузок
        </h2>
        <button
          onClick={clearHistory}
          className="text-xs opacity-50 hover:opacity-100 transition-opacity"
          style={{ color: 'var(--text-dim)' }}
        >
          Очистить
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {history.map((entry) => (
          <EntryRow key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}
