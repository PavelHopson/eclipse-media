import { useState } from 'react';
import { canUndoHook, createVideoHooks, hookToScene, type HookBrief, type VideoHook } from '../services/shortVideoHooks';
import { MAX_STORY_SCENES, type StoryScene } from '../services/projectStoryboardContract';

export function ShortVideoHooks({ scenes, onInsert, onUndo }: { scenes: StoryScene[]; onInsert: (scene: StoryScene) => boolean; onUndo: (scene: StoryScene) => boolean }) {
  const [brief, setBrief] = useState<HookBrief>({ product: '', audience: '', problem: '', payoff: '' });
  const [hooks, setHooks] = useState<VideoHook[]>([]), [selected, setSelected] = useState<VideoHook | null>(null);
  const [reviewed, setReviewed] = useState(false), [added, setAdded] = useState<StoryScene | null>(null), [error, setError] = useState('');
  function generate() { try { setHooks(createVideoHooks(brief)); setSelected(null); setReviewed(false); setError(''); } catch (caught) { setError((caught as Error).message); } }
  const labels: Record<keyof HookBrief, string> = { product: 'Продукт или тема', audience: 'Для кого ролик', problem: 'Какую задачу показываем', payoff: 'Что действительно покажем в продолжении' };
  return <details className="short-video-hooks"><summary>Первые 3 секунды ролика</summary>
    <p className="planning-muted">Шесть заготовок по трём приёмам. Выберите и отредактируйте кадр, реплику и текст. Локально, без AI-запросов и обещаний вирусности.</p>
    <div className="hook-fields">{(Object.keys(labels) as (keyof HookBrief)[]).map(key => <label className="planning-field" key={key}><span>{labels[key]}</span><input maxLength={key === 'product' || key === 'audience' ? 80 : 100} value={brief[key]} onChange={event => { setBrief({ ...brief, [key]: event.target.value }); setHooks([]); setSelected(null); setReviewed(false); setError(''); }} /></label>)}</div>
    <button type="button" onClick={generate}>Подготовить 6 зацепок</button>
    {!!hooks.length && <div className="hook-options" role="group" aria-label="Выберите зацепку">{hooks.map(hook => <button type="button" key={hook.title} aria-pressed={selected?.title === hook.title} onClick={() => { setSelected({ ...hook }); setReviewed(false); setError(''); }}>{hook.title}</button>)}</div>}
    {selected && <div className="hook-editor"><h2>{selected.title}</h2>{([['visual', 'Кадр', 240], ['spoken', 'Реплика', 120], ['onScreen', 'Текст на экране', 100]] as const).map(([key, label, max]) => <label className="planning-field" key={key}><span>{label}</span><textarea maxLength={max} rows={2} value={selected[key]} onChange={event => { setSelected({ ...selected, [key]: event.target.value }); setReviewed(false); }} /></label>)}
      <p className="planning-muted">В продолжении: {selected.payoff}. Три секунды — план, а не измеренная длительность речи.</p>
      {selected.spoken.trim().split(/\s+/).length > 9 && <p role="status">Реплика длиннее девяти слов. Прочитайте вслух и сократите, если не укладывается.</p>}
      <label className="hook-review"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />Обещание соответствует ролику</label>
      <button type="button" className="planning-primary" disabled={!reviewed || scenes.length >= MAX_STORY_SCENES || !!(added && canUndoHook(scenes, added))} onClick={() => { try { const scene = hookToScene(selected, reviewed); if (onInsert(scene)) { setAdded(scene); setReviewed(false); setError(''); } } catch (caught) { setError((caught as Error).message); } }}>Добавить первой сценой · 3 сек</button>
    </div>}
    {added && <div className="planning-toolbar"><span>{canUndoHook(scenes, added) ? 'Зацепка добавлена. Другие сцены не изменены.' : 'Сцена изменена или удалена; отмена не затронет ваши правки.'}</span><button type="button" disabled={!canUndoHook(scenes, added)} onClick={() => { if (onUndo(added)) setAdded(null); }}>Отменить добавление зацепки</button></div>}
    {scenes.length >= MAX_STORY_SCENES && <p role="status">Нет свободного места для новой сцены.</p>}
    {error && <p role="alert" className="planning-error">{error}</p>}
  </details>;
}
