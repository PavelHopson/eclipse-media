import type { DraftController, DraftSnapshot } from '../services/draftController';
import '../draft-status.css';

export function DraftStatus<T>({ controller, snapshot, busy = false, onClear }: {
  controller: DraftController<T>; snapshot: DraftSnapshot<T>; busy?: boolean; onClear?: () => void;
}) {
  const { phase, enabled, ready, updatedAt, message } = snapshot;
  const text = phase === 'loading' ? 'Открываем локальный черновик…' : phase === 'saving' ? 'Сохраняем на устройстве…'
    : phase === 'saved' ? 'Сохранено на устройстве в ' + new Date(updatedAt!).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : phase === 'off' ? 'Автосохранение выключено. Правки только до закрытия страницы.'
    : phase === 'empty' ? 'Изменения будут сохраняться на этом устройстве.' : message;
  const locked = phase === 'loading' || busy;
  return <aside className="draft-status" aria-label="Локальный черновик">
    <div className="draft-status__row">
      <p role="status" className={['error', 'invalid', 'conflict'].includes(phase) ? 'draft-status__warning' : ''}>{text}</p>
      <div className="draft-status__actions">
        <label><input type="checkbox" checked={enabled} disabled={!ready || locked || ['conflict', 'error'].includes(phase)} onChange={(event) => {
          const next = event.target.checked;
          if (next || window.confirm('Отключить автосохранение и удалить сохранённые данные этого раздела? Текущая форма останется открыта.')) controller.setEnabled(next);
        }} />Сохранять на этом устройстве</label>
        <button type="button" disabled={locked || (!ready && phase !== 'invalid')} onClick={() => {
          if (window.confirm(controller.kind === 'beats' ? 'Очистить бит-карту, режиссуру и сценарий этого проекта? Разбор субтитров и скачанные файлы останутся.' : 'Удалить черновик разбора и очистить форму? Сценарий и скачанные файлы останутся.')) { onClear?.(); controller.clear(); }
        }}>Удалить черновик</button>
      </div>
    </div>
    {phase === 'conflict' && <div className="draft-status__actions">
      <button type="button" disabled={busy} onClick={() => { if (window.confirm('Заменить текущую форму сохранённой версией из другой вкладки?')) { onClear?.(); void controller.reload(); } }}>Загрузить сохранённый</button>
      <button type="button" disabled={busy} onClick={() => { if (window.confirm('Заменить сохранённый черновик вашим текущим вариантом? Другая вкладка получит предупреждение.')) void controller.overwrite(); }}>Сохранить мой вариант</button>
    </div>}
    {phase === 'error' && <button type="button" disabled={busy} onClick={() => void controller.retry()}>Повторить сохранение</button>}
    {phase === 'error' && !ready && <button type="button" onClick={controller.continueInMemory}>Продолжить без сохранения</button>}
    <small>{controller.kind === 'research' ? 'Сохраняются текст субтитров, ссылка и тезисы.' : 'Сохраняются бит-карта, режиссура и сценарий. Аудио и видео не сохраняются.'} Данные не отправляются на сервер. Это не резервная копия: очистка данных браузера удалит черновик. На общем компьютере отключите сохранение.</small>
  </aside>;
}
