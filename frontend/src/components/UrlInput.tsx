import { useState, useRef, useEffect } from 'react';

interface Props {
  onSubmit: (urls: string[]) => void;
  loading: boolean;
}

export function UrlInput({ onSubmit, loading }: Props) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = Math.min(ref.current.scrollHeight, 120) + 'px';
    }
  }, [value]);

  function handleSubmit() {
    const urls = value.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('http'));
    if (urls.length > 0) { onSubmit(urls); setValue(''); }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  }

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      style={{
        background: value
          ? 'linear-gradient(var(--surface), var(--surface)) padding-box, linear-gradient(135deg, var(--accent), var(--accent-light), var(--accent2)) border-box'
          : 'var(--surface)',
        border: value ? '1px solid transparent' : '1px solid var(--border)',
        boxShadow: value
          ? '0 0 0 1px rgba(107,163,255,0.3), 0 4px 28px rgba(107,163,255,0.18), 0 0 60px rgba(107,163,255,0.06)'
          : 'none',
        transition: 'border-color 0.3s, box-shadow 0.3s, background 0.3s',
      }}
    >
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Вставьте ссылку на видео..."
        rows={1}
        className="w-full px-5 pt-4 pb-2 text-sm resize-none outline-none"
        style={{ background: 'transparent', color: 'var(--text)', minHeight: '44px' }}
      />
      <div className="flex items-center justify-between px-4 pb-3">
        <span className="mono" style={{ color: 'var(--text-dim)' }}>Enter — отправить · Shift+Enter — новая строка</span>
        <button onClick={handleSubmit} disabled={!value.trim() || loading} className="btn-primary btn-eclipse">
          {loading ? (<><span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Загрузка...</>) : 'Получить →'}
        </button>
      </div>
    </div>
  );
}
