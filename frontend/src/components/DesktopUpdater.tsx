import { useEffect, useState } from 'react';
import {
  checkDesktopUpdate,
  DesktopUpdateInfo,
  installDesktopUpdate,
  isDesktopApp,
} from '../api/desktopRuntime';

type UpdateStatus = 'idle' | 'available' | 'installing' | 'error' | 'dismissed';

const STARTUP_CHECK_DELAY_MS = 2_500;

export function DesktopUpdater() {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [update, setUpdate] = useState<DesktopUpdateInfo | null>(null);

  useEffect(() => {
    if (!isDesktopApp()) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void checkDesktopUpdate()
        .then((candidate) => {
          if (!active || !candidate) return;
          setUpdate(candidate);
          setStatus('available');
        })
        .catch(() => {
          // A startup check must never interrupt the local media workflow.
        });
    }, STARTUP_CHECK_DELAY_MS);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  async function install() {
    if (!update || status === 'installing') return;
    setStatus('installing');
    try {
      await installDesktopUpdate(update.version);
    } catch {
      setStatus('error');
    }
  }

  if (!isDesktopApp() || status === 'idle' || status === 'dismissed' || !update) return null;

  const installing = status === 'installing';
  const failed = status === 'error';

  return (
    <section className={`desktop-update-banner is-${status}`} role="status" aria-live="polite">
      <div className="desktop-update-banner__signal" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
        </svg>
      </div>
      <div className="desktop-update-banner__copy">
        <strong>
          {installing
            ? `Устанавливаем Eclipse Media ${update.version}`
            : failed
              ? 'Обновление не установилось'
              : `Доступна версия ${update.version}`}
        </strong>
        <span>
          {installing
            ? 'Проверяем подпись и готовим перезапуск. Не закрывайте приложение.'
            : failed
              ? 'Работа не потеряна. Проверьте интернет и повторите попытку.'
              : 'Подписанное обновление Eclipse Forge. Приложение перезапустится после установки.'}
        </span>
      </div>
      <div className="desktop-update-banner__actions">
        <button type="button" className="desktop-update-primary" onClick={() => void install()} disabled={installing}>
          {installing ? <span className="desktop-update-spinner" aria-hidden="true" /> : null}
          {installing ? 'Обновляем…' : failed ? 'Повторить' : 'Обновить сейчас'}
        </button>
        {!installing && (
          <button type="button" className="desktop-update-later" onClick={() => setStatus('dismissed')}>
            Позже
          </button>
        )}
      </div>
    </section>
  );
}
