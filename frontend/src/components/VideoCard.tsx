import { useState } from 'react';
import { AudioFormat, AudioQuality, DownloadItem, useDownloads } from '../store/downloads';
import { deleteJob, fetchInfo, startDownload, subscribeProgress, getFileUrl, formatDuration } from '../api/media';
import { TranscriptModal } from './TranscriptModal';

const AUDIO_FORMATS: { value: AudioFormat; label: string; lossless?: boolean }[] = [
  { value: 'mp3', label: 'MP3' },
  { value: 'flac', label: 'FLAC', lossless: true },
  { value: 'opus', label: 'Opus' },
  { value: 'm4a', label: 'M4A' },
];

const AUDIO_QUALITIES: { value: AudioQuality; label: string }[] = [
  { value: 'best', label: 'Best' },
  { value: '320', label: '320k' },
  { value: '192', label: '192k' },
  { value: '128', label: '128k' },
];

interface Props { item: DownloadItem; }

export function VideoCard({ item }: Props) {
  const store = useDownloads();
  const [showTranscript, setShowTranscript] = useState(false);

  async function handleFetch() {
    store.setStatus(item.id, 'fetching');
    try {
      const info = await fetchInfo(item.url, store.proxy || undefined);
      store.setInfo(item.id, info);
      if (info.formats.length > 0) store.setFormatId(item.id, info.formats[0].id);
    } catch (e: unknown) {
      store.setStatus(item.id, 'error', e instanceof Error ? e.message : 'Ошибка');
    }
  }

  async function handleDownload() {
    if (!item.info || !item.rightsConfirmed) return;
    store.setStatus(item.id, 'downloading');
    if (item.requestId) store.setRequestStatus(item.requestId, 'in_progress');
    try {
      const jobId = await startDownload({
        url: item.url, format: item.format,
        format_id: item.format === 'video' ? (item.formatId ?? undefined) : undefined,
        title: item.info.title,
        audio_format: item.format === 'audio' ? item.audioFormat : undefined,
        audio_quality: item.format === 'audio' ? item.audioQuality : undefined,
        proxy: store.proxy || undefined,
        rights_confirmed: item.rightsConfirmed,
        preset: item.preset,
        subtitle_mode: item.format === 'video' ? item.subtitleMode : 'none',
        subtitle_lang: item.subtitleLang,
      });
      store.setJobId(item.id, jobId);
      const unsub = subscribeProgress(jobId, (event) => {
        if (event.type === 'progress') store.setProgress(item.id, event.percent, event.speed, event.eta);
        else if (event.type === 'done') { store.setDone(item.id, event.filename); store.addToHistory(item, event.filename); unsub(); }
        else if (event.type === 'error') { store.setStatus(item.id, 'error', event.message); if (item.requestId) store.setRequestStatus(item.requestId, 'planned'); unsub(); }
      });
    } catch (e: unknown) {
      store.setStatus(item.id, 'error', e instanceof Error ? e.message : 'Ошибка');
      if (item.requestId) store.setRequestStatus(item.requestId, 'planned');
    }
  }

  function handleSave() {
    if (!item.jobId) return;
    const a = document.createElement('a');
    a.href = getFileUrl(item.jobId);
    a.download = item.filename ?? 'download';
    a.click();
  }

  const disabled = item.status === 'downloading' || item.status === 'done';
  const subtitleLangValid = item.subtitleMode === 'none' || /^[A-Za-z0-9._-]{1,20}$/.test(item.subtitleLang);

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all eclipse-card"
      style={{
        background: 'var(--surface)',
        border: `1px solid ${item.status === 'error' ? 'rgba(255,79,79,0.3)' : item.status === 'done' ? 'rgba(48,216,136,0.2)' : 'var(--border)'}`,
      }}
    >
      {/* Header — thumbnail + title */}
      <div className="flex gap-3.5 p-4">
        {item.info?.thumbnail ? (
          <img src={item.info.thumbnail} alt="" className="w-24 h-14 object-cover rounded-xl flex-shrink-0" style={{ background: 'var(--surface2)' }} />
        ) : (
          <div className="w-24 h-14 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--surface2), var(--surface3))' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5"><polygon points="5 3 19 12 5 21 5 3" /></svg>
          </div>
        )}

        <div className="flex-1 min-w-0">
          {item.info ? (
            <>
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{item.info.title}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="mono" style={{ color: 'var(--text-dim)' }}>{item.info.uploader}</span>
                {item.info.duration && (
                  <span className="tag" style={{ padding: '1px 6px', fontSize: '10px' }}>{formatDuration(item.info.duration)}</span>
                )}
              </div>
            </>
          ) : (
            <p className="text-xs truncate mono" style={{ color: 'var(--text-dim)' }}>{item.url}</p>
          )}
          {item.status === 'error' && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <p className="text-xs flex items-center gap-1" style={{ color: 'var(--error)' }}>
                <span>✕</span> {item.error}
              </p>
              <button onClick={handleFetch} className="btn-ghost" style={{ padding: '4px 8px', fontSize: '10px' }}>
                ↻ Обновить данные
              </button>
            </div>
          )}
        </div>

        <button onClick={async () => { if (item.status === 'downloading' && !window.confirm('Остановить текущую загрузку?')) return; if (item.jobId) await deleteJob(item.jobId).catch(() => undefined); if (item.requestId && item.status !== 'done') store.setRequestStatus(item.requestId, 'planned'); store.removeItem(item.id); }} aria-label="Убрать задачу" className="self-start p-1 rounded-lg transition-colors" style={{ color: 'var(--text-dim)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--error)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-dim)')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Controls */}
      {item.info && item.status !== 'error' && (
        <div className="px-4 pb-4 flex flex-wrap items-center gap-2.5">
          <label className="rights-confirmation">
            <input
              type="checkbox"
              checked={item.rightsConfirmed}
              onChange={(event) => store.setRightsConfirmed(item.id, event.target.checked)}
              disabled={disabled}
            />
            <span><strong>У меня есть право обработать этот материал</strong><small>Авторский контент, разрешение автора или допустимое законом использование.</small></span>
          </label>

          {/* Format toggle */}
          <div className="pill-group">
            {(['video', 'audio'] as const).map((fmt) => (
              <button key={fmt} onClick={() => store.setFormat(item.id, fmt)} disabled={disabled}
                className={`pill ${item.format === fmt ? 'active' : ''}`}>
                {fmt === 'video' ? '▶ Видео' : '♫ Аудио'}
              </button>
            ))}
          </div>

          {/* Audio format pills */}
          {item.format === 'audio' && (
            <div className="pill-group">
              {AUDIO_FORMATS.map((af) => (
                <button key={af.value} onClick={() => store.setAudioFormat(item.id, af.value)} disabled={disabled}
                  className={`pill ${item.audioFormat === af.value ? 'active' : ''}`}>
                  {af.label}{af.lossless && <span style={{ color: 'var(--accent2)', marginLeft: 2, fontSize: 9 }}>✦</span>}
                </button>
              ))}
            </div>
          )}

          {/* Audio quality */}
          {item.format === 'audio' && !['flac', 'wav'].includes(item.audioFormat) && (
            <select value={item.audioQuality} onChange={(e) => store.setAudioQuality(item.id, e.target.value as AudioQuality)} disabled={disabled}
              className="btn-ghost" style={{ padding: '5px 10px', fontSize: '11px', appearance: 'auto' }}>
              {AUDIO_QUALITIES.map((q) => (<option key={q.value} value={q.value}>{q.label}</option>))}
            </select>
          )}

          {/* Video quality */}
          {item.format === 'video' && item.info.formats.length > 0 && (
            <select value={item.formatId ?? ''} onChange={(e) => store.setFormatId(item.id, e.target.value || null)} disabled={disabled}
              className="btn-ghost" style={{ padding: '5px 10px', fontSize: '11px', appearance: 'auto' }}>
              {item.info.formats.map((f) => (<option key={f.id} value={f.id}>{f.label}</option>))}
            </select>
          )}

          <details className="download-options">
            <summary>Дополнительно</summary>
            <div className="download-options__grid">
              <label>
                <span>Файл</span>
                <select value={item.preset} onChange={(event) => store.setPreset(item.id, event.target.value as 'standard' | 'archive')} disabled={disabled}>
                  <option value="standard">Обычный</option>
                  <option value="archive">Архивный · metadata + обложка</option>
                </select>
              </label>
              {item.format === 'video' && <label>
                <span>Субтитры</span>
                <select value={item.subtitleMode} onChange={(event) => store.setSubtitleMode(item.id, event.target.value as 'none' | 'manual' | 'auto')} disabled={disabled}>
                  <option value="none">Не добавлять</option>
                  <option value="manual">Авторские</option>
                  <option value="auto">Автоматические</option>
                </select>
              </label>}
              {item.format === 'video' && item.subtitleMode !== 'none' && (
                <label>
                  <span>Язык</span>
                  <input value={item.subtitleLang} onChange={(event) => store.setSubtitleLang(item.id, event.target.value)} maxLength={20} pattern="[A-Za-z0-9._-]+" placeholder="ru или en-US" aria-invalid={!subtitleLangValid} disabled={disabled} />
                  {!subtitleLangValid && <small className="download-options__error">Например: ru, en или en-US</small>}
                </label>
              )}
            </div>
            <p>Только проверенные параметры yt-dlp. Произвольные CLI-команды отключены.</p>
          </details>

          {/* Action buttons */}
          <div className="ml-auto flex items-center gap-2">
            {item.info && (
              <button onClick={() => setShowTranscript(true)} disabled={!item.rightsConfirmed} className="btn-ghost" style={{ fontSize: '11px' }}>
                📄 Транскрипт
              </button>
            )}

            {item.status === 'ready' && (
              <button onClick={handleDownload} disabled={!item.rightsConfirmed || !subtitleLangValid} className="btn-primary btn-eclipse">
                ↓ Скачать
              </button>
            )}
            {item.status === 'fetching' && (
              <span className="flex items-center gap-2 mono" style={{ color: 'var(--text-dim)' }}>
                <span className="inline-block w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Загрузка...
              </span>
            )}
            {item.status === 'done' && (
              <button onClick={handleSave} className="btn-success">
                ✓ Сохранить
              </button>
            )}
          </div>
        </div>
      )}

      {/* Progress */}
      {item.status === 'downloading' && (
        <div className="px-4 pb-4">
          <div className="progress-track">
            <div className="progress-fill eclipse-progress" style={{ width: `${item.progress}%` }} />
          </div>
          <div className="flex justify-between mt-2 mono" style={{ color: 'var(--text-dim)' }}>
            <span>{item.progress.toFixed(1)}%{item.speed ? ` · ${item.speed}` : ''}</span>
            {item.eta && <span>ETA {item.eta}</span>}
          </div>
        </div>
      )}

      {/* Idle — fetch button */}
      {item.status === 'idle' && (
        <div className="px-4 pb-4">
          <button onClick={handleFetch} className="btn-ghost">Получить инфо</button>
        </div>
      )}

      {showTranscript && item.info && (
        <TranscriptModal url={item.url} title={item.info.title} rightsConfirmed={item.rightsConfirmed} onComplete={() => { if (item.requestId) store.setRequestStatus(item.requestId, 'done'); }} onClose={() => setShowTranscript(false)} />
      )}
    </div>
  );
}
