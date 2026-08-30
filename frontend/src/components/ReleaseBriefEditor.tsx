import { useMemo, useState, type KeyboardEvent } from 'react';
import {
  createDefaultReleaseBrief,
  buildReleaseVariables,
  parseReleaseBriefJson,
  serializeReleaseBriefDraft,
  serializeReleaseVariables,
  validateReleaseBriefDraft,
  type ReleaseBriefDraft,
  type ReleaseBriefReview,
  type ReleaseBriefScene,
} from '../services/releaseBriefContract';
import { RenderQueuePanel } from './RenderQueuePanel';

const SESSION_KEY = 'eclipse.media.release-brief.v1';
const SCENE_LABELS = ['Сигнал', 'Данные', 'Процесс', 'Контроль', 'Финал'] as const;

interface ReleaseBriefEditorProps {
  draft: ReleaseBriefDraft;
  onChange: (draft: ReleaseBriefDraft) => void;
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
    </svg>
  );
}

function fieldIssue(issues: ReturnType<typeof validateReleaseBriefDraft>, path: string) {
  return issues.find((issue) => issue.path === path)?.message;
}

export function ReleaseBriefEditor({ draft, onChange }: ReleaseBriefEditorProps) {
  const [activeScene, setActiveScene] = useState(0);
  const [review, setReview] = useState<ReleaseBriefReview>({ claimsReviewed: false, noSensitiveData: false });
  const [previewReviewed, setPreviewReviewed] = useState(false);
  const [feedback, setFeedback] = useState('Черновик хранится только в этой вкладке после явного сохранения.');
  const issues = useMemo(() => validateReleaseBriefDraft(draft), [draft]);
  const scene = draft.scenes[activeScene] ?? draft.scenes[0];
  const canExport = issues.length === 0 && review.claimsReviewed && review.noSensitiveData;
  const variablesPreview = useMemo(() => {
    if (!canExport) return '';
    try {
      return serializeReleaseVariables(draft, review);
    } catch {
      return '';
    }
  }, [canExport, draft, review]);
  const variables = useMemo(() => {
    if (!canExport) return null;
    try {
      return buildReleaseVariables(draft, review);
    } catch {
      return null;
    }
  }, [canExport, draft, review]);

  function updateDraft(next: ReleaseBriefDraft) {
    setReview({ claimsReviewed: false, noSensitiveData: false });
    setPreviewReviewed(false);
    setFeedback('Текст изменён — подтвердите проверки заново.');
    onChange(next);
  }

  function updateScene(field: keyof Pick<ReleaseBriefScene, 'eyebrow' | 'headline' | 'body'>, value: string) {
    updateDraft({
      ...draft,
      scenes: draft.scenes.map((item, index) => index === activeScene ? { ...item, [field]: value } : item),
    });
  }

  function moveSceneFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = draft.scenes.length - 1;
    let next: number;
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else return;
    event.preventDefault();
    setActiveScene(next);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]
      ?.focus();
  }

  function saveSessionDraft() {
    try {
      sessionStorage.setItem(SESSION_KEY, serializeReleaseBriefDraft(draft));
      setFeedback('Черновик сохранён только в текущей вкладке браузера.');
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : 'Не удалось сохранить черновик.');
    }
  }

  function restoreSessionDraft() {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      if (!stored) throw new Error('В этой вкладке пока нет сохранённого черновика.');
      updateDraft(parseReleaseBriefJson(stored));
      setFeedback('Сохранённый черновик восстановлен. Проверьте факты перед экспортом.');
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : 'Не удалось восстановить черновик.');
    }
  }

  function resetDraft() {
    updateDraft(createDefaultReleaseBrief(draft.format));
    setActiveScene(0);
    setFeedback('Бриф сброшен к безопасному шаблону.');
  }

  function exportVariables() {
    try {
      const json = serializeReleaseVariables(draft, review);
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'eclipse-release-variables.json';
      anchor.click();
      URL.revokeObjectURL(url);
      setFeedback('Variables сохранены. Рендер и публикация не запускались.');
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : 'Экспорт заблокирован.');
    }
  }

  const eyebrowError = fieldIssue(issues, `scenes.${activeScene}.eyebrow`);
  const headlineError = fieldIssue(issues, `scenes.${activeScene}.headline`);
  const bodyError = fieldIssue(issues, `scenes.${activeScene}.body`);
  const titleError = fieldIssue(issues, 'title');

  return (
    <section className="release-brief" aria-labelledby="release-brief-title">
      <header className="release-brief__header">
        <div>
          <p className="studio-eyebrow">EDITABLE RELEASE BRIEF / LOCAL ONLY</p>
          <h2 id="release-brief-title">Соберите текст пяти сцен</h2>
          <p>Изменяйте только содержание. Формат, длительность и ручные подтверждения уже зафиксированы.</p>
        </div>
        <div className="release-brief__status" aria-label="Ограничения экспорта">
          <strong>{issues.length ? `${issues.length} ошибок` : 'Схема готова'}</strong>
          <span>Без сети · без shell · без автопубликации</span>
        </div>
      </header>

      <div className="release-brief__toolbar" aria-label="Действия с черновиком">
        <button type="button" onClick={saveSessionDraft}>Сохранить в этой вкладке</button>
        <button type="button" onClick={restoreSessionDraft}>Восстановить</button>
        <button type="button" onClick={resetDraft}>Сбросить шаблон</button>
      </div>

      <div className="release-brief__layout">
        <div className="release-brief__editor">
          <label className="release-brief__field">
            <span>Название ролика <b>{draft.title.length}/80</b></span>
            <input
              value={draft.title}
              maxLength={81}
              aria-invalid={Boolean(titleError)}
              aria-describedby={titleError ? 'brief-title-error' : undefined}
              onChange={(event) => updateDraft({ ...draft, title: event.target.value })}
            />
            {titleError && <small id="brief-title-error" role="alert">{titleError}</small>}
          </label>

          <div className="release-brief__tabs" role="tablist" aria-label="Сцены релизного ролика">
            {draft.scenes.map((item, index) => (
              <button
                key={item.id}
                id={`brief-tab-${item.id}`}
                className={issues.some((issue) => issue.path.startsWith(`scenes.${index}.`) || issue.path === `scenes.${index}`) ? 'has-error' : undefined}
                type="button"
                role="tab"
                aria-label={`${SCENE_LABELS[index]}${issues.some((issue) => issue.path.startsWith(`scenes.${index}.`) || issue.path === `scenes.${index}`) ? ' — есть ошибка' : ''}`}
                aria-selected={activeScene === index}
                aria-controls="release-brief-scene-panel"
                tabIndex={activeScene === index ? 0 : -1}
                onClick={() => setActiveScene(index)}
                onKeyDown={(event) => moveSceneFocus(event, index)}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                {SCENE_LABELS[index]}
              </button>
            ))}
          </div>

          <div
            id="release-brief-scene-panel"
            className="release-brief__scene-fields"
            role="tabpanel"
            aria-labelledby={`brief-tab-${scene.id}`}
          >
            <div className="release-brief__timeline">
              <strong>Сцена {activeScene + 1}</strong>
              <span>{scene.start}–{scene.start + scene.duration} сек · {draft.format}</span>
            </div>
            <label className="release-brief__field">
              <span>Надпись <b>{scene.eyebrow.length}/48</b></span>
              <input
                value={scene.eyebrow}
                maxLength={49}
                aria-invalid={Boolean(eyebrowError)}
                onChange={(event) => updateScene('eyebrow', event.target.value)}
              />
              {eyebrowError && <small role="alert">{eyebrowError}</small>}
            </label>
            <label className="release-brief__field">
              <span>Заголовок <b>{scene.headline.length}/96</b></span>
              <textarea
                rows={2}
                value={scene.headline}
                maxLength={97}
                aria-invalid={Boolean(headlineError)}
                onChange={(event) => updateScene('headline', event.target.value)}
              />
              {headlineError && <small role="alert">{headlineError}</small>}
            </label>
            <label className="release-brief__field">
              <span>Пояснение <b>{scene.body.length}/220</b></span>
              <textarea
                rows={3}
                value={scene.body}
                maxLength={221}
                aria-invalid={Boolean(bodyError)}
                onChange={(event) => updateScene('body', event.target.value)}
              />
              {bodyError && <small role="alert">{bodyError}</small>}
            </label>
          </div>
        </div>

        <aside className="release-brief__preview" aria-label="Предпросмотр выбранной сцены">
          <div className="release-brief__preview-heading">
            <span>ЛОКАЛЬНЫЙ ПРЕДПРОСМОТР</span>
            <b>{draft.format} · кадр {activeScene + 1}/5</b>
          </div>
          <div className="release-brief__stage" data-format={draft.format}>
            <div>
              <span>{scene.eyebrow || 'Надпись сцены'}</span>
              <strong>{scene.headline || 'Заголовок сцены'}</strong>
              <p>{scene.body || 'Пояснение сцены'}</p>
            </div>
            <i aria-hidden="true">{String(activeScene + 1).padStart(2, '0')}</i>
          </div>
          <p>Это текстовый макет. Он не запускает HyperFrames и не обращается к сети.</p>
        </aside>
      </div>

      <div className="release-brief__gate">
        <div>
          <p className="studio-eyebrow">ПРОВЕРКА ПЕРЕД ЭКСПОРТОМ</p>
          <label><input type="checkbox" checked={review.claimsReviewed} onChange={(event) => setReview({ ...review, claimsReviewed: event.target.checked })} /> <span>Факты и обещания сверены с реальным продуктом</span></label>
          <label><input type="checkbox" checked={review.noSensitiveData} onChange={(event) => setReview({ ...review, noSensitiveData: event.target.checked })} /> <span>В тексте нет секретов, ключей и персональных данных</span></label>
          <label><input type="checkbox" checked={previewReviewed} onChange={(event) => setPreviewReviewed(event.target.checked)} /> <span>Макет всех пяти сцен просмотрен в выбранном формате</span></label>
        </div>
        <button className="release-brief__export" type="button" disabled={!canExport} onClick={exportVariables}>
          <DownloadIcon />
          Скачать variables JSON
        </button>
      </div>

      <p className="release-brief__feedback" aria-live="polite">{feedback}</p>
      <details className="release-brief__json">
        <summary>{canExport ? 'Проверить JSON перед скачиванием' : 'JSON появится после двух подтверждений'}</summary>
        {variablesPreview && <pre>{variablesPreview}</pre>}
      </details>
      <RenderQueuePanel variables={variables} previewReviewed={previewReviewed} />
    </section>
  );
}
