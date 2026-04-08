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
    <div className="flex items-center gap-3 py-2.5 group">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
      >
        <span style={{ color: entry.format === 'audio' ? 'var(--accent-soft)' : 'var(--text-dim)', fontSize: '13px' }}>
          {entry.format === 'audio' ? '♫' : '▶'}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{entry.title}</p>
        <p className="mono" style={{ color: 'var(--text-dim)' }}>{timeAgo(entry.downloadedAt)}</p>
      </div>
      <span className="tag" style={{ fontSize: '10px', padding: '2px 6px' }}>
        {entry.format === 'audio' ? 'MP3' : 'MP4'}
      </span>
    </div>
  );
}

export function History() {
  const { history, clearHistory } = useDownloads();
  if (history.length === 0) return null;

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
          История
        </h3>
        <button onClick={clearHistory} className="text-xs transition-colors" style={{ color: 'var(--text-dim)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--error)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-dim)')}>
          Очистить
        </button>
      </div>
      <div
        className="rounded-2xl divide-y"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', divideColor: 'var(--border)' }}
      >
        <div className="px-4" style={{ borderColor: 'var(--border)' }}>
          {history.slice(0, 10).map((entry) => (
            <div key={entry.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <EntryRow entry={entry} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
