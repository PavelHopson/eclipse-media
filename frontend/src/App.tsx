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
        {/* Logo with Eclipse glow */}
        <div className="flex items-center gap-2.5 relative">
          {/* Subtle Eclipse glow behind brand */}
          <div
            className="absolute -inset-3 rounded-2xl pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at 30% 50%, rgba(107,163,255,0.12) 0%, transparent 70%)',
              filter: 'blur(8px)',
            }}
          />
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center relative"
            style={{
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-light) 100%)',
              boxShadow: '0 2px 12px var(--accent-glow), 0 0 24px rgba(107,163,255,0.2)',
            }}
          >
            <span style={{ fontSize: '14px' }}>⚡</span>
          </div>
          <div className="relative">
            <span className="font-semibold text-sm tracking-tight" style={{ color: 'var(--text)' }}>
              Eclipse Media
            </span>
            <span className="text-xs ml-2 mono" style={{ color: 'var(--text-dim)' }}>v1.1</span>
          </div>
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3">
          <span className="tag">1000+ сайтов</span>
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

        {/* Section separator */}
        <div className="eclipse-separator mt-6" />

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

        {/* Empty State — Eclipse themed */}
        {store.items.length === 0 && (
          <div className="mt-20 text-center animate-in relative">
            {/* Background eclipse glow */}
            <div
              className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/4 w-40 h-40 pointer-events-none"
              style={{
                background: 'radial-gradient(circle, rgba(107,163,255,0.1) 0%, rgba(107,163,255,0.04) 40%, transparent 70%)',
                filter: 'blur(20px)',
              }}
            />
            <div
              className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center relative"
              style={{
                background: 'linear-gradient(145deg, var(--surface2), var(--surface))',
                border: '1px solid var(--border)',
                boxShadow: '0 0 40px rgba(107,163,255,0.15), 0 0 80px rgba(107,163,255,0.06)',
              }}
            >
              {/* Download arrow icon with eclipse glow */}
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 6px rgba(107,163,255,0.4))' }}>
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
