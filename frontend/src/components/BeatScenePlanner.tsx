import { ChangeEvent, useMemo, useRef, useState } from 'react';
import {
  BeatMapProject,
  buildEnergyEnvelope,
  createSyntheticBeatMap,
  MAX_AUDIO_DURATION_SECONDS,
  ScenePlanItem,
  serializeBeatMap,
  ShotType,
  TransitionType,
  validateAudioCandidate,
  analyzeEnvelope,
} from '../services/beatMapContract';
import '../beat-scene.css';
import { SceneDirectionPlanner } from './SceneDirectionPlanner';

const SHOTS: ShotType[] = ['Общий план', 'Средний план', 'Крупный план', 'Деталь', 'Типографика'];
const TRANSITIONS: TransitionType[] = ['Склейка', 'По движению', 'Через затемнение', 'Световой импульс'];

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${rest}`;
}

function safeDownloadName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zа-яё0-9_-]+/gi, '-').replace(/^-+|-+$/g, '');
  return `${base || 'beat-map'}-scene-plan.json`;
}

async function decodeAudio(file: File): Promise<AudioBuffer> {
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) throw new Error('Этот браузер не поддерживает локальный анализ аудио.');
  const context = new AudioContextClass();
  try {
    return await context.decodeAudioData(await file.arrayBuffer());
  } catch (caught) {
    throw new Error('Не удалось прочитать аудио. Попробуйте WAV, MP3, M4A, AAC, OGG или Opus.', { cause: caught });
  } finally {
    await context.close();
  }
}

export function BeatScenePlanner() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [project, setProject] = useState<BeatMapProject | null>(null);
  const [projectRevision, setProjectRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Выберите собственный аудиофайл или откройте синтетический пример.');

  const visibleBeats = useMemo(() => {
    if (!project) return [];
    const stride = Math.max(1, Math.ceil(project.beats.length / 260));
    return project.beats.filter((_, index) => index % stride === 0);
  }, [project]);

  async function analyzeFile(file: File) {
    setError('');
    setBusy(true);
    setStatus('Декодируем аудио локально. Файл не отправляется в сеть.');
    try {
      validateAudioCandidate(file);
      if (!rightsConfirmed) throw new Error('Подтвердите право на обработку аудиофайла.');
      const buffer = await decodeAudio(file);
      if (buffer.duration > MAX_AUDIO_DURATION_SECONDS) {
        throw new Error('Аудио длиннее 12 минут. Для прототипа выберите фрагмент короче.');
      }
      setStatus('Строим энергетическую огибающую и ищем ритмические опоры.');
      await new Promise<void>((resolve) => window.setTimeout(resolve, 16));
      const envelope = buildEnergyEnvelope(buffer);
      const next = analyzeEnvelope(envelope, buffer.duration, { fileName: file.name, bytes: file.size });
      setProject(next);
      setProjectRevision((value) => value + 1);
      setStatus(`Готово: ${next.analysis.bpm} BPM, ${next.scenes.length} сцен. Проверьте план перед экспортом.`);
    } catch (caught) {
      setProject(null);
      setError(caught instanceof Error ? caught.message : 'Не удалось проанализировать аудио.');
      setStatus('Анализ остановлен. Выберите другой локальный файл.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void analyzeFile(file);
  }

  function loadExample() {
    setError('');
    const next = createSyntheticBeatMap();
    setProject(next);
    setProjectRevision((value) => value + 1);
    setStatus('Синтетический пример готов. Это тестовый ритм 120 BPM без чужого аудио.');
  }

  function updateScene(id: string, patch: Partial<ScenePlanItem>) {
    setProject((current) => current ? {
      ...current,
      scenes: current.scenes.map((scene) => scene.id === id ? { ...scene, ...patch } : scene),
    } : current);
  }

  function exportPlan() {
    if (!project) return;
    const blob = new Blob([serializeBeatMap(project)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = safeDownloadName(project.source.fileName);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus('JSON-план сохранён локально. Публикация и рендер не запускались.');
  }

  function reset() {
    setProject(null);
    setError('');
    setStatus('Выберите собственный аудиофайл или откройте синтетический пример.');
  }

  return (
    <section className="beat-planner" aria-labelledby="beat-planner-title">
      <header className="beat-planner__hero">
        <div>
          <p className="studio-eyebrow">ЛОКАЛЬНЫЙ АНАЛИЗ РИТМА</p>
          <h1 id="beat-planner-title">Музыка становится планом сцен</h1>
          <p>Выберите аудио. Eclipse Media найдёт ритм, разметит секции и подготовит редактируемый монтажный план.</p>
        </div>
        <dl aria-label="Границы прототипа">
          <div><dt>Передача</dt><dd>нет</dd></div>
          <div><dt>Лимит</dt><dd>60 МБ</dd></div>
          <div><dt>Длина</dt><dd>до 12 минут</dd></div>
        </dl>
      </header>

      <section className="beat-intake" aria-labelledby="beat-intake-title">
        <div className="beat-intake__copy">
          <h2 id="beat-intake-title">Добавьте аудиофайл</h2>
          <p>Анализ выполняется Web Audio API в этом браузере. Содержимое файла не сохраняется.</p>
          <label className="beat-rights">
            <input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} />
            <span><strong>У меня есть право обработать этот файл</strong><small>Это мой трек, лицензированный материал или разрешённый тестовый фрагмент.</small></span>
          </label>
        </div>
        <div className="beat-intake__actions">
          <input ref={inputRef} className="sr-only" id="beat-audio-file" type="file" accept="audio/*,.wav,.mp3,.flac,.m4a,.aac,.ogg,.opus" disabled={!rightsConfirmed || busy} onChange={handleFile} />
          <label className={rightsConfirmed && !busy ? 'beat-file-action' : 'beat-file-action is-disabled'} htmlFor="beat-audio-file" aria-disabled={!rightsConfirmed || busy}>
            {busy ? 'Анализируем файл' : 'Выбрать аудио'}
          </label>
          <button type="button" className="beat-example-action" onClick={loadExample} disabled={busy}>Открыть пример</button>
        </div>
      </section>

      <div className="beat-feedback" aria-live="polite" aria-busy={busy}>
        <p>{status}</p>
        {error && <p className="is-error" role="alert">{error}</p>}
      </div>

      {!project && !busy && (
        <section className="beat-empty" aria-label="Пустая бит-карта">
          <strong>Бит-карта появится здесь</strong>
          <p>Для безопасной проверки можно начать с синтетического примера. Он не содержит загруженного аудио.</p>
          <button type="button" onClick={loadExample}>Показать пример</button>
        </section>
      )}

      {busy && (
        <section className="beat-loading" role="status">
          <span aria-hidden="true" />
          <div><strong>Строим карту ритма</strong><p>Декодирование и анализ выполняются локально.</p></div>
        </section>
      )}

      {project && (
        <div className="beat-results">
          <section className="beat-summary" aria-label="Результат анализа">
            <div><strong>{project.analysis.bpm}</strong><span>BPM</span></div>
            <div><strong>{Math.round(project.analysis.confidence * 100)}%</strong><span>уверенность</span></div>
            <div><strong>{project.analysis.beatCount}</strong><span>долей</span></div>
            <div><strong>{formatTime(project.source.duration)}</strong><span>длительность</span></div>
          </section>

          <section className="beat-map" aria-labelledby="beat-map-title">
            <header><div><h2 id="beat-map-title">Карта ритма</h2><p>{project.source.fileName}</p></div><span>Локальный результат</span></header>
            <div className="beat-timeline" aria-label={`Карта из ${project.analysis.beatCount} долей`}>
              <div className="beat-sections" aria-hidden="true">
                {project.sections.map((section) => (
                  <span key={section.id} style={{ width: `${((section.end - section.start) / project.source.duration) * 100}%`, opacity: 0.28 + section.energy * 0.62 }} />
                ))}
              </div>
              <div className="beat-markers" aria-hidden="true">
                {visibleBeats.map((beat) => (
                  <i key={beat.time} className={beat.downbeat ? 'is-downbeat' : ''} style={{ left: `${(beat.time / project.source.duration) * 100}%`, opacity: 0.35 + beat.strength * 0.65 }} />
                ))}
              </div>
            </div>
            <ol className="beat-section-list">
              {project.sections.map((section) => (
                <li key={section.id}><span>{formatTime(section.start)} - {formatTime(section.end)}</span><strong>{section.title}</strong><small>Энергия {Math.round(section.energy * 100)}%</small></li>
              ))}
            </ol>
          </section>

          <section className="scene-plan" aria-labelledby="scene-plan-title">
            <header>
              <div><h2 id="scene-plan-title">План сцен</h2><p>Измените названия, планы и переходы перед передачей в монтаж.</p></div>
              <div className="scene-plan__actions"><button type="button" onClick={reset}>Начать заново</button><button type="button" className="is-primary" onClick={exportPlan}>Скачать JSON</button></div>
            </header>
            <div className="scene-plan__list">
              {project.scenes.map((scene, index) => (
                <article key={scene.id} className="scene-row">
                  <div className="scene-row__time"><span>{String(index + 1).padStart(2, '0')}</span><strong>{formatTime(scene.start)} - {formatTime(scene.end)}</strong></div>
                  <label><span>Название сцены</span><input value={scene.title} maxLength={80} onChange={(event) => updateScene(scene.id, { title: event.target.value })} /></label>
                  <label><span>План</span><select value={scene.shot} onChange={(event) => updateScene(scene.id, { shot: event.target.value as ShotType })}>{SHOTS.map((shot) => <option key={shot}>{shot}</option>)}</select></label>
                  <label><span>Переход</span><select value={scene.transition} onChange={(event) => updateScene(scene.id, { transition: event.target.value as TransitionType })}>{TRANSITIONS.map((transition) => <option key={transition}>{transition}</option>)}</select></label>
                  <label className="scene-row__note"><span>Заметка</span><input value={scene.note} maxLength={160} placeholder="Кадр, действие или текст" onChange={(event) => updateScene(scene.id, { note: event.target.value })} /></label>
                </article>
              ))}
            </div>
          </section>
          <SceneDirectionPlanner key={projectRevision} project={project} />
        </div>
      )}
    </section>
  );
}
