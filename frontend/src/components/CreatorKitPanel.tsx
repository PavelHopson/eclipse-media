import { useMemo, useState } from 'react';
import { createCreatorCapturePlan, parseCreatorCapturePlan, type CaptureContentClass, type CaptureRecorder } from '../services/creatorCapturePlan';

const TOOL_NOTES = [
  { name: 'ShareX', role: 'Основная локальная запись', guard: 'Auto-upload и внешние destinations выключены.' },
  { name: 'QuickLook', role: 'Быстрый просмотр исходников', guard: 'Без сторонних plugins и content processors.' },
  { name: 'Everything', role: 'Поиск разрешённых файлов', guard: 'Только allowlisted folders; HTTP/ETP servers и history выключены.' },
  { name: 'FocuSee', role: 'Benchmark публичного demo', guard: 'Не использовать для internal, client или secret content.' },
] as const;

export function CreatorKitPanel() {
  const [recorder, setRecorder] = useState<CaptureRecorder>('sharex');
  const [contentClass, setContentClass] = useState<CaptureContentClass>('public-demo');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [secretsExcluded, setSecretsExcluded] = useState(false);
  const [clientDataExcluded, setClientDataExcluded] = useState(false);
  const [feedback, setFeedback] = useState('План ничего не устанавливает и не запускает.');

  const blocker = useMemo(() => {
    if (recorder === 'focusee' && contentClass !== 'public-demo') return 'FocuSee разрешён только для публичного demo.';
    if (!rightsConfirmed) return 'Подтвердите право на запись материалов.';
    if (!secretsExcluded) return 'Подтвердите отсутствие секретов и токенов.';
    if (!clientDataExcluded) return 'Подтвердите отсутствие клиентских и персональных данных.';
    return null;
  }, [clientDataExcluded, contentClass, recorder, rightsConfirmed, secretsExcluded]);

  function downloadPlan() {
    if (blocker) {
      setFeedback(blocker);
      return;
    }
    try {
      const plan = createCreatorCapturePlan({ recorder, contentClass, rightsConfirmed, secretsExcluded, clientDataExcluded });
      const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'eclipse-creator-capture-plan.json';
      link.click();
      URL.revokeObjectURL(url);
      setFeedback('Безопасный capture plan создан локально. Публикация всё равно требует ручного подтверждения.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Не удалось создать capture plan.');
    }
  }

  async function importPlan(file: File | undefined) {
    if (!file) return;
    if (file.size > 32 * 1024) {
      setFeedback('Capture plan больше 32 KB и заблокирован.');
      return;
    }
    try {
      const plan = parseCreatorCapturePlan(JSON.parse(await file.text()));
      setRecorder(plan.recorder);
      setContentClass(plan.contentClass);
      setRightsConfirmed(true);
      setSecretsExcluded(true);
      setClientDataExcluded(true);
      setFeedback(`План ${plan.source} проверен локально. Можно сверить настройки и скачать копию.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Не удалось проверить capture plan.');
    }
  }

  return (
    <section className="creator-kit animate-in" aria-labelledby="creator-kit-title">
      <header className="creator-kit__header">

        <div>
          <p className="studio-eyebrow">DESKTOP CREATOR KIT / LOCAL-FIRST</p>
          <h2 id="creator-kit-title">Подготовьте запись без утечки рабочих данных</h2>
          <p>Интерфейс собирает versioned JSON-план. Он не скачивает приложения, не читает файлы и не публикует видео.</p>
        </div>
        <span className="creator-kit__badge">FAIL CLOSED</span>
      </header>

      <div className="creator-kit__tools" aria-label="Инструменты и ограничения">
        {TOOL_NOTES.map((tool) => <article key={tool.name}><strong>{tool.name}</strong><span>{tool.role}</span><p>{tool.guard}</p></article>)}
      </div>

      <div className="creator-kit__form">
        <fieldset>
          <legend>1. Что записываем</legend>
          <label><input type="radio" name="content-class" checked={contentClass === 'public-demo'} onChange={() => setContentClass('public-demo')} />Публичное demo без приватных данных</label>
          <label><input type="radio" name="content-class" checked={contentClass === 'internal'} onChange={() => setContentClass('internal')} />Внутренний материал</label>
        </fieldset>
        <fieldset>
          <legend>2. Чем записываем</legend>
          <label><input type="radio" name="recorder" checked={recorder === 'sharex'} onChange={() => setRecorder('sharex')} />ShareX · local-only</label>
          <label><input type="radio" name="recorder" checked={recorder === 'focusee'} onChange={() => setRecorder('focusee')} />FocuSee · public benchmark</label>
        </fieldset>
        <fieldset className="creator-kit__confirmations">
          <legend>3. Подтверждения перед экспортом</legend>
          <label><input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} />У меня есть права на запись и публикацию</label>
          <label><input type="checkbox" checked={secretsExcluded} onChange={(event) => setSecretsExcluded(event.target.checked)} />В кадре нет токенов, паролей и секретов</label>
          <label><input type="checkbox" checked={clientDataExcluded} onChange={(event) => setClientDataExcluded(event.target.checked)} />В кадре нет клиентских и персональных данных</label>
        </fieldset>
      </div>
        <label className="creator-kit__import">
          <span>Импортировать план Shotforge</span>
          <input type="file" accept="application/json,.json" onChange={(event) => { void importPlan(event.target.files?.[0]); event.target.value = ''; }} />
        </label>

      <div className="creator-kit__footer">
        <button type="button" className="btn-primary btn-eclipse" onClick={downloadPlan} disabled={Boolean(blocker)}>Скачать безопасный план</button>
        <p className={blocker ? 'is-blocked' : 'is-ready'} aria-live="polite">{blocker ? `${blocker} ${feedback}` : feedback}</p>
      </div>
    </section>
  );
}
