import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchTranscript, TranscriptResult } from '../api/media';

interface Props {
  url: string;
  title: string;
  rightsConfirmed: boolean;
  onComplete?: () => void;
  onClose: () => void;
}

const LANGUAGES = [
  { code: 'auto', label: 'Авто' },
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'RU' },
  { code: 'uk', label: 'UK' },
  { code: 'de', label: 'DE' },
  { code: 'fr', label: 'FR' },
  { code: 'es', label: 'ES' },
  { code: 'zh', label: 'ZH' },
  { code: 'ja', label: 'JA' },
  { code: 'ko', label: 'KO' },
];

export function TranscriptModal({ url, title, rightsConfirmed, onComplete, onClose }: Props) {
  const [lang, setLang] = useState('auto');
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<TranscriptResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<'text' | 'segments'>('text');
  const overlayRef = useRef<HTMLDivElement>(null);

  // Закрытие по Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleFetch = useCallback(async (selectedLang: string) => {
    try {
      const data = await fetchTranscript(url, selectedLang, rightsConfirmed);
      setResult(data);
      onComplete?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка получения транскрипта');
    } finally {
      setLoading(false);
    }
  }, [onComplete, rightsConfirmed, url]);

  // Загружаем сразу при открытии
  useEffect(() => {
    const task = window.setTimeout(() => {
      void handleFetch('auto');
    }, 0);
    return () => window.clearTimeout(task);
  }, [handleFetch]);

  function handleLangChange(newLang: string) {
    setLang(newLang);
    setLoading(true);
    setError(null);
    setResult(null);
    handleFetch(newLang);
  }

  async function handleCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    if (!result) return;
    const blob = new Blob([result.text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title.slice(0, 60).replace(/[\\/:*?"<>|]/g, '')}_transcript_${result.language}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function handleDownloadSrt() {
    if (!result) return;
    // Реконструируем SRT из сегментов
    const srtLines = result.segments.map((seg, i) =>
      `${i + 1}\n${seg.start} --> ${seg.end}\n${seg.text}\n`
    );
    const blob = new Blob([srtLines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title.slice(0, 60).replace(/[\\/:*?"<>|]/g, '')}_${result.language}.srt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transcript-title"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          maxHeight: '85vh',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <span className="text-lg">📄</span>
          <div className="flex-1 min-w-0">
            <p id="transcript-title" className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
              Транскрипт
            </p>
            <p className="text-xs truncate" style={{ color: 'var(--text-dim)' }}>
              {title}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть транскрипт"
            className="text-xl leading-none opacity-40 hover:opacity-80 transition-opacity flex-shrink-0"
            style={{ color: 'var(--text-dim)' }}
          >
            ×
          </button>
        </div>

        {/* Toolbar */}
        <div
          className="flex items-center gap-2 px-5 py-3 flex-wrap flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          {/* Language selector */}
          <div className="flex rounded-lg overflow-hidden flex-shrink-0" style={{ border: '1px solid var(--border)' }}>
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => handleLangChange(l.code)}
                disabled={loading}
                className="px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40"
                style={{
                  background: lang === l.code ? 'var(--accent)' : 'transparent',
                  color: lang === l.code ? '#fff' : 'var(--text-dim)',
                }}
              >
                {l.label}
              </button>
            ))}
          </div>

          {/* View toggle */}
          {result && (
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {(['text', 'segments'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className="px-3 py-1 text-xs font-medium transition-colors"
                  style={{
                    background: view === v ? 'var(--surface2)' : 'transparent',
                    color: view === v ? 'var(--text)' : 'var(--text-dim)',
                  }}
                >
                  {v === 'text' ? 'Текст' : 'Временные метки'}
                </button>
              ))}
            </div>
          )}

          {/* Right actions */}
          {result && (
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={handleCopy}
                className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
                style={{ background: 'var(--surface2)', color: copied ? 'var(--success)' : 'var(--text-dim)' }}
              >
                {copied ? '✓ Скопировано' : '⎘ Копировать'}
              </button>
              <button
                onClick={handleDownload}
                className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
                style={{ background: 'var(--surface2)', color: 'var(--text-dim)' }}
                title="Скачать как .txt"
              >
                ↓ TXT
              </button>
              <button
                onClick={handleDownloadSrt}
                className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
                style={{ background: 'var(--surface2)', color: 'var(--text-dim)' }}
                title="Скачать как .srt"
              >
                ↓ SRT
              </button>
            </div>
          )}
        </div>

        {/* Meta strip */}
        {result && (
          <div
            className="flex items-center gap-3 px-5 py-2 text-xs flex-shrink-0 flex-wrap"
            style={{ background: 'var(--surface2)', color: 'var(--text-dim)' }}
          >
            <span>🌐 {result.language.toUpperCase()}</span>
            {result.auto_generated && (
              <span
                className="px-1.5 py-0.5 rounded text-xs"
                style={{ background: 'var(--border)', color: 'var(--text-dim)' }}
              >
                авто
              </span>
            )}
            <span>{result.segments_count} сегментов</span>
            <span>{result.text.split(' ').length.toLocaleString()} слов</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div
                className="w-8 h-8 rounded-full border-2 animate-spin"
                style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }}
              />
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
                Получение субтитров...
              </p>
            </div>
          )}

          {error && !loading && (
            <div className="py-8 text-center">
              <p className="text-2xl mb-3">🚫</p>
              <p className="text-sm font-medium" style={{ color: 'var(--error)' }}>{error}</p>
              <p className="text-xs mt-2" style={{ color: 'var(--text-dim)' }}>
                Попробуйте другой язык или видео без субтитров
              </p>
            </div>
          )}

          {result && !loading && (
            <>
              {view === 'text' && (
                <p
                  className="text-sm leading-relaxed whitespace-pre-wrap"
                  style={{ color: 'var(--text)' }}
                >
                  {result.text}
                </p>
              )}

              {view === 'segments' && (
                <div className="flex flex-col gap-2">
                  {result.segments.map((seg, i) => (
                    <div
                      key={i}
                      className="flex gap-3 text-xs rounded-lg px-3 py-2"
                      style={{ background: 'var(--surface2)' }}
                    >
                      <span
                        className="flex-shrink-0 font-mono pt-0.5"
                        style={{ color: 'var(--text-dim)' }}
                      >
                        {seg.start.slice(0, 8)}
                      </span>
                      <span style={{ color: 'var(--text)' }}>{seg.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
