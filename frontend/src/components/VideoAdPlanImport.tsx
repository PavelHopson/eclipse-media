import { useState } from 'react';
import { approveVideoAdPreview, parseVideoAdPlan, type VideoAdPlan } from '../services/videoAdPlanContract';
import '../storyboard-import.css';

export function VideoAdPlanImport() {
  const [plan, setPlan] = useState<VideoAdPlan | null>(null);
  const [state, setState] = useState<'empty' | 'loading' | 'ready' | 'error' | 'approved'>('empty');
  const [message, setMessage] = useState('Выберите Video Ad Plan JSON из Shotforge.');
  const [checks, setChecks] = useState({ referencesMatched: false, claimsReviewed: false, noSensitiveData: false });
  const allChecked = checks.referencesMatched && checks.claimsReviewed && checks.noSensitiveData;

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setState('loading'); setMessage('Проверяем timeline и safety gates локально…'); setPlan(null);
    setChecks({ referencesMatched: false, claimsReviewed: false, noSensitiveData: false });
    try {
      if (file.size > 64 * 1024) throw new Error('Video ad plan exceeds 64 KB.');
      const parsed = parseVideoAdPlan(await file.text()); setPlan(parsed); setState('ready');
      setMessage('План проверен. Просмотрите сцены и выполните три ручные проверки.');
    } catch (caught) {
      setState('error'); setMessage(caught instanceof Error ? caught.message : 'Video ad plan validation failed.');
    }
  };

  const approve = () => {
    if (!plan) return;
    try {
      approveVideoAdPreview(plan, checks); setState('approved');
      setMessage('Preview одобрен для подготовки локального render. Публикация остаётся заблокированной до отдельного approval после просмотра MP4.');
    } catch (caught) {
      setState('error'); setMessage(caught instanceof Error ? caught.message : 'Manual approval failed.');
    }
  };

  return (
    <section className="storyboard-import" aria-labelledby="video-ad-import-title">
      <div className="storyboard-import__intro">
        <p className="studio-eyebrow">SHOTFORGE VIDEO AD CONTRACT</p>
        <h2 id="video-ad-import-title">Проверьте рекламный план до render</h2>
        <p>Импорт выполняется локально. Файл не запускает CLI, provider API, render или публикацию.</p>
        <label className="storyboard-import__file"><span>{plan ? 'Выбрать другой JSON' : 'Выбрать Video Ad Plan JSON'}</span><input type="file" accept="application/json,.json" onChange={(event) => void importFile(event.target.files?.[0])} /></label>
        {state === 'loading' && <p className="storyboard-import__status" role="status">{message}</p>}
        {state === 'error' && <p className="storyboard-import__error" role="alert">{message}</p>}
        {(state === 'empty' || state === 'ready' || state === 'approved') && <p className="storyboard-import__status" aria-live="polite">{message}</p>}
      </div>
      <div className="storyboard-import__preview" aria-live="polite">
        {!plan ? <div className="storyboard-import__empty"><strong>Ожидается eclipse.video-ad-plan.v1</strong><span>3 сцены · 15 секунд · manual approval</span></div> : <>
          <div className="storyboard-import__heading"><div><span>{state === 'approved' ? 'APPROVED FOR RENDER PREP' : 'VALIDATED'}</span><h3>{plan.plan.title}</h3></div><b>{plan.plan.format} · {plan.plan.duration} sec</b></div>
          <ol>{plan.plan.scenes.map((scene) => <li key={scene.id}><time>{scene.start}–{scene.start + scene.duration}s</time><div><span>{scene.purpose}</span><strong>{scene.copy}</strong><p>{scene.referenceIds.length} reference link(s)</p></div></li>)}</ol>
          <div className="mt-4 grid gap-2 text-sm">
            <label><input type="checkbox" checked={checks.referencesMatched} disabled={state === 'approved'} onChange={(event) => setChecks((value) => ({ ...value, referencesMatched: event.target.checked }))} /> Локальные изображения соответствуют reference IDs</label>
            <label><input type="checkbox" checked={checks.claimsReviewed} disabled={state === 'approved'} onChange={(event) => setChecks((value) => ({ ...value, claimsReviewed: event.target.checked }))} /> Все claims проверены человеком</label>
            <label><input type="checkbox" checked={checks.noSensitiveData} disabled={state === 'approved'} onChange={(event) => setChecks((value) => ({ ...value, noSensitiveData: event.target.checked }))} /> В кадрах нет секретов и персональных данных</label>
          </div>
          <button type="button" disabled={!allChecked || state === 'approved'} onClick={approve} className="btn-primary mt-4 disabled:cursor-not-allowed disabled:opacity-40">Одобрить подготовку render</button>
          <p className="storyboard-import__approval">Render approval не является publish approval. После сборки MP4 его нужно посмотреть и подтвердить публикацию отдельно.</p>
        </>}
      </div>
    </section>
  );
}
