import { FormEvent, useRef, useState } from 'react';
import {
  approveGpuHandoff, completeCaptionReview, createDatasetManifest,
  MAX_DATASET_BYTES, MAX_DATASET_FILES, serializeDatasetManifest,
  type DatasetManifest, type DatasetManifestInput,
} from '../services/datasetManifestContract';
import '../dataset-lab.css';

async function hashFile(file: File): Promise<string> {
  if (!crypto.subtle) throw new Error('Этот браузер не поддерживает локальный SHA-256');
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fileSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

function download(manifest: DatasetManifest) {
  const url = URL.createObjectURL(new Blob([serializeDatasetManifest(manifest)], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `dataset-manifest-${manifest.id}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function DatasetLab() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState('Персонаж Eclipse v1');
  const [purpose, setPurpose] = useState('');
  const [owner, setOwner] = useState('Eclipse Forge');
  const [rightsBasis, setRightsBasis] = useState<DatasetManifestInput['rightsBasis']>('owned');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [containsRealPeople, setContainsRealPeople] = useState(false);
  const [likenessConsent, setLikenessConsent] = useState(false);
  const [pinModel, setPinModel] = useState(false);
  const [modelId, setModelId] = useState('');
  const [modelRevision, setModelRevision] = useState('');
  const [modelHash, setModelHash] = useState('');
  const [modelLicense, setModelLicense] = useState('');
  const [reviewer, setReviewer] = useState('Павел');
  const [manifest, setManifest] = useState<DatasetManifest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const baseModelComplete = !pinModel || (
    modelId.trim().length >= 2
    && modelRevision.trim().length >= 2
    && /^[a-f0-9]{64}$/.test(modelHash)
    && modelLicense.trim().length >= 2
  );
  const canCreate = files.length > 0
    && files.length <= MAX_DATASET_FILES
    && totalBytes <= MAX_DATASET_BYTES
    && name.trim().length >= 3
    && purpose.trim().length >= 20
    && owner.trim().length >= 2
    && rightsConfirmed
    && (!containsRealPeople || likenessConsent)
    && baseModelComplete;

  async function buildManifest(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!files.length) { setError('Выберите изображения датасета'); return; }
    if (files.length > MAX_DATASET_FILES || totalBytes > MAX_DATASET_BYTES) { setError('Максимум 40 файлов и 256 МБ'); return; }
    setBusy(true);
    try {
      const hashed = [];
      for (const file of files) hashed.push({ fileName: file.name, mimeType: file.type, sizeBytes: file.size, sha256: await hashFile(file) });
      setManifest(createDatasetManifest({
        name, purpose, owner, rightsBasis, containsRealPeople,
        likenessConsentConfirmed: likenessConsent,
        rightsConfirmed,
        files: hashed,
        baseModel: pinModel ? { id: modelId, revision: modelRevision, sha256: modelHash, license: modelLicense } : null,
      }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось создать паспорт датасета'); }
    finally { setBusy(false); }
  }

  function reset() {
    setManifest(null); setFiles([]); setRightsConfirmed(false); setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  function review() {
    if (!manifest) return;
    try { setManifest(completeCaptionReview(manifest, reviewer)); setError(''); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось записать проверку'); }
  }

  function approve() {
    if (!manifest) return;
    try { setManifest(approveGpuHandoff(manifest, reviewer)); setError(''); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Передача на GPU заблокирована'); }
  }

  return (
    <section className="dataset-lab" aria-labelledby="dataset-lab-title">
      <header className="dataset-lab__hero">
        <div><p className="studio-eyebrow">ЛАБОРАТОРИЯ ДАТАСЕТОВ · ЛОКАЛЬНО</p><h1 id="dataset-lab-title">Датасет сначала получает паспорт</h1><p>Инвентаризация и SHA-256 выполняются в браузере. TagGUI остаётся отдельным GPL-процессом, kohya_ss — выключенным GPU worker, не текущим VPS.</p></div>
        <div className="dataset-boundaries"><span>СЕТЬ<strong>ВЫКЛ.</strong></span><span>ОБУЧЕНИЕ<strong>НЕ ЗАПУЩЕНО</strong></span><span>VPS<strong>ЗАПРЕЩЁН</strong></span></div>
      </header>

      {!manifest ? (
        <form className="dataset-form" onSubmit={(event) => void buildManifest(event)} noValidate>
          <div className="dataset-form__section"><span>01</span><div><h2>Соберите набор</h2><p>1–40 изображений, суммарно до 256 МБ.</p></div></div>
          <label className="dataset-file"><input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/avif" multiple onChange={(event) => { setFiles(Array.from(event.target.files ?? [])); setError(''); }} /><strong>{files.length ? `${files.length} файлов · ${fileSize(totalBytes)}` : 'Выбрать изображения'}</strong><span>Файлы не загружаются и не сохраняются приложением</span></label>
          <div className="dataset-grid"><label>Название<input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Персонаж Eclipse v1" /></label><label>Владелец<input value={owner} onChange={(event) => setOwner(event.target.value)} maxLength={160} /></label></div>
          <label>Цель обучения<textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} maxLength={600} placeholder="Что должна научиться воспроизводить модель и для какого продукта?" /></label>
          <div className="dataset-grid"><label>Основание прав<select value={rightsBasis} onChange={(event) => setRightsBasis(event.target.value as DatasetManifestInput['rightsBasis'])}><option value="owned">Собственные материалы</option><option value="licensed">Лицензия</option><option value="permission">Разрешение автора</option><option value="public-domain">Общественное достояние</option></select></label><label className="dataset-check"><input type="checkbox" checked={containsRealPeople} onChange={(event) => { setContainsRealPeople(event.target.checked); if (!event.target.checked) setLikenessConsent(false); }} /><span>Есть реальные люди</span></label></div>
          {containsRealPeople && <label className="dataset-check is-warning"><input type="checkbox" checked={likenessConsent} onChange={(event) => setLikenessConsent(event.target.checked)} /><span><strong>Есть явное согласие на обучение</strong><small>Не только на съёмку или публикацию.</small></span></label>}
          <label className="dataset-check"><input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} /><span><strong>Права подтверждены для каждого файла</strong><small>Не добавляйте scraped или неизвестные изображения.</small></span></label>
          <div className="dataset-model"><label className="dataset-check"><input type="checkbox" checked={pinModel} onChange={(event) => setPinModel(event.target.checked)} /><span><strong>Закрепить базовую модель</strong><small>Можно создать набор и выбрать модель позже.</small></span></label>{pinModel && <div className="dataset-grid"><label>ID модели<input value={modelId} onChange={(event) => setModelId(event.target.value)} maxLength={160} /></label><label>Ревизия / commit<input value={modelRevision} onChange={(event) => setModelRevision(event.target.value)} maxLength={160} /></label><label>SHA-256 модели<input value={modelHash} onChange={(event) => setModelHash(event.target.value.toLowerCase())} maxLength={64} className="is-mono" /></label><label>Лицензия модели<input value={modelLicense} onChange={(event) => setModelLicense(event.target.value)} maxLength={160} /></label></div>}</div>
          {error && <p className="dataset-error" role="alert">{error}</p>}
          <button className="dataset-primary" type="submit" disabled={!canCreate || busy}>{busy ? 'Считаем SHA-256…' : 'Создать паспорт датасета'}</button>
        </form>
      ) : (
        <div className="dataset-result">
          <header><div><p className="studio-eyebrow">ПАСПОРТ ГОТОВ</p><h2>{manifest.name}</h2><p>{manifest.purpose}</p></div><button type="button" onClick={reset}>Новый датасет</button></header>
          <div className="dataset-stats"><div><span>Файлы</span><strong>{manifest.totals.files}</strong></div><div><span>Размер</span><strong>{fileSize(manifest.totals.bytes)}</strong></div><div><span>Подписи</span><strong>{manifest.captionReview.status === 'reviewed' ? 'проверены' : 'ожидают'}</strong></div><div><span>GPU</span><strong>{manifest.gpuHandoff.status === 'approved_not_started' ? 'одобрен, не запущен' : 'заблокирован'}</strong></div></div>
          <div className="dataset-pipeline"><article className="is-complete"><span>01</span><h3>Инвентаризация</h3><p>Имена, размеры и SHA-256 зафиксированы. Файлы не сохранены.</p></article><article className={manifest.captionReview.status === 'reviewed' ? 'is-complete' : ''}><span>02</span><h3>Изоляция TagGUI</h3><p>Разметка — отдельным процессом. Каждая подпись проверяется человеком.</p></article><article className={manifest.gpuHandoff.status === 'approved_not_started' ? 'is-complete' : ''}><span>03</span><h3>Воркер kohya_ss</h3><p>Только закреплённая модель и отдельный GPU. Обучение здесь не запускается.</p></article></div>
          <label className="dataset-reviewer">Проверяющий<input value={reviewer} onChange={(event) => setReviewer(event.target.value)} maxLength={120} /></label>
          {error && <p className="dataset-error" role="alert">{error}</p>}
          <div className="dataset-actions">{manifest.captionReview.status === 'pending' && <button type="button" onClick={review} className="is-primary">Подписи проверены</button>}{manifest.captionReview.status === 'reviewed' && manifest.gpuHandoff.status === 'blocked' && <button type="button" onClick={approve} className="is-primary">Одобрить передачу на GPU</button>}<button type="button" onClick={() => download(manifest)}>Скачать manifest JSON</button></div>
          <p className="dataset-safe-note">Одобрение передачи не запускает обучение, не скачивает модель и не подключает GPU.</p>
        </div>
      )}
    </section>
  );
}
