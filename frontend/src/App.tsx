import { useState } from 'react';
import './studio.css';
import { UrlInput } from './components/UrlInput';
import { VideoCard } from './components/VideoCard';
import { History } from './components/History';
import { ProxySettings } from './components/ProxySettings';
import { ReleaseStudio } from './components/ReleaseStudio';
import { MediaIntake } from './components/MediaIntake';
import { SafeLocalEdit } from './components/SafeLocalEdit';
import { DesktopUpdater } from './components/DesktopUpdater';
import { BeatScenePlanner } from './components/BeatScenePlanner';
import { DatasetLab } from './components/DatasetLab';
import { MediaLibrary } from './components/MediaLibrary';
import { MediaRequest, useDownloads } from './store/downloads';
import { fetchInfo } from './api/media';

const WORKSPACES = ['downloads', 'library', 'intake', 'beats', 'datasets', 'studio', 'edit'] as const;
type Workspace = typeof WORKSPACES[number];

function readWorkspace(): Workspace {
  const requested = new URLSearchParams(window.location.search).get('workspace');
  return WORKSPACES.find((workspace) => workspace === requested) ?? 'downloads';
}

export default function App() {
  const [fetching, setFetching] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace>(readWorkspace);
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

  function selectWorkspace(nextWorkspace: Workspace) {
    setWorkspace(nextWorkspace);
    const url = new URL(window.location.href);
    if (nextWorkspace === 'downloads') url.searchParams.delete('workspace');
    else url.searchParams.set('workspace', nextWorkspace);
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }

  const headerStatus = workspace === 'downloads'
    ? 'До 3 задач'
    : workspace === 'library'
      ? 'Права внутри файла'
    : workspace === 'intake'
      ? `${store.requests.filter((request) => request.status !== 'done').length} в плане`
      : workspace === 'beats'
        ? 'Локальный анализ'
        : workspace === 'datasets'
          ? 'Без запуска обучения'
        : workspace === 'edit'
          ? 'Только предпросмотр'
          : 'Local preview';

  return (
    <div className="min-h-screen eclipse-grid forge-product-shell" data-visual-profile="bento-spatial">
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
          <div className="brand-mark relative" aria-hidden="true">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path d="M6 5.5 12 2l6 3.5v7L12 16l-3-1.75V18l3 1.75L18 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="relative">
            <span className="font-semibold text-sm tracking-tight text-glow" style={{ color: 'var(--text)' }}>Eclipse Media</span>
            <span className="text-xs ml-2 mono" style={{ color: 'var(--text-dim)' }}>v1.6.0</span>
          </div>
        </div>

        <nav className="workspace-switch" aria-label="Раздел Eclipse Media">
          {([
            ['downloads', 'Загрузки'],
            ['library', 'Медиатека'],
            ['intake', 'План'],
            ['beats', 'Бит-карта'],
            ['datasets', 'Датасеты'],
            ['studio', 'Видео-студия'],
            ['edit', 'Безопасный монтаж'],
          ] as Array<[Workspace, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={workspace === value ? 'workspace-switch__item is-active' : 'workspace-switch__item'}
              aria-pressed={workspace === value}
              onClick={() => selectWorkspace(value)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="header-status"><span className="tag">{headerStatus}</span></div>
      </header>

      <DesktopUpdater />

      <main className={workspace === 'downloads' ? 'download-shell' : 'studio-shell'}>
        {workspace === 'library' && <MediaLibrary />}
        {workspace === 'studio' && <ReleaseStudio />}
        {workspace === 'beats' && <BeatScenePlanner />}
        {workspace === 'datasets' && <DatasetLab />}
        {workspace === 'edit' && <SafeLocalEdit />}
        {workspace === 'intake' && <MediaIntake onPrepare={handlePrepare} />}
        {workspace === 'downloads' && (
          <>
            <section className="download-hero" aria-labelledby="download-title">
              <div>
                <span className="section-kicker">Локальная медиа-мастерская</span>
                <h1 id="download-title">Получите нужный медиафайл <br />без лишних шагов</h1>
                <p>Скопируйте адрес страницы конкретного публичного ролика из браузера. Команды и параметры терминала не нужны.</p>
              </div>
              <ol className="download-path" aria-label="Порядок работы">
                <li><span>01</span><strong>Ссылка</strong><small>Укажите источник</small></li>
                <li><span>02</span><strong>Проверка</strong><small>Выберите результат</small></li>
                <li><span>03</span><strong>Файл</strong><small>Сохраните локально</small></li>
              </ol>
            </section>

            <div className="download-layout">
              <section className="download-primary" aria-label="Новая задача">
                <div className="download-start-card">
                  <div className="download-start-card__heading">
                    <div>
                      <span className="step-badge">Новая задача</span>
                      <h2>Вставьте ссылку на страницу видео</h2>
                    </div>
                    <span className="direct-link-badge">Прямая ссылка</span>
                  </div>
                  <UrlInput onSubmit={handleSubmit} loading={fetching} />
                  <p className="download-guidance">Подойдут ссылки вида ok.ru/video/… и vkvideo.ru/video-…. Профили и целые каналы пока не поддерживаются.</p>
                </div>

                <div className="utility-row"><ProxySettings /></div>

                {store.items.length > 0 && (
                  <section className="queue-section" aria-labelledby="queue-title">
                    <div className="queue-section__heading">
                      <div>
                        <span className="section-kicker">Текущая сессия</span>
                        <h2 id="queue-title">Очередь обработки</h2>
                      </div>
                      <span className="queue-count">{store.items.length}</span>
                    </div>
                    <div className="flex flex-col gap-3">
                      {store.items.map((item, index) => (
                        <div key={item.id} className="animate-in" style={{ animationDelay: `${index * 50}ms` }}>
                          <VideoCard item={item} />
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {store.items.length === 0 && (
                  <div className="download-empty" role="status">
                    <div className="download-empty__icon" aria-hidden="true">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
                    </div>
                    <div><strong>Очередь пока пуста</strong><span>Вставьте ссылку выше — проверка начнётся сразу.</span></div>
                  </div>
                )}

                <History />
              </section>

              <aside className="download-trust-panel" aria-label="О работе приложения">
                <div className="local-status"><span aria-hidden="true" /><div><strong>Локальный режим</strong><small>Файлы остаются на этом устройстве</small></div></div>
                <div className="trust-list">
                  <div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg><span><strong>Без cookies аккаунта</strong><small>Не передаём сессии платформ</small></span></div>
                  <div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16" /><path d="M7 3v4M17 3v4" /><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 11h8M8 15h5" /></svg><span><strong>Очистка через 1 час</strong><small>Временные файлы удаляются</small></span></div>
                  <div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M12 4v16" /><circle cx="12" cy="12" r="9" /></svg><span><strong>До 3 процессов</strong><small>Очередь защищена от перегрузки</small></span></div>
                </div>
                <div className="rights-note"><strong>Важно</strong><p>Скачивайте только собственные материалы или контент, на обработку которого у вас есть разрешение.</p></div>
                <button type="button" className="trust-plan-link" onClick={() => setWorkspace('intake')}>Сначала составить медиаплан <span aria-hidden="true">→</span></button>
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
