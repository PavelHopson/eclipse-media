import { useEffect, useRef, useState } from 'react';
import { beatDraft, researchDraft, useLocalDraft } from '../hooks/useLocalDraft';
import { draftRepository } from '../services/draftStorage';
import { downloadLocalText } from '../services/researchContract';
import { hasProjectContent, readProjectFile, serializeProjectFile, type MediaProjectFile } from '../services/projectFileContract';
import { projectVersions, restoreProject, type ProjectVersions } from '../services/projectTransfer';
import '../project-files.css';

interface Preview { file: MediaProjectFile; name: string; versions: ProjectVersions }

function ProjectPreview({ preview, busy, error, status, canDownload, onDownload, onCancel, onRestore }: {
  preview: Preview; busy: boolean; error: string; status: string; canDownload: boolean;
  onDownload: () => void; onCancel: () => void; onRestore: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = ref.current; const previousFocus = document.activeElement;
    dialog?.showModal(); cancelRef.current?.focus();
    return () => { dialog?.close(); if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus(); };
  }, []);
  const { research, beats } = preview.file;
  return <dialog ref={ref} className="project-preview" aria-labelledby="project-preview-title" aria-describedby="project-preview-description"
    onKeyDown={(event) => {
      if (event.key !== 'Tab') return;
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      if (!buttons.length) { event.preventDefault(); return; }
      const first = buttons[0]; const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}
    onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id="project-preview-title">Открыть проект?</h2>
    <p className="project-preview__filename">{preview.name}</p>
    <p id="project-preview-description">Файл заменит текущий разбор и план сцен целиком. Пустые разделы в файле очистят соответствующие разделы здесь.</p>
    <dl className="project-preview__summary">
      <div><dt>Субтитры</dt><dd>{research.loaded ? research.loaded.fileName : 'Нет'}</dd></div>
      <div><dt>Фрагменты / тезисы</dt><dd>{research.loaded?.transcript.cues.length ?? 0} / {research.notes.length}</dd></div>
      <div><dt>Бит-карта</dt><dd>{beats.project?.source.fileName ?? 'Нет'}</dd></div>
      <div><dt>Сцены / режиссура</dt><dd>{beats.project?.scenes.length ?? 0} / {Object.keys(beats.direction.edits).length}</dd></div>
    </dl>
    <p className="project-preview__notice">Аудио и видео не включены. Незаконченные поля восстановятся как есть. Настройки автосохранения останутся прежними.</p>
    {(!researchDraft.getSnapshot().enabled || !beatDraft.getSnapshot().enabled) && <p className="project-files__warning">Для разделов без автосохранения открытые данные останутся только до закрытия страницы.</p>}
    {canDownload && <p className="project-preview__notice">Перед заменой можно скачать текущий проект. Файл не зашифрован и содержит полный текст субтитров и заметок.</p>}
    {error && <p role="alert" className="project-files__warning">{error}</p>}
    {status && <p role="status">{status}</p>}
    <div className="project-files__actions">
      {canDownload && <button type="button" disabled={busy} onClick={onDownload}>Скачать проект</button>}
      <button type="button" ref={cancelRef} disabled={busy} onClick={onCancel}>Отмена</button>
      <button type="button" className="project-files__primary" disabled={busy} onClick={onRestore}>{busy ? 'Открываем…' : 'Заменить и открыть'}</button>
    </div>
  </dialog>;
}

export function ProjectFiles({ onRestored }: { onRestored: () => void }) {
  const research = useLocalDraft(researchDraft);
  const beats = useLocalDraft(beatDraft);
  const inputRef = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const opening = useRef(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => () => { request.current++; }, []);
  const ready = research.ready && beats.ready;
  const canDownload = ready && hasProjectContent(research.data, beats.data);

  function download() {
    if (!ready) return;
    setError('');
    try {
      const raw = serializeProjectFile(researchDraft.getSnapshot().data, beatDraft.getSnapshot().data);
      downloadLocalText(raw, 'eclipse-media-project-' + new Date().toISOString().slice(0, 10) + '.json');
      setStatus('Файл проекта подготовлен к сохранению. Проверьте загрузки браузера.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось подготовить файл.'); }
  }
  async function choose(file: File) {
    const id = ++request.current;
    setBusy(true); setError(''); setStatus('Проверяем файл на этом устройстве…');
    try {
      const data = await readProjectFile(file);
      if (id !== request.current) return;
      setPreview({ file: data, name: file.name, versions: projectVersions(researchDraft, beatDraft) });
      setStatus('');
    } catch (caught) { if (id === request.current) { setError(caught instanceof Error ? caught.message : 'Не удалось прочитать файл.'); setStatus('Текущая работа не изменена. Можно выбрать другой файл.'); } }
    finally { if (id === request.current) setBusy(false); }
  }
  async function restore() {
    if (!preview || opening.current) return;
    opening.current = true; setBusy(true); setError('');
    try {
      await restoreProject(preview.file, preview.versions, researchDraft, beatDraft, draftRepository);
      onRestored(); setPreview(null);
      setStatus('Проект открыт. Разбор и план сцен восстановлены. Аудио и видео не загружались.');
    } catch (caught) { setError((caught instanceof Error ? caught.message : 'Не удалось открыть проект.') + ' Текущая работа не заменена.'); }
    finally { opening.current = false; setBusy(false); }
  }
  return <section className="project-files" aria-label="Файл проекта">
    <div className="project-files__row">
      <div><h2>Проект разбора и сцен</h2><p>Перенесите работу на другое устройство или сохраните копию.</p></div>
      <div className="project-files__actions">
        <button type="button" disabled={!canDownload || busy} onClick={download}>Скачать проект</button>
        <button type="button" disabled={!ready || busy} onClick={() => inputRef.current?.click()}>Открыть проект</button>
      </div>
    </div>
    <input ref={inputRef} type="file" hidden accept=".json,application/json" aria-label="Выберите файл проекта" onChange={(event) => {
      const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void choose(file);
    }} />
    <p className="project-files__privacy">JSON до 4 МБ. Субтитры, тезисы, бит-карта и режиссура без аудио и видео. Файл не зашифрован: передавайте только тем, кому доверяете.</p>
    {!ready && <p role="status">{research.phase === 'loading' || beats.phase === 'loading' ? 'Открываем локальные черновики…' : 'Сначала восстановите черновики в разделах «План» и «Бит-карта» или выберите работу без сохранения.'}</p>}
    {status && <p role="status">{status}</p>}
    {error && !preview && <p role="alert" className="project-files__warning">{error}</p>}
    {preview && <ProjectPreview preview={preview} busy={busy} error={error} status={status} canDownload={canDownload} onDownload={download}
      onCancel={() => { setPreview(null); setError(''); setStatus('Открытие отменено. Текущая работа не изменена.'); }} onRestore={() => void restore()} />}
  </section>;
}
