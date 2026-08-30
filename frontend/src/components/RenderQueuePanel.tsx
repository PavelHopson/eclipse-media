import { useCallback, useEffect, useState } from 'react';
import {
  approveRenderQueue,
  cancelRenderQueue,
  downloadRenderQueueResult,
  getRenderQueueCapability,
  listRenderQueueAudit,
  listRenderQueueJobs,
  submitRenderQueue,
  type ReleaseRenderRequest,
  type RenderQueueAuditEvent,
  type RenderQueueCapability,
  type RenderQueueJob,
} from '../api/media';
import type { ReleaseVariables } from '../services/releaseBriefContract';

interface RenderQueuePanelProps {
  variables: ReleaseVariables | null;
  previewReviewed: boolean;
}

const STATE_LABELS: Record<RenderQueueJob['state'], string> = {
  queued: 'Ожидает',
  running: 'Рендерится',
  succeeded: 'Готово',
  failed: 'Ошибка',
  cancelled: 'Отменено',
};

const PHASE_LABELS: Record<RenderQueueJob['phase'], string> = {
  waiting: 'В очереди',
  validating: 'Проверка входных данных',
  rendering: 'Сборка кадров и MP4',
  verifying: 'Проверка результата',
  complete: 'Файл проверен',
  failed: 'Рендер остановлен',
  cancelled: 'Операция отменена',
};

function sizeLabel(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

export function RenderQueuePanel({ variables, previewReviewed }: RenderQueuePanelProps) {
  const [capability, setCapability] = useState<RenderQueueCapability | null>(null);
  const [jobs, setJobs] = useState<RenderQueueJob[]>([]);
  const [audit, setAudit] = useState<RenderQueueAuditEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('Проверяем доступность локального renderer…');

  const refresh = useCallback(async (current?: RenderQueueCapability) => {
    const resolved = current ?? await getRenderQueueCapability();
    setCapability(resolved);
    if (!resolved.ready) {
      setFeedback('На сайте доступен предпросмотр. Реальный рендер запускается только локально.');
      return;
    }
    const [nextJobs, nextAudit] = await Promise.all([listRenderQueueJobs(), listRenderQueueAudit()]);
    setJobs(nextJobs);
    setAudit(nextAudit);
    setFeedback('Локальная очередь готова. Публикация не запускается.');
  }, []);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    void getRenderQueueCapability()
      .then(async (resolved) => {
        if (!active) return;
        await refresh(resolved);
        if (resolved.ready) {
          timer = window.setInterval(() => {
            if (active) void refresh(resolved).catch(() => setFeedback('Связь с локальной очередью потеряна.'));
          }, 1800);
        }
      })
      .catch(() => { if (active) setFeedback('Не удалось проверить локальную очередь.'); });
    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, [refresh]);

  async function enqueue() {
    if (!variables || !previewReviewed) return;
    setBusy(true);
    try {
      const request: ReleaseRenderRequest = {
        schemaVersion: 'eclipse.release-render-request.v1',
        variables,
        review: { claimsReviewed: true, noSensitiveData: true, previewReviewed: true },
      };
      const approval = await approveRenderQueue(request);
      await submitRenderQueue(request, approval.approvalToken);
      setFeedback('Ролик добавлен в локальную очередь.');
      await refresh(capability ?? undefined);
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : 'Не удалось добавить рендер.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel(jobId: string) {
    setBusy(true);
    try {
      await cancelRenderQueue(jobId);
      setFeedback('Операция отменена. Частичный MP4 не сохраняется.');
      await refresh(capability ?? undefined);
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : 'Не удалось отменить операцию.');
    } finally {
      setBusy(false);
    }
  }

  async function download(job: RenderQueueJob) {
    try {
      await downloadRenderQueueResult(job);
      setFeedback('Проверенный MP4 сохранён через браузер.');
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : 'Не удалось сохранить MP4.');
    }
  }

  const running = jobs.filter((job) => job.state === 'running').length;
  const queued = jobs.filter((job) => job.state === 'queued').length;
  const queueFull = running + queued >= 3;

  return (
    <section className="render-queue" aria-labelledby="render-queue-title">
      <header className="render-queue__header">
        <div>
          <p className="studio-eyebrow">LOCAL RENDER QUEUE</p>
          <h3 id="render-queue-title">Собрать проверенный MP4</h3>
          <p>Один рендер выполняется, ещё два могут ждать. Любую активную операцию можно отменить.</p>
        </div>
        <span className={capability?.ready ? 'render-queue__mode is-ready' : 'render-queue__mode'}>
          {capability?.ready ? 'Локально готово' : 'Только предпросмотр'}
        </span>
      </header>

      {capability?.ready ? (
        <>
          <div className="render-queue__limits" aria-label="Пределы локального рендера">
            <span><b>{running}/1</b> выполняется</span>
            <span><b>{queued}/2</b> ожидает</span>
            <span><b>20 мин</b> тайм-аут</span>
            <span><b>512 МБ</b> максимум</span>
          </div>
          <button
            className="render-queue__enqueue"
            type="button"
            disabled={!variables || !previewReviewed || queueFull || busy}
            onClick={enqueue}
          >
            {busy ? 'Подождите…' : queueFull ? 'Очередь заполнена' : 'Добавить в очередь'}
          </button>
          {!previewReviewed && <p className="render-queue__hint">Сначала отметьте, что просмотрели макет пяти сцен.</p>}

          <div className="render-queue__jobs" aria-label="Задачи рендера">
            {jobs.length === 0 && <div className="render-queue__empty" role="status">Задач пока нет. Проверенный бриф можно отправить одной кнопкой.</div>}
            {jobs.map((job) => (
              <article key={job.jobId} className={`render-job is-${job.state}`}>
                <div className="render-job__state"><span aria-hidden="true" /><strong>{STATE_LABELS[job.state]}</strong><small>{job.format}</small></div>
                <div className="render-job__main">
                  <strong>{PHASE_LABELS[job.phase]}</strong>
                  <span>{job.result ? `${job.result.filename} · ${sizeLabel(job.result.sizeBytes)}` : `Операция ${job.jobId.slice(0, 8)}`}</span>
                </div>
                <div className="render-job__actions">
                  {(job.state === 'queued' || job.state === 'running') && <button type="button" disabled={busy} onClick={() => cancel(job.jobId)}>Отменить</button>}
                  {job.state === 'succeeded' && <button type="button" onClick={() => download(job)}>Скачать MP4</button>}
                </div>
              </article>
            ))}
          </div>

          <details className="render-queue__audit">
            <summary>Журнал операций без текста и локальных путей</summary>
            <ol>
              {audit.slice(0, 12).map((event, index) => (
                <li key={`${event.timestamp}-${event.event}-${index}`}>
                  <time>{new Date(event.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
                  <span>{event.event.replaceAll('_', ' ')}</span>
                  <code>{event.jobId?.slice(0, 8) ?? 'approval'}</code>
                </li>
              ))}
            </ol>
          </details>
        </>
      ) : (
        <div className="render-queue__offline" role="status">
          <strong>Рендер выключен на публичном сайте</strong>
          <span>Откройте Eclipse Media через <code>Start-Eclipse-Media.ps1</code> — локальная очередь появится здесь автоматически.</span>
        </div>
      )}
      <p className="render-queue__feedback" aria-live="polite">{feedback}</p>
    </section>
  );
}
