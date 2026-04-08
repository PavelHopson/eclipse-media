import { useState } from 'react';
import { useDownloads } from '../store/downloads';
import { testProxy } from '../api/media';

export function ProxySettings() {
  const { proxy, setProxy } = useDownloads();
  const [input, setInput] = useState(proxy);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [open, setOpen] = useState(false);

  async function handleTest() {
    if (!input.trim()) return;
    setTesting(true);
    setResult(null);
    try {
      const res = await testProxy(input.trim());
      setResult(res);
    } catch {
      setResult({ ok: false, message: 'Ошибка соединения с сервером' });
    }
    setTesting(false);
  }

  function handleSave() {
    setProxy(input.trim());
    setResult(null);
  }

  function handleClear() {
    setInput('');
    setProxy('');
    setResult(null);
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-xs transition-colors"
        style={{ color: proxy ? 'var(--success)' : 'var(--text-dim)' }}
      >
        <span>{proxy ? '🔒' : '🌐'}</span>
        <span>{proxy ? 'Прокси активен' : 'Настроить прокси'}</span>
        <span className="opacity-50">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div
          className="mt-3 p-4 rounded-xl"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="text-xs mb-3" style={{ color: 'var(--text-dim)' }}>
            Для YouTube в России нужен прокси. Формат: <code className="px-1 rounded" style={{ background: 'var(--surface2)' }}>socks5://host:port</code> или <code className="px-1 rounded" style={{ background: 'var(--surface2)' }}>http://host:port</code>
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="socks5://127.0.0.1:1080"
              className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: 'var(--surface2)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
              }}
            />
            <button
              onClick={handleSave}
              disabled={input.trim() === proxy}
              className="btn-primary" style={{ padding: '7px 14px' }
            >
              Сохранить
            </button>
          </div>

          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={handleTest}
              disabled={!input.trim() || testing}
              className="px-3 py-1.5 rounded-lg text-xs transition-all disabled:opacity-30"
              style={{ background: 'var(--surface2)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}
            >
              {testing ? '⏳ Проверка...' : '🧪 Тест'}
            </button>

            {proxy && (
              <button
                onClick={handleClear}
                className="px-3 py-1.5 rounded-lg text-xs transition-all"
                style={{ color: 'var(--error)' }}
              >
                ✕ Отключить
              </button>
            )}

            {result && (
              <span
                className="text-xs ml-2"
                style={{ color: result.ok ? 'var(--success)' : 'var(--error)' }}
              >
                {result.ok ? '✓ ' : '✗ '}{result.message}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
