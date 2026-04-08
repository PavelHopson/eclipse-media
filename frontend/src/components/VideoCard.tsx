import { useState } from 'react';
import { AudioFormat, AudioQuality, DownloadItem, useDownloads } from '../store/downloads';
import { fetchInfo, startDownload, subscribeProgress, getFileUrl, formatDuration } from '../api/media';
import { TranscriptModal } from './TranscriptModal';

const AUDIO_FORMATS: { value: AudioFormat; label: string; lossless?: boolean }[] = [
  { value: 'mp3',  label: 'MP3' },
  { value: 'flac', label: 'FLAC', lossless: true },
  { value: 'opus', label: 'Opus' },
  { value: 'm4a',  label: 'M4A' },
];

const AUDIO_QUALITIES: { value: AudioQuality; label: string }[] = [
  { value: 'best', label: 'Лучшее' },
  { value: '320',  label: '320 kbps' },
  { value: '192',  label: '192 kbps' },
  { value: '128',  label: '128 kbps' },
];

interface Props {
  item: DownloadItem;
}

export function VideoCard({ item }: Props) {
  const store = useDownloads();
  const [showTranscript, setShowTranscript] = useState(false);

  async function handleFetch() {
    store.setStatus(item.id, 'fetching');
    try {
      const info = await fetchInfo(item.url);
      store.setInfo(item.id, info);
      // Выбираем лучшее качество по умолчанию
      if (info.formats.length > 0) {
        store.setFormatId(item.id, info.formats[0].id);
      }
    } catch (e: unknown) {
      store.setStatus(item.id, 'error', e instanceof Error ? e.message : 'Ошибка');
    }
  }

  async function handleDownload() {
    if (!item.info) return;
    store.setStatus(item.id, 'downloading');

    try {
      const jobId = await startDownload({
        url: item.url,
        format: item.format,
        format_id: item.format === 'video' ? (item.formatId ?? undefined) : undefined,
        title: item.info.title,
        audio_format: item.format === 'audio' ? item.audioFormat : undefined,
        audio_quality: item.format === 'audio' ? item.audioQuality : undefined,
        proxy: store.proxy || undefined,
      });
      store.setJobId(item.id, jobId);

      const unsub = subscribeProgress(jobId, (event) => {
        if (event.type === 'progress') {
          store.setProgress(item.id, event.percent, event.speed, event.eta);
        } else if (event.type === 'done') {
          store.setDone(item.id, event.filename);
          store.addToHistory(item, event.filename);
          unsub();
        } else if (event.type === 'error') {
          store.setStatus(item.id, 'error', event.message);
          unsub();
        }
      });
    } catch (e: unknown) {
      store.setStatus(item.id, 'error', e instanceof Error ? e.message : 'Ошибка');
    }
  }

  function handleSave() {
    if (!item.jobId) return;
    const a = document.createElement('a');
    a.href = getFileUrl(item.jobId);
    a.download = item.filename ?? 'download';
    a.click();
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {/* Шапка с thumbnail */}
      <div className="flex gap-3 p-4">
        {item.info?.thumbnail ? (
          <img
            src={item.info.thumbnail}
            alt={item.info.title}
            className="w-28 h-16 object-cover rounded-lg flex-shrink-0"
            style={{ background: 'var(--surface2)' }}
          />
        ) : (
          <div
            className="w-28 h-16 rounded-lg flex-shrink-0 flex items-center justify-center"
            style={{ background: 'var(--surface2)' }}
          >
            <span className="text-2xl">🎬</span>
          </div>
        )}

        <div className="flex-1 min-w-0">
          {item.info ? (
            <>
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                {item.info.title}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
                {item.info.uploader}
                {item.info.duration && ` · ${formatDuration(item.info.duration)}`}
              </p>
            </>
          ) : (
            <p className="text-xs truncate" style={{ color: 'var(--text-dim)' }}>
              {item.url}
            </p>
          )}

          {/* Статус/ошибка */}
          {item.status === 'error' && (
            <p className="text-xs mt-1" style={{ color: 'var(--error)' }}>
              ✗ {item.error}
            </p>
          )}
        </div>

        {/* Кнопка удаления карточки */}
        <button
          onClick={() => store.removeItem(item.id)}
          className="self-start text-lg leading-none opacity-40 hover:opacity-80 transition-opacity"
          style={{ color: 'var(--text-dim)' }}
          title="Убрать"
        >
          ×
        </button>
      </div>

      {/* Контролы — показываем когда info загружена */}
      {item.info && item.status !== 'error' && (
        <div
          className="px-4 pb-4 flex flex-wrap items-center gap-3"
        >
          {/* Формат: Video / Audio */}
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {(['video', 'audio'] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => store.setFormat(item.id, fmt)}
                disabled={item.status === 'downloading' || item.status === 'done'}
                className="px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                style={{
                  background: item.format === fmt ? 'var(--accent)' : 'transparent',
                  color: item.format === fmt ? '#fff' : 'var(--text-dim)',
                }}
              >
                {fmt === 'video' ? '🎬 Видео' : '🎵 Аудио'}
              </button>
            ))}
          </div>

          {/* Аудио-формат (только для audio) */}
          {item.format === 'audio' && (
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {AUDIO_FORMATS.map((af) => (
                <button
                  key={af.value}
                  onClick={() => store.setAudioFormat(item.id, af.value)}
                  disabled={item.status === 'downloading' || item.status === 'done'}
                  className="px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                  style={{
                    background: item.audioFormat === af.value ? 'var(--surface2)' : 'transparent',
                    color: item.audioFormat === af.value ? 'var(--text)' : 'var(--text-dim)',
                    borderLeft: af.value !== 'mp3' ? '1px solid var(--border)' : undefined,
                  }}
                  title={af.lossless ? 'Lossless — без потерь' : undefined}
                >
                  {af.label}
                  {af.lossless && (
                    <span
                      className="ml-1 text-xs"
                      style={{ color: 'var(--success)', fontSize: '9px' }}
                    >
                      ✦
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Качество аудио — только для форматов с потерями */}
          {item.format === 'audio' && !['flac', 'wav'].includes(item.audioFormat) && (
            <select
              value={item.audioQuality}
              onChange={(e) => store.setAudioQuality(item.id, e.target.value as AudioQuality)}
              disabled={item.status === 'downloading' || item.status === 'done'}
              className="px-2.5 py-1.5 text-xs rounded-lg outline-none disabled:opacity-50"
              style={{
                background: 'var(--surface2)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
              }}
            >
              {AUDIO_QUALITIES.map((q) => (
                <option key={q.value} value={q.value}>{q.label}</option>
              ))}
            </select>
          )}

          {/* Качество видео */}
          {item.format === 'video' && item.info.formats.length > 0 && (
            <select
              value={item.formatId ?? ''}
              onChange={(e) => store.setFormatId(item.id, e.target.value || null)}
              disabled={item.status === 'downloading' || item.status === 'done'}
              className="px-3 py-1.5 text-xs rounded-lg outline-none disabled:opacity-50"
              style={{
                background: 'var(--surface2)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
              }}
            >
              {item.info.formats.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          )}

          {/* Кнопки действий */}
          <div className="ml-auto flex items-center gap-2">
            {/* Транскрипт — доступен когда инфо загружена */}
            {item.info && (
              <button
                onClick={() => setShowTranscript(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: 'var(--surface2)',
                  color: 'var(--text-dim)',
                  border: '1px solid var(--border)',
                }}
                title="Извлечь транскрипт / субтитры"
              >
                📄 Транскрипт
              </button>
            )}

            {item.status === 'ready' && (
              <button
                onClick={handleDownload}
                className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                ↓ Скачать
              </button>
            )}

            {item.status === 'fetching' && (
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                Загрузка...
              </span>
            )}

            {item.status === 'done' && (
              <button
                onClick={handleSave}
                className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={{ background: 'var(--success)', color: '#000' }}
              >
                ✓ Сохранить файл
              </button>
            )}
          </div>
        </div>
      )}

      {/* Прогресс-бар */}
      {item.status === 'downloading' && (
        <div className="px-4 pb-4">
          <div
            className="rounded-full overflow-hidden h-1.5 mb-1.5"
            style={{ background: 'var(--surface2)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${item.progress}%`, background: 'var(--accent)' }}
            />
          </div>
          <div className="flex justify-between text-xs" style={{ color: 'var(--text-dim)' }}>
            <span>{item.progress.toFixed(1)}%{item.speed ? ` · ${item.speed}` : ''}</span>
            {item.eta && <span>ETA {item.eta}</span>}
          </div>
        </div>
      )}

      {/* idle — кнопка загрузить инфо */}
      {item.status === 'idle' && (
        <div className="px-4 pb-4">
          <button
            onClick={handleFetch}
            className="text-xs px-3 py-1.5 rounded-lg transition-all"
            style={{
              background: 'var(--surface2)',
              color: 'var(--text-dim)',
              border: '1px solid var(--border)',
            }}
          >
            Получить инфо
          </button>
        </div>
      )}

      {/* Transcript modal */}
      {showTranscript && item.info && (
        <TranscriptModal
          url={item.url}
          title={item.info.title}
          onClose={() => setShowTranscript(false)}
        />
      )}
    </div>
  );
}
