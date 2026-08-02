import { useState } from 'react';

const CHECK_COMMAND = 'cd frontend/public/studio/eclipse-release && npm run check';
const VERIFY_COMMAND = 'cd frontend/public/studio/eclipse-release && npm run verify';
const RENDER_COMMAND = 'cd frontend/public/studio/eclipse-release && npm run render';

function CopyIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="m10 8 6 4-6 4Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ReleaseStudio() {
  const [copied, setCopied] = useState<string | null>(null);

  async function copyCommand(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied('Не удалось скопировать');
    }
  }

  return (
    <section className="release-studio" aria-labelledby="release-studio-title">
      <div className="studio-hero animate-in">
        <div className="studio-hero__copy">
          <p className="studio-kicker">HYPERFRAMES PIPELINE / P0</p>
          <h1 id="release-studio-title">Подготовьте релизное видео без ручного монтажа</h1>
          <p className="studio-lead">
            Eclipse-композиция уже лежит в проекте. Предпросмотр работает сразу, а локальная
            проверка не скачивает и не запускает сторонний CLI.
          </p>
          <div className="studio-actions">
            <a
              className="btn-primary btn-eclipse studio-primary-action"
              href="/studio/eclipse-release/preview.html"
              target="_blank"
              rel="noreferrer"
            >
              <PlayIcon />
              Открыть предпросмотр
            </a>
            <button className="btn-ghost" type="button" onClick={() => copyCommand(CHECK_COMMAND, 'Команда проверки скопирована')}>
              <CopyIcon />
              Скопировать проверку
            </button>
          </div>
          <div className="studio-runtime" role="note">
            <span className="studio-runtime__signal is-pending" aria-hidden="true" />
            Render включится после локальной установки и проверки HyperFrames CLI 0.7.88
          </div>
        </div>

        <div className="studio-orbit" aria-hidden="true">
          <div className="studio-orbit__ring" />
          <div className="studio-orbit__flare" />
          <div className="studio-orbit__label mono">HTML → FRAMES → MP4</div>
        </div>
      </div>

      <div className="studio-grid">
        <article className="studio-preview-card animate-in">
          <div className="studio-card-heading">
            <div>
              <p className="studio-eyebrow">LIVE COMPOSITION</p>
              <h2>Eclipse Release Signal</h2>
            </div>
            <span className="studio-format">16:9 · 15 sec</span>
          </div>
          <div className="studio-preview-frame">
            <iframe
              title="Предпросмотр Eclipse Release Signal"
              src="/studio/eclipse-release/preview.html"
              loading="lazy"
              sandbox="allow-scripts allow-same-origin"
              referrerPolicy="no-referrer"
            />
          </div>
          <p className="studio-caption">
            Preview использует тот же <code>index.html</code>, который уже проходит offline contract check.
          </p>
        </article>

        <aside className="studio-runbook animate-in" aria-label="Как собрать видео">
          <p className="studio-eyebrow">ПОНЯТНЫЙ МАРШРУТ</p>
          <h2>Путь к готовому MP4</h2>
          <ol className="studio-steps">
            <li>
              <span>01</span>
              <div><strong>Проверьте кадры</strong><p>Откройте preview и просмотрите все пять сцен.</p></div>
            </li>
            <li>
              <span>02</span>
              <div><strong>Проверьте шаблон</strong><p>Local contract проверит timing, SRI и отсутствие скрытой загрузки CLI.</p></div>
            </li>
            <li>
              <span>03</span>
              <div><strong>Подключите render CLI</strong><p>После dependency audit выполните <code>verify</code>, затем соберите MP4.</p></div>
            </li>
          </ol>

          <div className="studio-command-block">
            <div>
              <span className="mono">Проверка</span>
              <code>{CHECK_COMMAND}</code>
            </div>
            <button type="button" aria-label="Скопировать команду проверки" onClick={() => copyCommand(CHECK_COMMAND, 'Команда проверки скопирована')}>
              <CopyIcon />
            </button>
          </div>
          <div className="studio-command-block">
            <div>
              <span className="mono">CLI verify</span>
              <code>{VERIFY_COMMAND}</code>
            </div>
            <button type="button" aria-label="Скопировать команду CLI verify" onClick={() => copyCommand(VERIFY_COMMAND, 'Команда CLI verify скопирована')}>
              <CopyIcon />
            </button>
          </div>
          <div className="studio-command-block">
            <div>
              <span className="mono">Render после verify</span>
              <code>{RENDER_COMMAND}</code>
            </div>
            <button type="button" aria-label="Скопировать команду render" onClick={() => copyCommand(RENDER_COMMAND, 'Команда render скопирована')}>
              <CopyIcon />
            </button>
          </div>

          <p className="studio-feedback" aria-live="polite">{copied ?? 'CLI не скачивается автоматически; публикация остаётся ручной.'}</p>
        </aside>
      </div>

      <div className="studio-capabilities" aria-label="Что уже готово">
        <div><span>01</span><strong>Brand kit</strong><p>Eclipse black, signal blue и solar accent.</p></div>
        <div><span>02</span><strong>Deterministic motion</strong><p>Paused GSAP timeline без случайного времени.</p></div>
        <div><span>03</span><strong>Local contract</strong><p>Timing, SRI и supply-chain guards без network.</p></div>
        <div><span>04</span><strong>CLI fail closed</strong><p>Нет локальной exact-версии — нет скрытого download или render.</p></div>
      </div>
    </section>
  );
}
