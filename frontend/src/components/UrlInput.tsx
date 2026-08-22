import { useState, useRef, useEffect } from 'react';

interface Props {
  onSubmit: (urls: string[]) => void;
  loading: boolean;
}

export function UrlInput({ onSubmit, loading }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  const lines = value.split('\n').map((line) => line.trim()).filter(Boolean);
  const validUrls = lines.filter((line) => /^https?:\/\//i.test(line));

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = Math.min(ref.current.scrollHeight, 120) + 'px';
    }
  }, [value]);

  function handleSubmit() {
    if (lines.length === 0) {
      setError('Вставьте хотя бы одну ссылку.');
      ref.current?.focus();
      return;
    }
    if (validUrls.length !== lines.length) {
      setError('Каждая строка должна начинаться с http:// или https://');
      ref.current?.focus();
      return;
    }
    if (validUrls.length > 10) {
      setError('За один раз можно проверить не более 10 ссылок.');
      ref.current?.focus();
      return;
    }
    setError('');
    onSubmit(validUrls);
    setValue('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  }

  return (
    <div className={`url-field ${value ? 'has-value' : ''} ${error ? 'has-error' : ''}`}>
      <label className="sr-only" htmlFor="media-url-input">Ссылки на видео</label>
      <textarea
        id="media-url-input"
        ref={ref}
        value={value}
        onChange={(e) => { setValue(e.target.value); if (error) setError(''); }}
        onKeyDown={handleKeyDown}
        placeholder="https://vkvideo.ru/video-…"
        rows={1}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'url-input-error' : 'url-input-help'}
        className="url-field__input"
      />
      <div className="url-field__footer">
        <span id={error ? 'url-input-error' : 'url-input-help'} className={error ? 'url-field__error' : 'url-field__hint'} aria-live="polite">
          {error || (lines.length > 1 ? `${lines.length} ссылок добавлено` : 'Enter — проверить · Shift+Enter — новая строка')}
        </span>
        <button type="button" onClick={handleSubmit} disabled={!value.trim() || loading} className="btn-primary btn-eclipse">
          {loading ? (<><span className="button-spinner" aria-hidden="true" /> Проверяем...</>) : 'Проверить ссылку'}
        </button>
      </div>
    </div>
  );
}
