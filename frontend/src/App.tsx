import { useState } from 'react';
import { UrlInput } from './components/UrlInput';
import { VideoCard } from './components/VideoCard';
import { History } from './components/History';
import { ProxySettings } from './components/ProxySettings';
import { useDownloads } from './store/downloads';
import { fetchInfo } from './api/media';

export default function App() {
  const [fetching, setFetching] = useState(false);
  const store = useDownloads();

  async function handleSubmit(urls: string[]) {
    setFetching(true);
    const existing = new Set(store.items.map((i) => i.url));
    const newUrls = [...new Set(urls)].filter((u) => !existing.has(u));
    if (newUrls.length === 0) { setFetching(false); return; }

    const ids = newUrls.map((url) => ({ id: store.addItem(url), url }));

    await Promise.allSettled(
      ids.map(async ({ id, url }) => {
        store.setStatus(id, 'fetching');
        try {
          const info = await fetchInfo(url, store.proxy || undefined);
          store.setInfo(id, info);
          if (info.formats.length > 0) store.setFormatId(id, info.formats[0].id);
        } catch (e: unknown) {
          store.setStatus(id, 'error', e instanceof Error ? e.message : 'Ошибка');
        }
      }),
    );
    setFetching(false);
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* ─── Header ─── */}
      <header
        className="sticky top-0 z-20 px-5 py-3.5 flex items-center gap-3"
        style={{
          background: 'rgba(6,6,10,0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%)',
              boxShadow: '0 2px 12px var(--accent-glow)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
          <div>
            <span className="font-semibold text-sm tracking-tight" style={{ color: 'var(--text)' }}>
              Eclipse Media
            </span>
            <span className="text-xs ml-2 mono" style={{ color: 'var(--text-dim)' }}>v1.1</span>
          </div>
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3">
          <span className="tag">
            <span style={{ color: 'var(--success)', marginRight: 4 }}>●</span>
            1000+ сайтов
          </span>
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <main className="max-w-2xl mx-auto px-4 pt-8 pb-16">
        {/* URL Input */}
        <UrlInput onSubmit={handleSubmit} loading={fetching} />

        {/* Proxy */}
        <div className="mt-4">
          <ProxySettings />
        </div>

        {/* Download Items */}
        {store.items.length > 0 && (
          <div className="mt-6 flex flex-col gap-3">
            {store.items.map((item, i) => (
              <div key={item.id} className="animate-in" style={{ animationDelay: `${i * 50}ms` }}>
                <VideoCard item={item} />
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {store.items.length === 0 && (
          <div className="mt-20 text-center animate-in">
            <div
              className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, var(--surface2), var(--surface3))',
                border: '1px solid var(--border)',
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <p className="text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Вставьте ссылку для скачивания
            </p>
            <p className="text-xs mono" style={{ color: 'var(--text-dim)' }}>
              YouTube · TikTok · Instagram · Twitter · SoundCloud · и ещё 1000+
            </p>
          </div>
        )}

        {/* History */}
        <History />
      </main>
    </div>
  );
}
