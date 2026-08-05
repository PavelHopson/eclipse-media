import { FormEvent, useMemo, useState } from 'react';
import { MediaIntent, MediaRequest, useDownloads } from '../store/downloads';

interface Props {
  onPrepare: (request: MediaRequest) => Promise<void>;
}

const INTENTS: Array<{ value: MediaIntent; label: string; description: string; action: string }> = [
  { value: 'watch', label: 'Посмотреть позже', description: 'Сохранить источник без скачивания.', action: 'Открыть источник' },
  { value: 'video', label: 'Скачать видео', description: 'Подготовить выбор качества и загрузку файла.', action: 'Подготовить видео' },
  { value: 'audio', label: 'Извлечь аудио', description: 'Выбрать MP3, FLAC, Opus или M4A.', action: 'Подготовить аудио' },
  { value: 'transcript', label: 'Получить текст', description: 'Найти субтитры и собрать транскрипт.', action: 'Подготовить транскрипт' },
];

const PROJECTS = [
  'Личное',
  'Eclipse Forge Landing',
  'Eclipse Library',
  'Eclipse Chat',
  'Eclipse AI Hub',
  'Eclipse Media',
  'Shotforge',
  'Educator-AI',
];

function normalizeUrl(value: string): string {
  const parsed = new URL(value.trim());
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Нужна обычная публичная HTTP(S) ссылка без логина и пароля.');
  }
  parsed.hash = '';
  return parsed.toString();
}

function requestLabel(request: MediaRequest): string {
  if (request.title.trim()) return request.title.trim();
  try {
    return new URL(request.url).hostname;
  } catch {
    return 'Материал без названия';
  }
}

export function MediaIntake({ onPrepare }: Props) {
  const store = useDownloads();
  const [url, setUrl] = useState('');
  const [intent, setIntent] = useState<MediaIntent>('watch');
  const [project, setProject] = useState(PROJECTS[0]);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const activeRequests = useMemo(
    () => store.requests.filter((request) => request.status !== 'done'),
    [store.requests],
  );
  const completedRequests = store.requests.length - activeRequests.length;
  const needsRights = intent !== 'watch';

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setFeedback('');
    if (needsRights && !rightsConfirmed) {
      setError('Подтвердите, что у вас есть право скачать или обработать материал.');
      return;
    }

    try {
      const normalizedUrl = normalizeUrl(url);
      store.addRequest({
        url: normalizedUrl,
        intent,
        project,
        title: title.trim(),
        note: note.trim(),
        rightsConfirmed: needsRights ? rightsConfirmed : false,
      });
      setUrl('');
      setTitle('');
      setNote('');
      setRightsConfirmed(false);
      setFeedback('Задача добавлена. Следующее действие уже видно в очереди.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Проверьте ссылку.');
    }
  }

  async function prepare(request: MediaRequest) {
    setBusyId(request.id);
    setError('');
    try {
      await onPrepare(request);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось подготовить материал.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="intake-shell" aria-labelledby="intake-title">
      <div className="intake-hero">
        <div>
          <p className="studio-eyebrow">MEDIA INTAKE · LOCAL FIRST</p>
          <h1 id="intake-title">Ссылка превращается в понятную задачу</h1>
          <p>Сначала выберите результат. Eclipse Media сохранит контекст и покажет ровно одно следующее действие.</p>
        </div>
        <div className="intake-summary" aria-label="Сводка очереди">
          <strong>{activeRequests.length}</strong>
          <span>в работе</span>
          <strong>{completedRequests}</strong>
          <span>готово</span>
        </div>
      </div>

      <div className="intake-layout">
        <form className="intake-form" onSubmit={handleSubmit} noValidate>
          <div className="intake-section-heading">
            <span>01</span>
            <div><h2>Что нужно сделать?</h2><p>Без подключения аккаунтов и автопубликации.</p></div>
          </div>

          <label className="intake-field">
            <span>Ссылка на материал</span>
            <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://youtube.com/watch?v=..." inputMode="url" required />
          </label>

          <fieldset className="intent-grid">
            <legend className="sr-only">Результат обработки</legend>
            {INTENTS.map((option) => (
              <label key={option.value} className={intent === option.value ? 'intent-option is-active' : 'intent-option'}>
                <input type="radio" name="intent" value={option.value} checked={intent === option.value} onChange={() => { setIntent(option.value); setError(''); }} />
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </label>
            ))}
          </fieldset>

          <div className="intake-fields-row">
            <label className="intake-field">
              <span>Проект</span>
              <select value={project} onChange={(event) => setProject(event.target.value)}>
                {PROJECTS.map((name) => <option key={name}>{name}</option>)}
              </select>
            </label>
            <label className="intake-field">
              <span>Название <small>необязательно</small></span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например, референс для релиза" maxLength={120} />
            </label>
          </div>

          <label className="intake-field">
            <span>Заметка <small>необязательно</small></span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Что найти, проверить или использовать?" rows={3} maxLength={600} />
          </label>

          {needsRights && (
            <label className="rights-confirmation rights-confirmation--form">
              <input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} />
              <span><strong>У меня есть право обработать этот материал</strong><small>Это мой контент, есть разрешение автора или использование допустимо законом.</small></span>
            </label>
          )}

          {error && <p className="intake-message is-error" role="alert">{error}</p>}
          {feedback && <p className="intake-message is-success" role="status">{feedback}</p>}
          <button className="btn-primary btn-eclipse intake-submit" type="submit" disabled={!url.trim()}>
            Добавить в план
          </button>
        </form>

        <div className="intake-queue">
          <div className="intake-queue__header">
            <div><span>02</span><h2>Очередь</h2></div>
            {completedRequests > 0 && <button type="button" onClick={store.clearCompletedRequests}>Убрать готовые</button>}
          </div>

          {store.requests.length === 0 ? (
            <div className="intake-empty">
              <strong>План пока пуст</strong>
              <p>Добавьте первую ссылку слева. Она останется в этом браузере.</p>
            </div>
          ) : (
            <div className="intake-request-list">
              {store.requests.map((request) => {
                const intentOption = INTENTS.find((option) => option.value === request.intent)!;
                return (
                  <article key={request.id} className={`intake-request is-${request.status}`}>
                    <div className="intake-request__meta">
                      <span>{request.project}</span>
                      <span>{request.status === 'done' ? 'Готово' : request.status === 'in_progress' ? 'В работе' : 'Запланировано'}</span>
                    </div>
                    <h3>{requestLabel(request)}</h3>
                    <p>{intentOption.label}{request.note ? ` · ${request.note}` : ''}</p>
                    <div className="intake-request__actions">
                      {request.status !== 'done' && request.intent === 'watch' && (
                        <a href={request.url} target="_blank" rel="noreferrer" onClick={() => store.setRequestStatus(request.id, 'done')}>{intentOption.action}</a>
                      )}
                      {request.status !== 'done' && request.intent !== 'watch' && (
                        <button type="button" onClick={() => void prepare(request)} disabled={busyId === request.id}>
                          {busyId === request.id ? 'Проверяем ссылку…' : intentOption.action}
                        </button>
                      )}
                      {request.status === 'done' && <button type="button" onClick={() => store.setRequestStatus(request.id, 'planned')}>Вернуть в план</button>}
                      <button className="is-muted" type="button" onClick={() => store.removeRequest(request.id)} aria-label={`Удалить ${requestLabel(request)}`}>Удалить</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
