import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { prepareLocalVideo } from '../services/localVideoPreview';
import type { StoryScene } from '../services/projectStoryboardContract';
import '../storyboard.css';
import {
  approveLocalEdit,
  cancelLocalEdit,
  getLocalEditCapability,
  getLocalEditRun,
  listLocalEditSources,
  registerLocalEditSource,
  startLocalEdit,
  type LocalEditCapability,
  type LocalEditRun,
  type LocalEditSource,
  type LocalEditSourceOption,
} from '../api/media';
import { isDesktopApp, saveCompletedFile } from '../api/desktopRuntime';
import {
  createLocalEditPlan,
  formatEditTime,
  LOCAL_EDIT_PROFILE,
  serializeLocalEditPlan,
} from '../services/localEditPreview';

const DEMO_SOURCE: LocalEditSource = {
  jobId: '00000000000000000000000000000000',
  assetId: '00000000-0000-4000-8000-000000000005',
  filename: 'demo-release.mp4',
  sha256: 'a'.repeat(64),
  sizeBytes: 24_000_000,
  durationMs: 120_000,
  hasAudio: true,
};

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);
const PHASE_LABELS: Record<LocalEditRun['phase'], string> = {
  waiting: 'Ожидает запуска',
  verifying: 'Проверяем исходник',
  encoding: 'Кодируем клип',
  validating: 'Проверяем результат',
  complete: 'Клип готов',
  failed: 'Экспорт остановлен',
  cancelled: 'Экспорт отменён',
};

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function FilmIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 5v14M17 5v14M3 9h4M17 9h4M3 15h4M17 15h4" />
      <path d="m11 10 4 2-4 2Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function formatBytes(bytes: number) {
  return `${Math.max(0.1, bytes / 1024 / 1024).toFixed(1)} МБ`;
}

export function SafeLocalEdit({ scene, onBack }: { scene?: StoryScene; onBack?: () => void } = {}) {
  const [sceneDuration] = useState(scene?.duration ?? 30);
  const sourceRequest = useRef(0); const previewRef = useRef(''); const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null); const exporting = useRef(false);
  const [previewUrl, setPreviewUrl] = useState(''); const [localRights, setLocalRights] = useState(false);
  const [capability, setCapability] = useState<LocalEditCapability | null>(null);
  const [options, setOptions] = useState<LocalEditSourceOption[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [source, setSource] = useState<LocalEditSource | null>(null);
  const [startSeconds, setStartSeconds] = useState(scene ? 0 : 12);
  const [endSeconds, setEndSeconds] = useState(scene?.duration ?? 42);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [run, setRun] = useState<LocalEditRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const desktop = isDesktopApp();
  const effectiveSource = source ?? DEMO_SOURCE;
  const durationSeconds = Math.max(0.001, effectiveSource.durationMs / 1_000);
  const activeExport = run?.state === 'queued' || run?.state === 'running';
  const runId = run?.runId;
  const runState = run?.state;

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const nextCapability = await getLocalEditCapability();
        if (!active) return;
        setCapability(nextCapability);
        if (!nextCapability.ready) return;
        const nextOptions = await listLocalEditSources();
        if (!active) return;
        setOptions(nextOptions);
        // Registration is an explicit user selection, never a mount-time mutation.
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Не удалось открыть локальный монтаж');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);
  useEffect(() => () => { sourceRequest.current++; if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  useEffect(() => {
    if (!runId || !runState || TERMINAL.has(runState)) return;
    let active = true;
    const timer = window.setInterval(() => {
      void getLocalEditRun(runId)
        .then((next) => { if (active) setRun(next); })
        .catch((caught: unknown) => {
          if (active) setError(caught instanceof Error ? caught.message : 'Не удалось получить статус экспорта');
        });
    }, 800);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [runId, runState]);

  const planResult = useMemo(() => {
    try {
      return {
        plan: createLocalEditPlan({
          assetId: effectiveSource.assetId,
          sourceSha256: effectiveSource.sha256,
          sourceDurationMs: effectiveSource.durationMs,
          startMs: Math.round(startSeconds * 1_000),
          endMs: Math.round(endSeconds * 1_000),
        }),
        error: null,
      };
    } catch (caught) {
      return {
        plan: null,
        error: caught instanceof Error ? caught.message : 'Проверьте границы клипа',
      };
    }
  }, [effectiveSource, endSeconds, startSeconds]);

  const timelineStyle = {
    '--clip-start': `${Math.max(0, Math.min(100, (startSeconds / durationSeconds) * 100))}%`,
    '--clip-width': `${Math.max(0, Math.min(100, ((endSeconds - startSeconds) / durationSeconds) * 100))}%`,
  } as CSSProperties;

  async function chooseSource(jobId: string) {
    if (activeExport || working || !jobId) return;
    const request = ++sourceRequest.current;
    setSelectedJobId(jobId);
    setWorking(true);
    setError(null);
    setRun(null);
    setSavedName(null);
    setRightsConfirmed(false);
    try {
      const registered = await registerLocalEditSource(jobId);
      if (request !== sourceRequest.current) return;
      setSource(registered);
      setStartSeconds(0);
      setEndSeconds(Math.min(sceneDuration, registered.durationMs / 1_000));
    } catch (caught) {
      if (request !== sourceRequest.current) return;
      setSource(null);
      setError(caught instanceof Error ? caught.message : 'Не удалось проверить MP4');
    } finally {
      if (request === sourceRequest.current) setWorking(false);
    }
  }
  async function chooseLocal(file: File) {
    if (!localRights || working || activeExport || capability?.ready) return;
    const request = ++sourceRequest.current; setWorking(true); setError(null); setRightsConfirmed(false); setRun(null);
    try {
      const prepared = await prepareLocalVideo(file);
      if (request !== sourceRequest.current) { URL.revokeObjectURL(prepared.url); return; }
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      previewRef.current = prepared.url; setPreviewUrl(prepared.url); setSource(prepared.source);
      setStartSeconds(0); setEndSeconds(Math.min(sceneDuration, prepared.source.durationMs / 1000));
    } catch (caught) { if (request === sourceRequest.current) setError((caught as Error).message); }
    finally { if (request === sourceRequest.current) setWorking(false); }
  }

  function revise(setter: (value: number) => void, value: number) {
    if (activeExport || working) return;
    setter(value);
    setRun(null);
    setSavedName(null);
    setError(null);
    setRightsConfirmed(false);
  }

  async function exportClip() {
    if (!capability?.ready || previewUrl || !planResult.plan || !source?.jobId || !rightsConfirmed || working || activeExport || exporting.current) return;
    exporting.current = true;
    setWorking(true);
    setError(null);
    setRun(null);
    setSavedName(null);
    try {
      const planJson = serializeLocalEditPlan(planResult.plan);
      const approval = await approveLocalEdit(planJson, true);
      const started = await startLocalEdit(approval.runId, approval.approvalToken, planJson);
      setRun(started);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Экспорт не запущен');
    } finally {
      exporting.current = false;
      setWorking(false);
    }
  }

  async function cancelExport() {
    if (!run || !activeExport) return;
    setWorking(true);
    try {
      setRun(await cancelLocalEdit(run.runId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отменить экспорт');
    } finally {
      setWorking(false);
    }
  }

  async function saveResult() {
    if (!run?.result || saving) return;
    setSaving(true);
    setError(null);
    try {
      const receipt = await saveCompletedFile(run.result.jobId, run.result.filename);
      if (receipt.saved) setSavedName(receipt.filename);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить клип');
    } finally {
      setSaving(false);
    }
  }

  const step = run?.state === 'succeeded' ? 4 : activeExport ? 3 : rightsConfirmed ? 2 : 1;
  const stepClass = (index: number) => index < step ? 'is-complete' : index === step ? 'is-active' : '';

  return (
    <section className="safe-edit" aria-labelledby="safe-edit-title" aria-busy={loading || working}>
      {scene && <aside className="story-handoff" aria-label="Сцена из сценария"><h2>{scene.title}</h2><p>План: {scene.duration} сек · {scene.music}</p>
        <p><strong>Действие:</strong> {scene.action}</p><p><strong>Камера:</strong> {scene.camera}</p>
        {scene.theses.map((t) => <p key={t.sha256 + t.cueId}>Тезис: {t.claim} · {formatEditTime(t.start * 1000)} - {formatEditTime(t.end * 1000)} · {t.fileName}</p>)}
        <p>Это снимок сцены. Ни музыка, ни камера не применяются автоматически. Выберите видео и проверьте границы; таймкоды субтитров не доказывают соответствие файлу.</p>
        <button className="btn-ghost" type="button" disabled={working || activeExport} onClick={onBack}>Вернуться к сценарию</button></aside>}
      <header className="safe-edit__hero">
        <div>
          <p className="studio-eyebrow">БЕЗОПАСНЫЙ ЛОКАЛЬНЫЙ МОНТАЖ</p>
          <h1 id="safe-edit-title">Проверьте клип. Подтвердите. Получите MP4.</h1>
          <p>Один понятный путь: готовый MP4, точные границы, ручное разрешение и проверенный локальный результат.</p>
        </div>
        <div className={capability?.ready ? 'safe-edit__contract is-ready' : 'safe-edit__contract'}>
          <span>{capability?.ready ? 'DESKTOP WORKER READY' : 'PREVIEW ONLY'}</span>
          <strong>{capability?.ready ? 'Локальный экспорт включён' : 'Файл не изменяется'}</strong>
          <small>{capability?.ready ? 'FFmpeg · H.264 · AAC · 720p' : 'Откройте desktop-приложение для экспорта'}</small>
        </div>
      </header>

      <ol className="safe-edit__steps" aria-label="Этапы безопасной операции">
        {[
          ['Предпросмотр', 'Выбор границ'],
          ['Разрешение', 'Решение человека'],
          ['Обработка', 'Изолированный worker'],
          ['Результат', 'Проверка и сохранение'],
        ].map(([title, caption], index) => (
          <li key={title} className={stepClass(index + 1)} aria-current={step === index + 1 ? 'step' : undefined}>
            <span>{index + 1 < step ? <CheckIcon /> : index + 1}</span>
            <div><strong>{title}</strong><small>{caption}</small></div>
          </li>
        ))}
      </ol>

      <div className="safe-edit__layout">
        <article className="safe-edit__workspace" aria-labelledby="clip-preview-title">
          <div className="safe-edit__panel-heading">
            <div>
              <span className="safe-edit__index">01 / ИСХОДНИК</span>
              <h2 id="clip-preview-title">{effectiveSource.filename}</h2>
            </div>
            <span className="safe-edit__source-status">
              {source ? `${previewUrl ? 'Прочитан локально' : 'Проверен'} · ${formatBytes(source.sizeBytes)}` : 'Демонстрационный предпросмотр'}
            </span>
          </div>

          {capability?.ready && (
            <label className="safe-edit__source-picker">
              <span>Готовый MP4</span>
              <select
                value={selectedJobId}
                disabled={working || activeExport || options.length === 0}
                onChange={(event) => void chooseSource(event.target.value)}
              >
                <option value="">{options.length === 0 ? 'Нет готовых MP4' : 'Выберите исходник'}</option>
                {options.map((option) => <option key={option.jobId} value={option.jobId}>{option.filename}</option>)}
              </select>
              {options.length === 0 && <small>Скачайте видео в разделе «Загрузка» — готовый MP4 появится здесь автоматически.</small>}
            </label>
          )}
          {!loading && !capability?.ready && <div className="planning-toolbar">
            <label className="planning-consent"><input type="checkbox" checked={localRights} disabled={working} onChange={(e) => setLocalRights(e.target.checked)} /><span>У меня есть право просмотреть этот файл</span></label>
            <button className="btn-ghost" type="button" disabled={!localRights || working} onClick={() => fileRef.current?.click()}>Выбрать локальный MP4</button>
            <input type="file" ref={fileRef} hidden accept=".mp4,video/mp4" aria-label="Локальный MP4 для предпросмотра" onChange={(e) => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (file) void chooseLocal(file); }} />
            <p className="planning-muted">До 60 МБ и 5 минут. Только чтение в браузере, без загрузки на сервер. Кодирование здесь выключено.</p>
          </div>}
          {previewUrl && <><video ref={videoRef} className="safe-edit__video" src={previewUrl} controls preload="metadata" playsInline aria-label="Предпросмотр локального видео"
            onTimeUpdate={(e) => { if (e.currentTarget.currentTime >= endSeconds) e.currentTarget.pause(); }} />
            <button className="btn-ghost" type="button" disabled={!planResult.plan || working} onClick={() => { const video = videoRef.current; if (video) { video.currentTime = startSeconds; void video.play().catch(() => setError('Нажмите воспроизведение в самом плеере.')); } }}>Посмотреть выбранный фрагмент</button></>}

          <div className="safe-edit__frame" aria-label="Схематичный предпросмотр выбранного клипа">
            <div className="safe-edit__frame-grid" />
            <div className="safe-edit__frame-copy">
              <span>{source ? 'ПРОВЕРЕННЫЙ ЛОКАЛЬНЫЙ MP4' : 'ECLIPSE PREVIEW'}</span>
              <strong>Выбранный фрагмент</strong>
              <small>{formatEditTime(startSeconds * 1_000)} — {formatEditTime(endSeconds * 1_000)}</small>
            </div>
            <FilmIcon />
          </div>

          <div className="safe-edit__timeline" style={timelineStyle}>
            <div className="safe-edit__timeline-track" aria-hidden="true"><span /></div>
            <div className="safe-edit__timeline-labels">
              <span>00:00</span><span>{formatEditTime(effectiveSource.durationMs / 2)}</span><span>{formatEditTime(effectiveSource.durationMs)}</span>
            </div>
          </div>

          <div className="safe-edit__controls">
            <label>
              <span>Начало, сек</span>
              <input type="number" aria-label="Начало, сек" step="0.001" min="0" max={Math.max(0, durationSeconds - 0.001)} value={startSeconds} disabled={activeExport || working} onChange={(event) => revise(setStartSeconds, Number(event.target.value))} />
              <input className="safe-edit__range" aria-label="Начало клипа" type="range" min="0" max={Math.max(0, durationSeconds - 1)} value={startSeconds} disabled={activeExport} onChange={(event) => revise(setStartSeconds, Number(event.target.value))} />
            </label>
            <label>
              <span>Конец, сек</span>
              <input type="number" aria-label="Конец, сек" step="0.001" min="0.001" max={durationSeconds} value={endSeconds} disabled={activeExport || working} onChange={(event) => revise(setEndSeconds, Number(event.target.value))} />
              <input className="safe-edit__range" aria-label="Конец клипа" type="range" min="1" max={durationSeconds} value={endSeconds} disabled={activeExport} onChange={(event) => revise(setEndSeconds, Number(event.target.value))} />
            </label>
          </div>

          <div className={planResult.error ? 'safe-edit__selection is-error' : 'safe-edit__selection'} role="status">
            <div><span>Начало</span><strong>{formatEditTime(startSeconds * 1_000)}</strong></div>
            <div><span>Конец</span><strong>{formatEditTime(endSeconds * 1_000)}</strong></div>
            <div><span>Длительность</span><strong>{planResult.error ? '—' : `${endSeconds - startSeconds} сек`}</strong></div>
            {planResult.error && <p>{planResult.error}</p>}
          </div>
        </article>

        <aside className="safe-edit__approval" aria-labelledby="approval-title">
          <div className="safe-edit__panel-heading">
            <div><span className="safe-edit__index">02 / ДЕЙСТВИЕ</span><h2 id="approval-title">Подготовить клип</h2></div>
          </div>

          {loading ? (
            <div className="safe-edit__state" role="status"><span className="button-spinner" /><strong>Проверяем локальный контур…</strong></div>
          ) : run?.state === 'succeeded' && run.result ? (
            <div className="safe-edit__receipt" aria-live="polite">
              <div className="safe-edit__receipt-icon"><CheckIcon /></div>
              <span className="safe-edit__index">04 / РЕЗУЛЬТАТ ПРОВЕРЕН</span>
              <h2>Клип готов</h2>
              <p>Профиль, длительность и контрольная сумма проверены до появления файла в списке результатов.</p>
              <dl>
                <div><dt>Файл</dt><dd>{run.result.filename}</dd></div>
                <div><dt>Профиль</dt><dd>{LOCAL_EDIT_PROFILE}</dd></div>
                <div><dt>Размер</dt><dd>{formatBytes(run.result.sizeBytes)}</dd></div>
                <div><dt>SHA-256</dt><dd>{run.result.sha256.slice(0, 16)}…</dd></div>
              </dl>
              {savedName && <div className="safe-edit__not-run is-success"><strong>Сохранено</strong><span>{savedName}</span></div>}
              <button className="safe-edit__confirm" type="button" disabled={saving} onClick={() => void saveResult()}>
                {saving ? 'Сохраняем…' : 'Сохранить MP4'}
              </button>
              <button className="btn-ghost" type="button" onClick={() => { setRun(null); setRightsConfirmed(false); setSavedName(null); }}>Сделать другой фрагмент</button>
            </div>
          ) : activeExport ? (
            <div className="safe-edit__running" role="status" aria-live="polite">
              <span className="safe-edit__index">03 / ЛОКАЛЬНАЯ ОБРАБОТКА</span>
              <div className="safe-edit__running-signal"><span /></div>
              <h2>{PHASE_LABELS[run.phase]}</h2>
              <p>Исходник остаётся локальным. Публикация и сетевые действия не разрешены.</p>
              <ol>
                {['Проверка исходника', 'Кодирование', 'Контроль результата'].map((label, index) => {
                  const phaseIndex = run.phase === 'verifying' ? 0 : run.phase === 'encoding' ? 1 : 2;
                  return <li key={label} className={index < phaseIndex ? 'is-complete' : index === phaseIndex ? 'is-active' : ''}>{label}</li>;
                })}
              </ol>
              <button className="btn-ghost" type="button" disabled={working} onClick={() => void cancelExport()}>Отменить экспорт</button>
            </div>
          ) : (
            <>
              <ul className="safe-edit__checks">
                <li><CheckIcon /><span><strong>Только обрезка</strong><small>Без shell-команд, URL и произвольных параметров</small></span></li>
                <li><CheckIcon /><span><strong>Исходник привязан к SHA-256</strong><small>Подмена файла отменит операцию</small></span></li>
                <li><CheckIcon /><span><strong>Один фиксированный профиль</strong><small>MP4 · H.264 · AAC · 720p</small></span></li>
                <li><CheckIcon /><span><strong>Публикация выключена</strong><small>Результат сохраняется только по вашей команде</small></span></li>
              </ul>

              <details className="safe-edit__plan">
                <summary>Показать точный план</summary>
                <code>{planResult.plan ? serializeLocalEditPlan(planResult.plan) : 'Исправьте границы клипа'}</code>
              </details>

              <label className="safe-edit__rights">
                <input type="checkbox" checked={rightsConfirmed} disabled={!source || working} onChange={(event) => { setRightsConfirmed(event.target.checked); setError(null); }} />
                <span><strong>У меня есть право обработать этот файл</strong><small>Одно подтверждение — один локальный экспорт.</small></span>
              </label>

              <button className="safe-edit__confirm" type="button" disabled={!capability?.ready || !source || !planResult.plan || !rightsConfirmed || working} onClick={() => void exportClip()}>
                {working ? 'Проверяем исходник…' : capability?.ready ? 'Подтвердить и создать MP4' : 'Экспорт доступен в desktop-приложении'}
              </button>
              <p className="safe-edit__boundary">
                {desktop ? 'Токен разрешения используется один раз и не отображается в интерфейсе.' : 'В браузере доступен безопасный предпросмотр плана без изменения файла.'}
              </p>
            </>
          )}

          {(error || run?.state === 'failed' || run?.state === 'cancelled') && (
            <div className={run?.state === 'cancelled' ? 'safe-edit__alert is-neutral' : 'safe-edit__alert'} role="alert">
              <strong>{run?.state === 'cancelled' ? 'Экспорт отменён' : 'Нужна проверка'}</strong>
              <span>{error ?? (run?.state === 'failed' ? 'Результат не создан. Исходник остался без изменений.' : 'Можно изменить границы и запустить снова.')}</span>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
