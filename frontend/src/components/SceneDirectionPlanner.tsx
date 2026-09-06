import { useMemo, useState } from 'react';
import type { BeatMapProject } from '../services/beatMapContract';
import { buildDirectionExport, defaultDirection, directionPrompt, EMOTIONS, INTENSITIES, type Performer, type SceneDirection } from '../services/sceneDirectionContract';
import { codexHandoff, downloadLocalText } from '../services/researchContract';
import '../research-direction.css';
import type { DirectionDraft } from '../services/draftContract';

export function SceneDirectionPlanner({ project, value, onChange }: {
  project: BeatMapProject; value: DirectionDraft; onChange: (update: (current: DirectionDraft) => DirectionDraft) => void;
}) {
  const { activeId, edits, performer } = value;
  const setActiveId = (activeId: string) => onChange((current) => ({ ...current, activeId }));
  const setPerformer = (performer: Performer) => onChange((current) => ({ ...current, performer }));
  const [status, setStatus] = useState('');
  const scene = project.scenes.find((item) => item.id === activeId) ?? project.scenes[0];
  const direction = edits[scene.id] ?? defaultDirection();
  const review = useMemo(() => {
    try { return { data: buildDirectionExport(project, edits, performer), error: '' }; }
    catch (caught) { return { data: null, error: (caught as Error).message }; }
  }, [project, edits, performer]);

  function update(patch: Partial<SceneDirection>) {
    onChange((current) => ({ ...current, edits: { ...current.edits, [scene.id]: { ...(current.edits[scene.id] ?? defaultDirection()), ...patch } } }));
    setStatus('');
  }
  function save(forCodex: boolean) {
    if (!review.data) return;
    const text = forCodex ? codexHandoff('План сцен Eclipse Media', 'Подготовь storyboard по сценам. Сохрани интервалы и выдели противоречия между действием, камерой и постоянными деталями. Не считай заявленное согласие автоматически проверенным. Не запускай генерацию. Перед изменением кода прочитай AGENTS.md и покажи план, затем diff и результаты проверок.', review.data)
      : JSON.stringify(review.data, null, 2) + '\n';
    downloadLocalText(text, forCodex ? 'eclipse-scene-direction-codex.md' : 'eclipse-scene-direction.json', forCodex ? 'text/markdown;charset=utf-8' : undefined);
    setStatus('План подготовлен к сохранению. Генерация и публикация не запускались.');
  }
  return (
    <section className="direction-planner" aria-labelledby="direction-title">
      <header className="planning-heading"><h2 id="direction-title">Режиссура сцен</h2><p>Выберите сцену, задайте реакцию персонажа и проверьте описание перед экспортом.</p></header>
      <div className="direction-layout">
        <div className="direction-fields">
          <label className="planning-field"><span>Сцена для настройки</span><select value={scene.id} onChange={(event) => { setActiveId(event.target.value); setStatus(''); }}>
            {project.scenes.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.title}</option>)}
          </select></label>
          <div className="direction-pair">
            <label className="planning-field"><span>Эмоция</span><select value={direction.emotion} onChange={(event) => {
              const emotion = event.target.value as SceneDirection['emotion'];
              update({ emotion, ...(direction.action === defaultDirection(direction.emotion).action ? { action: defaultDirection(emotion).action } : {}) });
            }}>
              {EMOTIONS.map((emotion) => <option key={emotion}>{emotion}</option>)}
            </select></label>
            <label className="planning-field"><span>Интенсивность</span><select value={direction.intensity} onChange={(event) => update({ intensity: event.target.value as SceneDirection['intensity'] })}>
              {INTENSITIES.map((intensity) => <option key={intensity}>{intensity}</option>)}
            </select></label>
          </div>
          <label className="planning-field"><span>Наблюдаемое действие</span><textarea rows={3} maxLength={400} value={direction.action} onChange={(event) => update({ action: event.target.value })} /></label>
          <button type="button" onClick={() => update({ action: defaultDirection(direction.emotion).action })}>Пример действия для этой эмоции</button>
          <label className="planning-field"><span>Камера</span><textarea rows={2} maxLength={400} value={direction.camera} onChange={(event) => update({ camera: event.target.value })} /></label>
          <label className="planning-field"><span>Что не должно меняться</span><textarea rows={2} maxLength={400} value={direction.invariants} onChange={(event) => update({ invariants: event.target.value })} /></label>
        </div>
        <div className="direction-preview">
          <h3>Описание выбранной сцены</h3>
          <p className="direction-prompt">{directionPrompt(direction, scene.start, scene.end)}</p>
          <label className="planning-field"><span>Персонаж во всём плане</span><select value={performer.kind} onChange={(event) => {
            setPerformer({ kind: event.target.value as Performer['kind'], consentReference: '' }); setStatus('');
          }}><option value="original">Оригинальный персонаж</option><option value="consented">Реальный актёр с согласием</option></select></label>
          {performer.kind === 'consented' && <label className="planning-field"><span>Ссылка или номер согласия</span><input maxLength={240} value={performer.consentReference}
            onChange={(event) => { setPerformer({ ...performer, consentReference: event.target.value }); setStatus(''); }} /></label>}
          {performer.kind === 'consented' && <p className="planning-muted">Приложение не проверяет документ согласия автоматически. Перед генерацией нужен ручной review.</p>}
          {review.error && <p className="planning-error" role="status">{review.error}</p>}
          <div className="planning-toolbar">
            <button className="planning-primary" type="button" disabled={!review.data} onClick={() => save(false)}>Скачать режиссуру</button>
            <button type="button" disabled={!review.data} onClick={() => save(true)}>Задание Codex</button>
          </div>
          <p className="planning-muted">В файле будут все {project.scenes.length} сцен. Ненастроенные сцены используют спокойную реакцию. Это текстовый план, не сгенерированное видео.</p>
          {status && <p className="planning-status" role="status">{status}</p>}
        </div>
      </div>
    </section>
  );
}
