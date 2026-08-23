import { useId } from 'react';

export type SaveReceiptState = 'ready' | 'saving' | 'saved' | 'browser-requested' | 'error';

interface Props {
  desktop: boolean;
  error: string | null;
  fileName: string;
  onSave: () => void;
  onTranscript: () => void;
  state: SaveReceiptState;
}

const COPY: Record<SaveReceiptState, { eyebrow: string; title: string; detail: string }> = {
  ready: {
    eyebrow: 'Финальный файл',
    title: 'Файл готов к сохранению',
    detail: 'Выберите место на устройстве — исходник в очереди хранится временно.',
  },
  saving: {
    eyebrow: 'Локальная запись',
    title: 'Сохраняем файл',
    detail: 'Не закрывайте приложение, пока запись на устройство не завершится.',
  },
  saved: {
    eyebrow: 'Готово',
    title: 'Файл сохранён',
    detail: 'Запись завершена в выбранной вами папке. Можно сохранить ещё одну копию.',
  },
  'browser-requested': {
    eyebrow: 'Передано браузеру',
    title: 'Загрузка запущена',
    detail: 'Фактическое завершение и папку назначения покажет менеджер загрузок браузера.',
  },
  error: {
    eyebrow: 'Нужен повтор',
    title: 'Сохранение не завершено',
    detail: 'Готовый файл остался в локальной очереди — можно безопасно повторить.',
  },
};

export function SaveReceipt({ desktop, error, fileName, onSave, onTranscript, state }: Props) {
  const titleId = useId();
  const copy = COPY[state];
  const buttonLabel = state === 'saving'
    ? 'Сохраняем…'
    : state === 'saved'
      ? 'Сохранить копию'
      : state === 'browser-requested'
        ? 'Скачать ещё раз'
        : state === 'error'
          ? 'Повторить сохранение'
          : desktop ? 'Сохранить файл' : 'Скачать файл';

  return (
    <section
      className={`save-receipt is-${state}`}
      aria-busy={state === 'saving'}
      aria-labelledby={titleId}
    >
      <div className="save-receipt__signal" aria-hidden="true">
        {state === 'saving' ? <span className="button-spinner" /> : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            {state === 'error'
              ? <><path d="M12 8v5"/><path d="M12 17h.01"/><path d="M10.3 3.8 2.2 18a2 2 0 0 0 1.8 3h16a2 2 0 0 0 1.8-3L13.7 3.8a2 2 0 0 0-3.4 0Z"/></>
              : <><path d="M6 2h9l4 4v16H6z"/><path d="M14 2v5h5"/><path d="m9 14 2 2 4-4"/></>}
          </svg>
        )}
      </div>

      <div className="save-receipt__copy" aria-live="polite" aria-atomic="true">
        <span className="save-receipt__eyebrow mono">{copy.eyebrow}</span>
        <h3 id={titleId}>{copy.title}</h3>
        <p>{copy.detail}</p>
        <span className="save-receipt__file mono" dir="auto" title={fileName}>{fileName}</span>
        {error && <span className="save-receipt__error" role="alert">{error}</span>}
      </div>

      <div className="save-receipt__actions">
        <button type="button" onClick={onSave} disabled={state === 'saving'} className="btn-success">
          {state === 'saving' && <span className="button-spinner" aria-hidden="true" />}
          {buttonLabel}
        </button>
        <button type="button" onClick={onTranscript} disabled={state === 'saving'} className="btn-ghost">
          Транскрипт
        </button>
      </div>
    </section>
  );
}
