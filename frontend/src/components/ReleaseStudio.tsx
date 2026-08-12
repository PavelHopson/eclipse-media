import { useState } from 'react';
import { StoryboardImport } from './StoryboardImport';

const RELEASE_DIR_COMMAND = 'cd frontend/public/studio/eclipse-release';
const CHECK_COMMAND = `${RELEASE_DIR_COMMAND}; npm run check`;
const VERIFY_COMMAND = `${RELEASE_DIR_COMMAND}; npm run verify`;
const FORMATS = {
  landscape: { label: '16:9', command: `${RELEASE_DIR_COMMAND}; npm run render:landscape` },
  vertical: { label: '9:16', command: `${RELEASE_DIR_COMMAND}; npm run render:vertical` },
  square: { label: '1:1', command: `${RELEASE_DIR_COMMAND}; npm run render:square` },
} as const;
type ReleaseFormat = keyof typeof FORMATS;

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
  const [format, setFormat] = useState<ReleaseFormat>('landscape');
  const renderCommand = FORMATS[format].command;

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
            <span className="studio-runtime__signal" aria-hidden="true" />
            Exact HyperFrames CLI 0.7.88 закреплён lockfile · verify обязателен перед render
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
            <span className="studio-format">{FORMATS[format].label} · 15 sec</span>
          </div>
          <div className="studio-format-switch" role="group" aria-label="Формат видео">
            {(Object.keys(FORMATS) as ReleaseFormat[]).map((item) => (
              <button key={item} type="button" className={format === item ? 'is-active' : ''} aria-pressed={format === item} onClick={() => setFormat(item)}>
                {FORMATS[item].label}
              </button>
            ))}
          </div>
          <div className={`studio-preview-frame studio-preview-frame--${format}`}>
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
              <div><strong>Соберите нужный формат</strong><p>Выполните <code>verify</code>, выберите 16:9, 9:16 или 1:1 и запустите показанную render-команду.</p></div>
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
              <code>{renderCommand}</code>
            </div>
            <button type="button" aria-label={`Скопировать команду render ${FORMATS[format].label}`} onClick={() => copyCommand(renderCommand, `Команда render ${FORMATS[format].label} скопирована`)}>
              <CopyIcon />
            </button>
          </div>

          <p className="studio-feedback" aria-live="polite">{copied ?? 'Exact CLI запускается локально; публикация остаётся ручной.'}</p>
        </aside>
      </div>

      <StoryboardImport />

      <div className="studio-capabilities" aria-label="Что уже готово">
        <div><span>01</span><strong>Brand kit</strong><p>Eclipse black, signal blue и solar accent.</p></div>
        <div><span>02</span><strong>Deterministic motion</strong><p>Paused GSAP timeline без случайного времени.</p></div>
        <div><span>03</span><strong>Local contract</strong><p>Timing, SRI и supply-chain guards без network.</p></div>
        <div><span>04</span><strong>Exact CLI</strong><p>Только версия 0.7.88 из lockfile; runner не использует скрытый download или npx.</p></div>
      </div>
    </section>
  );
}
