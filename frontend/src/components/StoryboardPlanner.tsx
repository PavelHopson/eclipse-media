import { useState } from 'react';
import { useLocalDraft, useProjectDrafts } from '../hooks/useLocalDraft';
import { DraftStatus } from './DraftStatus';
import { MAX_STORY_SCENES, missingSceneFields, newStoryScene, thesisChanged, thesisSnapshot, validateStoryboard, type StoryScene } from '../services/projectStoryboardContract';
import { cueLink, youtubeVideoId } from '../services/researchContract';
import { formatEditTime } from '../services/localEditPreview';
import '../storyboard.css';

function sourceLink(url: string, start: number) { try { return cueLink(youtubeVideoId(url), start); } catch { return null; } }
const displayCueTime = (seconds: number) => formatEditTime(Math.round(seconds * 1000));
export function StoryboardPlanner({ onEdit }: { onEdit: (scene: StoryScene) => void }) {
  const { research: researchController, beats: controller } = useProjectDrafts();
  const draft = useLocalDraft(controller); const research = useLocalDraft(researchController);
  const [status, setStatus] = useState(''); const [error, setError] = useState('');
  const [removed, setRemoved] = useState<{ scene: StoryScene; index: number } | null>(null);
  const [linkCue, setLinkCue] = useState<Record<string, string>>({});
  const scenes = draft.data.storyboard?.scenes ?? [];
  const blocked = !draft.ready || !research.ready || ['error', 'conflict', 'invalid'].includes(draft.phase);
  function update(change: (current: StoryScene[]) => StoryScene[], message = '') {
    setError('');
    try { controller.update((current) => {
      const storyboard = { scenes: change(current.storyboard?.scenes ?? []) }; validateStoryboard(storyboard); return { ...current, storyboard };
    }); setStatus(message); } catch (caught) { setError((caught as Error).message); }
  }
  function revise(id: string, patch: Partial<StoryScene>) { update((items) => items.map((s) => s.id === id ? { ...s, ...patch } : s)); }
  function move(index: number, direction: number) { update((items) => { const next = [...items]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; return next; }, 'Порядок сцен изменён.'); }
  function addFromBeats() {
    const beats = draft.data.project; if (!beats) return;
    update((items) => [...items, ...beats.scenes.map((s) => ({ ...newStoryScene(), title: s.title, duration: Math.min(60, s.end - s.start),
      music: beats.source.fileName + ' · ' + displayCueTime(s.start) + ' - ' + displayCueTime(s.end),
      action: draft.data.direction.edits[s.id]?.action ?? s.note, camera: draft.data.direction.edits[s.id]?.camera ?? s.shot }))], 'Сцены из бит-карты добавлены как редактируемая копия. Исходная карта не изменена.');
  }
  return <section className="storyboard" aria-labelledby="storyboard-title">
    <header className="planning-heading"><h1 id="storyboard-title">Сценарий проекта</h1><p>Соберите порядок сцен, свяжите тезисы и подготовьте каждый клип к монтажу.</p></header>
    <DraftStatus controller={controller} snapshot={draft} onClear={() => { setRemoved(null); setStatus(''); }} />
    <p className="planning-muted">Сценарий и бит-карта используют общее автосохранение. «Удалить черновик» очистит оба раздела.</p>
    <fieldset className="draft-form" disabled={blocked}><legend className="sr-only">Редактор сценария</legend>
      <div className="planning-toolbar"><button className="planning-primary" type="button" disabled={scenes.length >= MAX_STORY_SCENES} onClick={() => update((items) => [...items, newStoryScene()], 'Новая сцена добавлена.')}>Добавить сцену</button>
        <button type="button" disabled={!draft.data.project || scenes.length + (draft.data.project?.scenes.length ?? 0) > MAX_STORY_SCENES} onClick={addFromBeats}>Добавить из бит-карты</button>
        <span>{scenes.length} / {MAX_STORY_SCENES} сцен · {displayCueTime(scenes.reduce((sum, s) => sum + s.duration, 0))}</span>
      </div>
      {status && <p role="status" className="planning-status">{status}</p>}{error && <p role="alert" className="planning-error">{error}</p>}
      {removed && <div className="planning-toolbar"><span>Сцена «{removed.scene.title || 'Без названия'}» убрана.</span><button type="button" disabled={scenes.length >= MAX_STORY_SCENES} onClick={() => { update((items) => { const next = [...items]; next.splice(Math.min(removed.index, next.length), 0, removed.scene); return next; }, 'Сцена восстановлена.'); setRemoved(null); }}>Вернуть сцену</button></div>}
      {!scenes.length && <div className="planning-empty"><h2>Сценарий пока пуст</h2><p>Добавьте сцену здесь или нажмите «Создать сцену» рядом с тезисом в разделе «План».</p></div>}
      <ol className="storyboard-list">{scenes.map((scene, index) => {
        const start = scenes.slice(0, index).reduce((sum, s) => sum + s.duration, 0); const elapsed = start + scene.duration; const missing = missingSceneFields(scene);
        return <li key={scene.id} className="story-scene" aria-label={'Сцена ' + (index + 1)}>
          <div className="story-scene__heading"><h2>{String(index + 1).padStart(2, '0')} <span>{scene.title || 'Без названия'}</span></h2><span>{displayCueTime(start)} - {displayCueTime(elapsed)}</span></div>
          <div className="story-scene__fields">
            <label className="planning-field"><span>Название сцены</span><input maxLength={80} value={scene.title} aria-invalid={!scene.title.trim()} onChange={(e) => revise(scene.id, { title: e.target.value })} /></label>
            <label className="planning-field"><span>Длительность, сек</span><input type="number" min={0} max={60} step={0.1} value={scene.duration} aria-invalid={scene.duration <= 0} onChange={(e) => revise(scene.id, { duration: Number(e.target.value) })} /></label>
            <label className="planning-field story-scene__wide"><span>Музыка / звук</span><input maxLength={512} placeholder="Название трека, фрагмент или «Тишина»" value={scene.music} aria-invalid={!scene.music.trim()} onChange={(e) => revise(scene.id, { music: e.target.value })} /></label>
            <label className="planning-field"><span>Действие в кадре</span><textarea maxLength={400} rows={2} value={scene.action} aria-invalid={!scene.action.trim()} onChange={(e) => revise(scene.id, { action: e.target.value })} /></label>
            <label className="planning-field"><span>Камера</span><textarea maxLength={400} rows={2} value={scene.camera} aria-invalid={!scene.camera.trim()} onChange={(e) => revise(scene.id, { camera: e.target.value })} /></label>
          </div>
          <div className="story-theses"><h3>Связанные тезисы <small>{scene.theses.length} / 4</small></h3>
            {!scene.theses.length && <p>Связанных тезисов нет. Для самостоятельной сцены это необязательно.</p>}
            {scene.theses.map((t, i) => { const link = sourceLink(t.videoUrl, t.start); return <div key={t.sha256 + t.cueId} className="story-thesis">
              <p><strong>{t.claim}</strong></p><p>{t.fileName} · {displayCueTime(t.start)} - {displayCueTime(t.end)}</p>
              <p>{t.status === 'confirmed' ? 'Проверено автором тезиса' : t.status === 'disputed' ? 'Есть противоречия' : 'Тезис не проверен'}</p>
              {thesisChanged(t, research.data) && <p className="planning-error">Разбор изменён или удалён. Здесь сохранён прежний снимок источника.</p>}
              <details><summary>Текст и происхождение</summary><blockquote>{t.excerpt}</blockquote><p>SHA-256 субтитров: <code>{t.sha256}</code></p>{t.evidenceUrl && <p>Источник проверки: {t.evidenceUrl}</p>}{link && <a href={link} target="_blank" rel="noopener noreferrer">Открыть момент источника</a>}</details>
              <button type="button" onClick={() => revise(scene.id, { theses: scene.theses.filter((_, at) => at !== i) })}>Отвязать тезис {i + 1}</button>
            </div>; })}
            <div className="planning-toolbar"><label className="planning-field"><span>Добавить тезис из разбора</span><select value={linkCue[scene.id] ?? ''} onChange={(e) => setLinkCue({ ...linkCue, [scene.id]: e.target.value })}>
              <option value="">Выберите тезис</option>{research.data.notes.filter((n) => n.claim.trim()).map((n, i) => <option key={n.cueId} value={n.cueId}>{i + 1}. {n.claim.slice(0, 80)}</option>)}
            </select></label><button type="button" disabled={!linkCue[scene.id] || scene.theses.length >= 4} onClick={() => {
              try { const t = thesisSnapshot(research.data, linkCue[scene.id]);
                if (scene.theses.some((old) => old.sha256 === t.sha256 && old.cueId === t.cueId)) throw new Error('Этот тезис уже связан со сценой.');
                revise(scene.id, { theses: [...scene.theses, t] }); setLinkCue({ ...linkCue, [scene.id]: '' });
              } catch (caught) { setError((caught as Error).message); }
            }}>Связать тезис</button></div>
          </div>
          <p className={missing.length ? 'story-scene__missing' : 'planning-status'}>{missing.length ? 'Заполните: ' + missing.join(', ') + '.' : 'Сцена заполнена. Можно выбрать исходник для монтажа.'}</p>
          <div className="planning-toolbar story-scene__actions"><button type="button" disabled={index === 0} onClick={() => move(index, -1)}>Выше</button><button type="button" disabled={index === scenes.length - 1} onClick={() => move(index, 1)}>Ниже</button>
            <button type="button" onClick={() => { setRemoved({ scene, index }); update((items) => items.filter((s) => s.id !== scene.id), 'Сцена убрана. Можно отменить.'); }}>Убрать сцену</button>
            <button type="button" className="planning-primary" disabled={missing.length > 0} onClick={() => onEdit(scene)}>В безопасный монтаж</button></div>
        </li>;
      })}</ol>
    </fieldset>
    <p className="planning-muted">Передаётся одна сцена за раз. Монтаж пока обрезает выбранный MP4; музыку, эффекты, склейку сцен и генерацию он автоматически не выполняет. Таймкоды тезисов относятся к источнику разбора, а не к выбранному видео.</p>
  </section>;
}
