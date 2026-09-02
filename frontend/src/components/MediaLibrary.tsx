import { FormEvent, useMemo, useRef, useState } from 'react';
import {
  advanceMediaLibraryItem,
  createMediaLibraryItem,
  MAX_LIBRARY_FILE_BYTES,
  serializeMediaLibraryItem,
  type AllowedChannel,
  type RightsBasis,
} from '../services/mediaLibraryContract';
import { useMediaLibrary } from '../store/mediaLibrary';
import '../media-library.css';

const PROJECTS = ['Eclipse Media', 'Eclipse Forge', 'Eclipse AI Hub', 'Animation Lab', 'Growth OS', 'Личное'];
const CHANNELS: Array<{ id: AllowedChannel; label: string }> = [
  { id: 'internal', label: 'Внутри команды' },
  { id: 'web', label: 'Сайт' },
  { id: 'social', label: 'Соцсети' },
  { id: 'client', label: 'Клиентский проект' },
  { id: 'broadcast', label: 'Реклама / эфир' },
];
const BASIS: Array<{ id: RightsBasis; label: string; detail: string }> = [
  { id: 'owned', label: 'Наш материал', detail: 'Создан нами или по заказу Eclipse' },
  { id: 'licensed', label: 'Куплена лицензия', detail: 'Есть официальный asset ID и сертификат' },
  { id: 'permission', label: 'Есть разрешение', detail: 'Автор явно разрешил использование' },
  { id: 'public-domain', label: 'Общественное достояние', detail: 'Статус подтверждён первичным источником' },
];

function bytes(value: number): string {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(value / 1024))} КБ`;
}

function stageLabel(stage: string): string {
  return ({ registered: 'Паспорт создан', 'rights-reviewed': 'Права проверены', 'in-edit': 'В монтаже', ready: 'Готово' } as Record<string, string>)[stage] ?? stage;
}

async function fileSha256(file: File): Promise<string> {
  if (!crypto.subtle) throw new Error('Этот браузер не поддерживает локальный SHA-256');
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function downloadJson(content: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function MediaLibrary() {
  const store = useMediaLibrary();
  const fileRef = useRef<HTMLInputElement>(null);
  const certificateRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [project, setProject] = useState(PROJECTS[0]);
  const [basis, setBasis] = useState<RightsBasis>('owned');
  const [owner, setOwner] = useState('Eclipse Forge');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceAssetId, setSourceAssetId] = useState('');
  const [licenseName, setLicenseName] = useState('Собственный материал');
  const [licenseUrl, setLicenseUrl] = useState('');
  const [acquiredAt, setAcquiredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [expiresAt, setExpiresAt] = useState('');
  const [clientScope, setClientScope] = useState('');
  const [channels, setChannels] = useState<AllowedChannel[]>(['internal']);
  const [certificateName, setCertificateName] = useState('');
  const [trainingAllowed, setTrainingAllowed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'ready'>('all');

  const visible = useMemo(() => store.items.filter((item) => {
    const matchesQuery = !query.trim() || `${item.title} ${item.project} ${item.file.name}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesFilter = filter === 'all' || (filter === 'ready' ? item.workflow.stage === 'ready' : item.workflow.stage !== 'ready');
    return matchesQuery && matchesFilter;
  }), [filter, query, store.items]);

  function toggleChannel(channel: AllowedChannel) {
    setChannels((current) => current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel]);
  }

  function chooseBasis(next: RightsBasis) {
    setBasis(next);
    setError('');
    if (next === 'owned') setLicenseName('Собственный материал');
    else if (next === 'licensed') setLicenseName('Коммерческая лицензия');
    else if (next === 'permission') setLicenseName('Разрешение автора');
    else setLicenseName('Общественное достояние');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setFeedback('');
    if (!file) { setError('Сначала выберите локальный медиафайл'); return; }
    if (file.size > MAX_LIBRARY_FILE_BYTES) { setError('Для локальной карточки выберите файл до 512 МБ'); return; }
    setBusy(true);
    try {
      const sha256 = await fileSha256(file);
      const item = createMediaLibraryItem({
        title: title || file.name.replace(/\.[^.]+$/, ''),
        project,
        file: { name: file.name, sizeBytes: file.size, mimeType: file.type || 'application/octet-stream', sha256 },
        rights: {
          basis, owner, sourceUrl, sourceAssetId, licenseName, licenseUrl,
          acquiredAt: `${acquiredAt}T00:00:00.000Z`,
          expiresAt: expiresAt ? `${expiresAt}T00:00:00.000Z` : '',
          clientScope, allowedChannels: channels, certificateFileName: certificateName,
          trainingAllowed, confirmed,
        },
      });
      store.addItem(item);
      setFile(null);
      setTitle('');
      setConfirmed(false);
      setTrainingAllowed(false);
      setFeedback('Карточка и паспорт прав сохранены в этом браузере. Сам файл не копировался.');
      if (fileRef.current) fileRef.current.value = '';
      if (certificateRef.current) certificateRef.current.value = '';
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось создать карточку');
    } finally {
      setBusy(false);
    }
  }

  function advance(id: string) {
    const item = store.items.find((candidate) => candidate.id === id);
    if (!item) return;
    try {
      const note = item.workflow.stage === 'registered'
        ? 'Права, источник и сертификат проверены человеком'
        : item.workflow.stage === 'rights-reviewed'
          ? 'Материал добавлен в выбранный монтажный проект'
          : 'Финальный экспорт проверен человеком';
      store.replaceItem(advanceMediaLibraryItem(item, note));
      setError('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось обновить этап'); }
  }

  return (
    <section className="media-library" aria-labelledby="media-library-title">
      <header className="media-library__hero">
        <div><p className="studio-eyebrow">ЛОКАЛЬНАЯ МЕДИАТЕКА</p><h1 id="media-library-title">Материалы, права и следующий шаг</h1><p>Добавьте собственный или лицензированный файл. Eclipse сохранит только паспорт, SHA-256 и рабочий статус — без загрузки файла в сеть.</p></div>
        <dl><div><dt>Файлов</dt><dd>{store.items.length}</dd></div><div><dt>Готово</dt><dd>{store.items.filter((item) => item.workflow.stage === 'ready').length}</dd></div><div><dt>Сеть</dt><dd>выкл.</dd></div></dl>
      </header>

      <div className="media-library__layout">
        <form className="library-intake" onSubmit={(event) => void submit(event)} noValidate>
          <div className="library-section-title"><span>01</span><div><h2>Добавить локальный файл</h2><p>SHA-256 считается в браузере. До 512 МБ.</p></div></div>
          <label className="library-file-picker"><input ref={fileRef} type="file" accept="video/*,audio/*,image/*" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(''); }} /><strong>{file ? file.name : 'Выбрать видео, аудио или изображение'}</strong><span>{file ? bytes(file.size) : 'Файл останется на вашем устройстве'}</span></label>
          <div className="library-row"><label>Название<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder={file?.name.replace(/\.[^.]+$/, '') || 'Название материала'} /></label><label>Проект<select value={project} onChange={(event) => setProject(event.target.value)}>{PROJECTS.map((item) => <option key={item}>{item}</option>)}</select></label></div>

          <fieldset className="library-basis"><legend>Основание прав</legend>{BASIS.map((item) => <label key={item.id} className={basis === item.id ? 'is-selected' : ''}><input type="radio" name="rights-basis" checked={basis === item.id} onChange={() => chooseBasis(item.id)} /><strong>{item.label}</strong><span>{item.detail}</span></label>)}</fieldset>
          <div className="library-row"><label>Владелец прав<input value={owner} onChange={(event) => setOwner(event.target.value)} maxLength={160} /></label><label>Название лицензии<input value={licenseName} onChange={(event) => setLicenseName(event.target.value)} maxLength={160} /></label></div>

          {basis !== 'owned' && <div className="library-evidence"><div className="library-row"><label>Официальный источник<input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} inputMode="url" placeholder="https://..." /></label><label>Asset ID<input value={sourceAssetId} onChange={(event) => setSourceAssetId(event.target.value)} maxLength={160} /></label></div>{basis === 'licensed' && <><label>Ссылка на условия лицензии<input value={licenseUrl} onChange={(event) => setLicenseUrl(event.target.value)} inputMode="url" placeholder="https://..." /></label><label className="library-certificate">Сертификат лицензии<input ref={certificateRef} type="file" accept=".pdf,.txt,.json,.png,.jpg,.jpeg" onChange={(event) => setCertificateName(event.target.files?.[0]?.name ?? '')} /><span>{certificateName || 'Выбрать файл сертификата'}</span></label></>}</div>}

          <div className="library-row"><label>Получено<input type="date" value={acquiredAt} onChange={(event) => setAcquiredAt(event.target.value)} /></label><label>Действует до <small>необязательно</small><input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label></div>
          <fieldset className="library-channels"><legend>Где разрешено использовать</legend>{CHANNELS.map((item) => <label key={item.id}><input type="checkbox" checked={channels.includes(item.id)} onChange={() => toggleChannel(item.id)} />{item.label}</label>)}</fieldset>
          {channels.includes('client') && <label>Клиент или договор<input value={clientScope} onChange={(event) => setClientScope(event.target.value)} maxLength={240} placeholder="Например, договор EF-2026-09" /></label>}
          <label className="library-confirm"><input type="checkbox" checked={trainingAllowed} onChange={(event) => setTrainingAllowed(event.target.checked)} /><span><strong>Лицензия отдельно разрешает обучение модели</strong><small>Не отмечайте, если в условиях нет явного разрешения.</small></span></label>
          <label className="library-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><strong>Я проверил право хранить и обрабатывать материал</strong><small>Источник, владелец и область использования указаны верно.</small></span></label>
          {error && <p className="library-message is-error" role="alert">{error}</p>}{feedback && <p className="library-message is-success" role="status">{feedback}</p>}
          <button type="submit" className="library-primary" disabled={!file || !confirmed || busy}>{busy ? 'Считаем SHA-256…' : 'Создать паспорт и добавить'}</button>
        </form>

        <section className="library-shelf" aria-labelledby="library-shelf-title">
          <div className="library-shelf__header"><div><span>02</span><h2 id="library-shelf-title">Моя полка</h2></div><span>{visible.length} из {store.items.length}</span></div>
          <div className="library-tools"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти файл или проект" aria-label="Поиск по медиатеке" /><div role="group" aria-label="Фильтр статуса">{([['all', 'Все'], ['active', 'В работе'], ['ready', 'Готово']] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div></div>
          {visible.length === 0 ? <div className="library-empty"><strong>{store.items.length ? 'Ничего не найдено' : 'Медиатека пока пуста'}</strong><p>{store.items.length ? 'Измените поиск или фильтр.' : 'Первый файл появится здесь вместе с паспортом прав и следующим действием.'}</p></div> : <div className="library-list">{visible.map((item) => <article key={item.id} className="library-card"><header><div><span>{item.kind} · {item.project}</span><h3>{item.title}</h3><p>{item.file.name} · {bytes(item.file.sizeBytes)}</p></div><b className={item.workflow.stage === 'ready' ? 'is-ready' : ''}>{stageLabel(item.workflow.stage)}</b></header><div className="library-progress" aria-label={`Готовность ${item.workflow.progress}%`}><span style={{ width: `${item.workflow.progress}%` }} /></div><dl><div><dt>Права</dt><dd>{BASIS.find((entry) => entry.id === item.rightsReceipt.basis)?.label}</dd></div><div><dt>Каналы</dt><dd>{item.rightsReceipt.allowedChannels.join(', ')}</dd></div><div><dt>SHA-256</dt><dd title={item.file.sha256}>{item.file.sha256.slice(0, 12)}…</dd></div></dl>{item.workflow.nextAction && <div className="library-next"><span>Дальше</span><strong>{item.workflow.nextAction}</strong></div>}<footer>{item.workflow.stage !== 'ready' && <button type="button" onClick={() => advance(item.id)} className="is-primary">Отметить этап завершённым</button>}<button type="button" onClick={() => downloadJson(serializeMediaLibraryItem(item), `media-passport-${item.id}.json`)}>Скачать паспорт</button><button type="button" className="is-danger" onClick={() => { if (window.confirm(`Удалить карточку «${item.title}»? Сам локальный файл затронут не будет.`)) store.removeItem(item.id); }}>Удалить карточку</button></footer></article>)}</div>}
        </section>
      </div>
    </section>
  );
}
