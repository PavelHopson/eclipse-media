import { useState } from 'react';
import { UrlInput } from './components/UrlInput';
import { VideoCard } from './components/VideoCard';
import { History } from './components/History';
import { useDownloads } from './store/downloads';
import { fetchInfo } from './api/media';

export default function App() {
  const [fetching, setFetching] = useState(false);
  const store = useDownloads();

  async function handleSubmit(urls: string[]) {
    setFetching(true);

    // Дедупликация — убираем уже добавленные URL
    const existing = new Set(store.items.map((i) => i.url));
    const newUrls = [...new Set(urls)].filter((u) => !existing.has(u));

    if (newUrls.length === 0) {
      setFetching(false);
      return;
    }

    // Добавляем карточки и сразу запрашиваем info параллельно
    const ids = newUrls.map((url) => {
      const id = store.addItem(url);
      return { id, url };
    });

    await Promise.allSettled(
      ids.map(async ({ id, url }) => {
        store.setStatus(id, 'fetching');
        try {
          const info = await fetchInfo(url);
          store.setInfo(id, info);
          if (info.formats.length > 0) {
            store.setFormatId(id, info.formats[0].id);
          }
        } catch (e: unknown) {
          store.setStatus(id, 'error', e instanceof Error ? e.message : 'Ошибка');
        }
      }),
    );

    setFetching(false);
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-10 px-6 py-4 flex items-center gap-3"
        style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}
      >
        <span className="text-xl">⚡</span>
        <span className="font-bold text-base tracking-tight" style={{ color: 'var(--text)' }}>
          Eclipse Media
        </span>
        <span
          className="ml-auto text-xs px-2 py-0.5 rounded-full"
          style={{ background: 'var(--surface2)', color: 'var(--text-dim)' }}
        >
          1000+ сайтов
        </span>
      </header>

      {/* Main */}
      <main className="max-w-2xl mx-auto px-4 py-8">
        <UrlInput onSubmit={handleSubmit} loading={fetching} />

        {/* Download items */}
        {store.items.length > 0 && (
          <div className="mt-6 flex flex-col gap-3">
            {store.items.map((item) => (
              <VideoCard key={item.id} item={item} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {store.items.length === 0 && (
          <div className="mt-16 text-center">
            <p className="text-4xl mb-4">🎬</p>
            <p className="text-sm font-medium" style={{ color: 'var(--text-dim)' }}>
              Вставьте ссылку на видео выше
            </p>
            <p className="text-xs mt-2" style={{ color: 'var(--text-dim)', opacity: 0.6 }}>
              YouTube · TikTok · Instagram · Twitter · Reddit · и ещё 1000+
            </p>
          </div>
        )}

        <History />
      </main>
    </div>
  );
}
