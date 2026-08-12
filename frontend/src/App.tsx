import { useState } from 'react';
import './studio.css';
import { UrlInput } from './components/UrlInput';
import { VideoCard } from './components/VideoCard';
import { History } from './components/History';
import { ProxySettings } from './components/ProxySettings';
import { ReleaseStudio } from './components/ReleaseStudio';
import { MediaIntake } from './components/MediaIntake';
import { MediaRequest, useDownloads } from './store/downloads';
import { fetchInfo } from './api/media';

type Workspace = 'downloads' | 'intake' | 'studio';

export default function App() {
  const [fetching, setFetching] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace>('downloads');
  const store = useDownloads();

  async function fetchItem(id: string, url: string) {
    store.setStatus(id, 'fetching');
    try {
      const info = await fetchInfo(url, store.proxy || undefined);
      store.setInfo(id, info);
      if (info.formats.length > 0) store.setFormatId(id, info.formats[0].id);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Не удалось проверить ссылку';
      store.setStatus(id, 'error', message);
      throw new Error(message, { cause: caught });
    }
  }

  async function handleSubmit(urls: string[]) {
    setFetching(true);
    const existing = new Set(store.items.map((item) => item.url));
    const newUrls = [...new Set(urls)].filter((url) => !existing.has(url));
    try {
      await Promise.allSettled(newUrls.map(async (url) => fetchItem(store.addItem(url), url)));
    } finally {
      setFetching(false);
    }
  }

  async function handlePrepare(request: MediaRequest) {
    const format = request.intent === 'audio' ? 'audio' : 'video';
    const id = store.addItem(request.url, {
      format,
      rightsConfirmed: request.rightsConfirmed,
      requestId: request.id,
    });
    store.setRequestStatus(request.id, 'in_progress');
    setWorkspace('downloads');
    setFetching(true);
    try {
      await fetchItem(id, request.url);
    } catch (caught) {
      store.setRequestStatus(request.id, 'planned');
      throw caught;
    } finally {
      setFetching(false);
    }
  }

  const headerStatus = workspace === 'downloads'
    ? 'До 3 задач'
    : workspace === 'intake'
      ? `${store.requests.filter((request) => request.status !== 'done').length} в плане`
      : 'Local preview';

  return (
    <div className="min-h-screen eclipse-grid" style={{ background: 'var(--bg)' }}>
      <header
        className="app-header sticky top-0 z-20 px-5 py-3.5 flex items-center gap-3"
        style={{
          background: 'rgba(6,6,10,0.9)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center gap-2.5 relative">
          <div className="absolute -inset-3 rounded-2xl pointer-events-none" style={{ background: 'radial-gradient(ellipse at 30% 50%, rgba(107,163,255,0.12) 0%, transparent 70%)', filter: 'blur(8px)' }} />
          <div className="w-8 h-8 rounded-lg flex items-center justify-center relative" style={{ background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-light) 100%)', boxShadow: '0 2px 12px var(--accent-glow)' }}>
            <span aria-hidden="true" style={{ fontSize: '14px' }}>⚡</span>
          </div>
          <div className="relative">
            <span className="font-semibold text-sm tracking-tight text-glow" style={{ color: 'var(--text)' }}>Eclipse Media</span>
            <span className="text-xs ml-2 mono" style={{ color: 'var(--text-dim)' }}>v1.2</span>
          </div>
        </div>

        <nav className="workspace-switch" aria-label="Раздел Eclipse Media">
          {([
            ['downloads', 'Загрузки'],
            ['intake', 'План'],
            ['studio', 'Видео-студия'],
          ] as Array<[Workspace, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={workspace === value ? 'workspace-switch__item is-active' : 'workspace-switch__item'}
              aria-pressed={workspace === value}
              onClick={() => setWorkspace(value)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="header-status"><span className="tag">{headerStatus}</span></div>
      </header>

      <main className={workspace === 'downloads' ? 'max-w-2xl mx-auto px-4 pt-8 pb-16' : 'studio-shell'}>
        {workspace === 'studio' && <ReleaseStudio />}
        {workspace === 'intake' && <MediaIntake onPrepare={handlePrepare} />}
        {workspace === 'downloads' && (
          <>
            <UrlInput onSubmit={handleSubmit} loading={fetching} />
            <p className="download-guidance">Вставьте ссылку, проверьте материал и подтвердите права перед скачиванием или транскрипцией.</p>
            <div className="mt-4"><ProxySettings /></div>
            <div className="eclipse-separator mt-6" />

            {store.items.length > 0 && (
              <div className="mt-6 flex flex-col gap-3">
                {store.items.map((item, index) => (
                  <div key={item.id} className="animate-in" style={{ animationDelay: `${index * 50}ms` }}>
                    <VideoCard item={item} />
                  </div>
                ))}
              </div>
            )}

            {store.items.length === 0 && (
              <div className="mt-20 text-center animate-in relative">
                <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/4 w-40 h-40 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(107,163,255,0.1) 0%, transparent 70%)', filter: 'blur(20px)' }} />
                <div className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center relative" style={{ background: 'linear-gradient(145deg, var(--surface2), var(--surface))', border: '1px solid var(--border)', boxShadow: '0 0 40px rgba(107,163,255,0.15)' }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                </div>
                <p className="text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Начните со ссылки или составьте план</p>
                <button type="button" className="btn-ghost mt-3" onClick={() => setWorkspace('intake')}>Открыть план материалов</button>
              </div>
            )}

            <History />
          </>
        )}
      </main>
    </div>
  );
}