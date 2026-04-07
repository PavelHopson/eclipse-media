import { useState, useRef } from 'react';

interface Props {
  onSubmit: (urls: string[]) => void;
  loading: boolean;
}

export function UrlInput({ onSubmit, loading }: Props) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const urls = value
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u.length > 0);
    if (urls.length === 0) return;
    onSubmit(urls);
    setValue('');
  }

  function handlePaste(e: React.ClipboardEvent) {
    // Авто-сабмит при вставке одиночной ссылки
    const text = e.clipboardData.getData('text').trim();
    if (text.startsWith('http') && !text.includes('\n')) {
      e.preventDefault();
      setValue('');
      onSubmit([text]);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div
        className="relative rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onPaste={handlePaste}
          rows={3}
          placeholder="Вставьте ссылку на видео (YouTube, TikTok, Instagram...)&#10;Несколько ссылок — каждую на новой строке"
          className="w-full resize-none px-4 py-3 text-sm outline-none placeholder:text-[var(--text-dim)]"
          style={{
            background: 'transparent',
            color: 'var(--text)',
            fontFamily: 'inherit',
          }}
          disabled={loading}
        />
        <div
          className="flex items-center justify-between px-4 py-2"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
            1000+ поддерживаемых сайтов
          </span>
          <button
            type="submit"
            disabled={loading || !value.trim()}
            className="px-5 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'var(--accent)',
              color: '#fff',
            }}
          >
            {loading ? 'Загрузка...' : 'Получить информацию'}
          </button>
        </div>
      </div>
    </form>
  );
}
