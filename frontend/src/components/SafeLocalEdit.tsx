import { useMemo, useState, type CSSProperties } from 'react';
import {
  createLocalEditPlan,
  digestLocalEditPlan,
  formatEditTime,
  LOCAL_EDIT_PROFILE,
  serializeLocalEditPlan,
} from '../services/localEditPreview';

const DEMO_ASSET_ID = '00000000-0000-4000-8000-000000000005';
const DEMO_SOURCE_HASH = 'a'.repeat(64);
const DEMO_DURATION_MS = 120_000;

type PreviewReceipt = {
  id: string;
  digest: string;
  confirmedAt: string;
};

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function FilmIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 5v14M17 5v14M3 9h4M17 9h4M3 15h4M17 15h4" />
      <path d="m11 10 4 2-4 2Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SafeLocalEdit() {
  const [startSeconds, setStartSeconds] = useState(12);
  const [endSeconds, setEndSeconds] = useState(42);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [receipt, setReceipt] = useState<PreviewReceipt | null>(null);
  const [confirming, setConfirming] = useState(false);

  const result = useMemo(() => {
    try {
      return {
        plan: createLocalEditPlan({
          assetId: DEMO_ASSET_ID,
          sourceSha256: DEMO_SOURCE_HASH,
          sourceDurationMs: DEMO_DURATION_MS,
          startMs: Math.round(startSeconds * 1_000),
          endMs: Math.round(endSeconds * 1_000),
        }),
        error: null,
      };
    } catch (caught) {
      return {
        plan: null,
        error: caught instanceof Error ? caught.message : 'Проверьте границы клипа',
      };
    }
  }, [endSeconds, startSeconds]);

  const timelineStyle = {
    '--clip-start': `${Math.max(0, Math.min(100, (startSeconds / 120) * 100))}%`,
    '--clip-width': `${Math.max(0, Math.min(100, ((endSeconds - startSeconds) / 120) * 100))}%`,
  } as CSSProperties;

  function revise(setter: (value: number) => void, value: number) {
    setter(value);
    setReceipt(null);
  }

  async function confirmPreview() {
    if (!result.plan || !rightsConfirmed || confirming) return;
    setConfirming(true);
    try {
      const digest = await digestLocalEditPlan(result.plan);
      setReceipt({
        id: globalThis.crypto.randomUUID(),
        digest,
        confirmedAt: new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date()),
      });
    } finally {
      setConfirming(false);
    }
  }

  return (
    <section className="safe-edit" aria-labelledby="safe-edit-title">
      <header className="safe-edit__hero">
        <div>
          <p className="studio-eyebrow">БЕЗОПАСНЫЙ ЛОКАЛЬНЫЙ МОНТАЖ</p>
          <h1 id="safe-edit-title">Сначала покажите результат. Затем спросите разрешение.</h1>
          <p>Выберите границы одного клипа. Интерфейс сформирует только типизированный план обрезки — без команд, URL и скрытого запуска.</p>
        </div>
        <div className="safe-edit__contract" aria-label="Статус контура">
          <span>CONTRACT ONLY</span>
          <strong>Файл не изменяется</strong>
          <small>Исполнитель и публикация отключены</small>
        </div>
      </header>

      <ol className="safe-edit__steps" aria-label="Этапы безопасной операции">
        <li className={!receipt ? 'is-active' : 'is-complete'} aria-current={!receipt ? 'step' : undefined}>
          <span>{receipt ? <CheckIcon /> : '1'}</span><div><strong>Предпросмотр</strong><small>Точные границы</small></div>
        </li>
        <li className={receipt ? 'is-complete' : rightsConfirmed ? 'is-active' : ''} aria-current={!receipt && rightsConfirmed ? 'step' : undefined}>
          <span>{receipt ? <CheckIcon /> : '2'}</span><div><strong>Подтверждение</strong><small>Ручное решение</small></div>
        </li>
        <li className={receipt ? 'is-active' : ''} aria-current={receipt ? 'step' : undefined}>
          <span>3</span><div><strong>Квитанция</strong><small>Что разрешено</small></div>
        </li>
      </ol>

      <div className="safe-edit__layout">
        <article className="safe-edit__workspace" aria-labelledby="clip-preview-title">
          <div className="safe-edit__panel-heading">
            <div>
              <span className="safe-edit__index">01 / ИСХОДНИК</span>
              <h2 id="clip-preview-title">demo-release.mp4</h2>
            </div>
            <span className="safe-edit__source-status">Локальный MP4 · 02:00</span>
          </div>

          <div className="safe-edit__frame" aria-label="Схематичный предпросмотр выбранного клипа">
            <div className="safe-edit__frame-grid" />
            <div className="safe-edit__frame-copy">
              <span>ECLIPSE RELEASE</span>
              <strong>Выбранный фрагмент</strong>
              <small>{formatEditTime(startSeconds * 1_000)} — {formatEditTime(endSeconds * 1_000)}</small>
            </div>
            <FilmIcon />
          </div>

          <div className="safe-edit__timeline" style={timelineStyle}>
            <div className="safe-edit__timeline-track" aria-hidden="true"><span /></div>
            <div className="safe-edit__timeline-labels"><span>00:00</span><span>01:00</span><span>02:00</span></div>
          </div>

          <div className="safe-edit__controls">
            <label>
              <span>Начало, сек</span>
              <input type="number" min="0" max="119" step="1" value={startSeconds} onChange={(event) => revise(setStartSeconds, Number(event.target.value))} />
              <input className="safe-edit__range" aria-label="Начало клипа" type="range" min="0" max="119" step="1" value={startSeconds} onChange={(event) => revise(setStartSeconds, Number(event.target.value))} />
            </label>
            <label>
              <span>Конец, сек</span>
              <input type="number" min="1" max="120" step="1" value={endSeconds} onChange={(event) => revise(setEndSeconds, Number(event.target.value))} />
              <input className="safe-edit__range" aria-label="Конец клипа" type="range" min="1" max="120" step="1" value={endSeconds} onChange={(event) => revise(setEndSeconds, Number(event.target.value))} />
            </label>
          </div>

          <div className={result.error ? 'safe-edit__selection is-error' : 'safe-edit__selection'} role="status">
            <div><span>Начало</span><strong>{formatEditTime(startSeconds * 1_000)}</strong></div>
            <div><span>Конец</span><strong>{formatEditTime(endSeconds * 1_000)}</strong></div>
            <div><span>Длительность</span><strong>{result.error ? '—' : `${endSeconds - startSeconds} сек`}</strong></div>
            {result.error && <p>{result.error}</p>}
          </div>
        </article>

        <aside className="safe-edit__approval" aria-labelledby="approval-title">
          {!receipt ? (
            <>
              <div className="safe-edit__panel-heading">
                <div><span className="safe-edit__index">02 / РАЗРЕШЕНИЕ</span><h2 id="approval-title">Проверьте действие</h2></div>
              </div>
              <ul className="safe-edit__checks">
                <li><CheckIcon /><span><strong>Только обрезка</strong><small>Без фильтров, shell-команд и произвольных параметров</small></span></li>
                <li><CheckIcon /><span><strong>Исходник привязан к SHA-256</strong><small>Изменённый файл потребует нового предпросмотра</small></span></li>
                <li><CheckIcon /><span><strong>Профиль фиксирован</strong><small>MP4 · H.264 · AAC · 720p</small></span></li>
                <li><CheckIcon /><span><strong>Публикация не разрешается</strong><small>Это решение относится только к подготовке клипа</small></span></li>
              </ul>

              <details className="safe-edit__plan">
                <summary>Показать точный план</summary>
                <code>{result.plan ? serializeLocalEditPlan(result.plan) : 'Исправьте границы клипа'}</code>
              </details>

              <label className="safe-edit__rights">
                <input type="checkbox" checked={rightsConfirmed} onChange={(event) => { setRightsConfirmed(event.target.checked); setReceipt(null); }} />
                <span><strong>У меня есть право обработать этот файл</strong><small>Подтверждение не передаётся агенту и не разрешает публикацию.</small></span>
              </label>

              <button className="safe-edit__confirm" type="button" disabled={!result.plan || !rightsConfirmed || confirming} onClick={confirmPreview}>
                {confirming ? 'Проверяем план…' : 'Подтвердить подготовку клипа'}
              </button>
              <p className="safe-edit__boundary">Сейчас кнопка создаёт только локальную квитанцию предпросмотра. Кодирование файла отключено до появления изолированного worker.</p>
            </>
          ) : (
            <div className="safe-edit__receipt" aria-live="polite">
              <div className="safe-edit__receipt-icon"><CheckIcon /></div>
              <span className="safe-edit__index">03 / КВИТАНЦИЯ</span>
              <h2 id="approval-title">Предпросмотр подтверждён</h2>
              <p>Границы и исходник зафиксированы. Экспорт, сеть и публикация не запускались.</p>
              <dl>
                <div><dt>Интервал</dt><dd>{formatEditTime(startSeconds * 1_000)} — {formatEditTime(endSeconds * 1_000)}</dd></div>
                <div><dt>Профиль</dt><dd>{LOCAL_EDIT_PROFILE}</dd></div>
                <div><dt>Digest плана</dt><dd>{receipt.digest.slice(0, 16)}…</dd></div>
                <div><dt>Зафиксировано</dt><dd>{receipt.confirmedAt}</dd></div>
                <div><dt>ID квитанции</dt><dd>{receipt.id.slice(0, 8)}</dd></div>
              </dl>
              <div className="safe-edit__not-run"><strong>Файл не создан</strong><span>Для экспорта нужен отдельный проверенный исполнитель.</span></div>
              <button className="btn-ghost" type="button" onClick={() => setReceipt(null)}>Изменить границы</button>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
