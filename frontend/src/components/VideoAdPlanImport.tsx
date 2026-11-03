import { useEffect, useRef, useState } from 'react';
import { approveVideoAdPreview, parseVideoAdPlan, type VideoAdPlan } from '../services/videoAdPlanContract';
import { videoAdImportProblem, VIDEO_AD_SCENE_LABELS } from '../services/videoAdStoryboard';
import type { StoryScene } from '../services/projectStoryboardContract';

const emptyChecks = { referencesMatched: false, claimsReviewed: false, noSensitiveData: false };

export function VideoAdPlanImport({ scenes, disabled, onUse }: {
  scenes: StoryScene[]; disabled: boolean; onUse: (plan: VideoAdPlan) => void;
}) {
  const [plan, setPlan] = useState<VideoAdPlan | null>(null);
  const [state, setState] = useState<'empty' | 'loading' | 'ready' | 'error' | 'added'>('empty');
  const [message, setMessage] = useState('');
  const [checks, setChecks] = useState(emptyChecks);
  const [fileName, setFileName] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  const allChecked = checks.referencesMatched && checks.claimsReviewed && checks.noSensitiveData;
  const problem = plan ? videoAdImportProblem(scenes, plan) : null;

  async function importFile(file: File) {
    const id = ++request.current;
    setState('loading'); setMessage('Читаем план…'); setPlan(null); setChecks(emptyChecks); setFileName(file.name);
    try {
      if (file.size > 64 * 1024) throw new Error('Выберите JSON размером до 64 КБ.');
      const parsed = parseVideoAdPlan(await file.text());
      if (id !== request.current) return;
      setPlan(parsed); setState('ready'); setMessage('Проверьте содержание перед добавлением.');
    } catch (caught) {
      if (id !== request.current) return;
      setState('error'); setMessage(caught instanceof Error ? caught.message : 'Не удалось прочитать план. Выберите файл ещё раз.');
    }
  }
  function add() {
    if (!plan || disabled || problem) return;
    try {
      approveVideoAdPreview(plan, checks);
      onUse(plan);
      setState('added'); setMessage('Добавлены 3 сцены. Ниже можно настроить звук и камеру. Статус сохранения — вверху сценария.');
    } catch (caught) {
      setState('error'); setMessage(caught instanceof Error ? caught.message : 'Не удалось добавить сцены. Повторите попытку.');
    }
  }
  return <section className="ad-plan-import" aria-label="План Shotforge">
    <p className="planning-muted">Три сцены на 15 секунд добавятся в конец текущего проекта. JSON содержит текст и номера референсов, без изображений, звука и видео.</p>
    <div className="ad-plan-file"><p>План Shotforge · JSON до 64 КБ</p>
      <div className="ad-plan-picker"><button type="button" disabled={disabled} onClick={() => input.current?.click()}>{fileName ? 'Выбрать другой JSON' : 'Выбрать JSON'}</button><span>{fileName || 'Файл не выбран'}</span></div>
      <input ref={input} hidden type="file" aria-label="План Shotforge · JSON до 64 КБ" accept="application/json,.json" disabled={disabled} onChange={event => {
        const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void importFile(file);
      }} />
    </div>
    {message && <p className={state === 'error' ? 'planning-error' : 'planning-muted'} role={state === 'error' ? 'alert' : 'status'}>{message}</p>}
    {plan && <>
      <div className="ad-plan-heading"><h2>{plan.plan.title}</h2><span>{plan.plan.format} · 15 секунд</span></div>
      <ol className="ad-plan-scenes">{plan.plan.scenes.map(scene => <li key={scene.id}>
        <span className="ad-plan-time">{scene.start}–{scene.start + scene.duration} сек</span>
        <div><h3>{VIDEO_AD_SCENE_LABELS[scene.purpose]}</h3><p>{scene.copy}</p>
          <details><summary>Референсы: {scene.referenceIds.length}</summary>
            <p>Доска: {plan.plan.referenceBoardId}</p>
            <p>{scene.referenceIds.length ? scene.referenceIds.join(', ') : 'Референсы не указаны.'}</p>
          </details>
        </div>
      </li>)}</ol>
      <div className="ad-plan-checks">
        <label><input type="checkbox" checked={checks.referencesMatched} disabled={disabled} onChange={event => setChecks(value => ({ ...value, referencesMatched: event.target.checked }))} /><span>Я сверил список референсов с исходными материалами</span></label>
        <label><input type="checkbox" checked={checks.claimsReviewed} disabled={disabled} onChange={event => setChecks(value => ({ ...value, claimsReviewed: event.target.checked }))} /><span>Проверил утверждения в тексте</span></label>
        <label><input type="checkbox" checked={checks.noSensitiveData} disabled={disabled} onChange={event => setChecks(value => ({ ...value, noSensitiveData: event.target.checked }))} /><span>В плане нет секретов и персональных данных</span></label>
      </div>
      {problem && <p className="planning-muted" role="status">{problem}</p>}
      <button type="button" className="planning-primary" disabled={disabled || !allChecked || !!problem || state === 'loading'} onClick={add}>Добавить 3 сцены в сценарий</button>
      <p className="planning-muted">Файлы остаются на устройстве. Генерация, монтаж и публикация не запускаются. После правок и сборки видео потребуется отдельная проверка.</p>
    </>}
  </section>;
}
