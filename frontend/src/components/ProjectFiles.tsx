import { useEffect, useRef, useState, type ReactNode } from 'react';
import { localProjects, useProjects, useProjectDrafts, useLocalDraft } from '../hooks/useLocalDraft';
import { downloadLocalText } from '../services/researchContract';
import { hasProjectContent, readProjectFile, serializeProjectFile, type MediaProjectFile } from '../services/projectFileContract';
import { projectTitle } from '../services/localProjects';
import '../project-files.css';

interface Preview { file: MediaProjectFile; name: string }
type Naming = 'new' | 'duplicate' | 'rename';
function ProjectDialog({ title, busy, onCancel, children }: { title: string; busy: boolean; onCancel: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current; const previous = document.activeElement;
    dialog?.showModal(); dialog?.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
    return () => { dialog?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} className="project-preview" aria-labelledby="project-dialog-title"
    onCancel={(e) => { e.preventDefault(); if (!busy) onCancel(); }} onKeyDown={(e) => {
      if (e.key !== 'Tab') return;
      const elements = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')];
      if (!elements.length) { e.preventDefault(); return; }
      const first = elements[0]; const last = elements[elements.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }}>
    <h2 id="project-dialog-title">{title}</h2>{children}
  </dialog>;
}

export function ProjectFiles() {
  const projects = useProjects();
  const { research: researchDraft, beats: beatDraft } = useProjectDrafts();
  const research = useLocalDraft(researchDraft); const beats = useLocalDraft(beatDraft);
  const inputRef = useRef<HTMLInputElement>(null); const request = useRef(0); const acting = useRef(false); const namingSource = useRef('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [naming, setNaming] = useState<Naming | null>(null);
  const [trash, setTrash] = useState(false); const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState(''); const [reading, setReading] = useState(false);
  const [error, setError] = useState(''); const [status, setStatus] = useState('');
  useEffect(() => () => { request.current++; }, []);
  const active = projects.projects.find((p) => p.id === projects.activeId)!;
  const ready = research.ready && beats.ready;
  const busy = projects.busy || reading;
  const editable = ready && ['ready', 'memory'].includes(projects.phase) && !busy && !active.deletedAt;
  const canDownload = ready && hasProjectContent(research.data, beats.data);
  function cancel() { setPreview(null); setNaming(null); setDeleting(false); setError(''); setStatus('Отменено. Текущий проект не изменён.'); }
  function download() {
    try {
      const raw = serializeProjectFile(researchDraft.getSnapshot().data, beatDraft.getSnapshot().data);
      downloadLocalText(raw, 'eclipse-media-project-' + new Date().toISOString().slice(0, 10) + '.json');
      setStatus('Файл проекта подготовлен. Проверьте загрузки браузера.'); setError('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось подготовить файл.'); }
  }
  async function choose(file: File) {
    const id = ++request.current;
    setReading(true); setError(''); setStatus('Проверяем файл на этом устройстве…');
    try {
      const data = await readProjectFile(file);
      if (id !== request.current) return;
      setName(file.name.replace(/\.json$/i, '').replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 80) || 'Импортированный проект');
      setPreview({ file: data, name: file.name }); setStatus('');
    } catch (caught) { if (id === request.current) { setError(caught instanceof Error ? caught.message : 'Не удалось прочитать файл.'); setStatus('Текущий проект не изменён.'); } }
    finally { if (id === request.current) setReading(false); }
  }
  async function perform(action: () => Promise<void>, success: string) {
    if (acting.current) return;
    acting.current = true; setError(''); setStatus('');
    try { await action(); setNaming(null); setPreview(null); setDeleting(false); setStatus(success); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось изменить проект.'); }
    finally { acting.current = false; }
  }
  function begin(mode: Naming) {
    namingSource.current = active.title;
    setNaming(mode); setName(mode === 'new' ? 'Новый проект' : mode === 'duplicate' ? (active.title.slice(0, 71) + ' (копия)') : active.title);
    setError(''); setStatus('');
  }
  function submitName() {
    void perform(async () => {
      const title = projectTitle(name);
      if (preview) await localProjects.create(title, preview.file);
      else if (naming === 'rename') await localProjects.rename(active.id, title, namingSource.current);
      else await localProjects.create(title, naming === 'duplicate' ? 'duplicate' : undefined);
    }, naming === 'rename' ? 'Название проекта изменено.' : 'Проект открыт. Предыдущая работа осталась в списке.');
  }
  const namingInput = <label className="project-name">Название проекта<input value={name} maxLength={80} disabled={busy} data-initial-focus
    onChange={(e) => setName(e.target.value)} autoComplete="off" /></label>;
  const dialogActions = <div className="project-files__actions">
    <button type="button" disabled={busy} onClick={cancel}>Отмена</button>
    <button type="submit" className="project-files__primary" disabled={busy || !name.trim()}>{busy ? 'Сохраняем…' : naming === 'rename' ? 'Сохранить название' : preview ? 'Добавить и открыть' : 'Создать проект'}</button>
  </div>;
  return <section className="project-files" aria-label="Мои проекты" aria-busy={busy}>
    <div className="project-files__row">
      <label className="project-picker">Мои проекты<select aria-label="Текущий проект" value={projects.activeId} disabled={!ready || busy}
        onChange={(e) => { const id = e.target.value; void perform(() => localProjects.switchTo(id), 'Проект переключён.'); }}>
        {projects.projects.filter((p) => !p.deletedAt || p.id === projects.activeId).map((p) => <option key={p.id} value={p.id} disabled={!!p.deletedAt}>{p.title}{p.deletedAt ? ' (в корзине)' : ''}</option>)}
      </select></label>
      <div className="project-files__actions">
        <button type="button" className="project-files__primary" disabled={!editable} onClick={() => begin('new')}>Новый проект</button>
        <button type="button" disabled={!editable} onClick={() => begin('rename')}>Переименовать</button>
        <button type="button" disabled={!editable} onClick={() => begin('duplicate')}>Создать копию</button>
        <button type="button" disabled={!editable} onClick={() => { setDeleting(true); setError(''); }}>В корзину</button>
        <button type="button" aria-expanded={trash} disabled={busy} onClick={() => setTrash(!trash)}>Корзина ({projects.projects.filter((p) => p.deletedAt).length})</button>
      </div>
    </div>
    <div className="project-files__row project-files__transfer">
      <p>Разбор, тезисы, бит-карта, режиссура и сценарий хранятся отдельно для каждого проекта.</p>
      <div className="project-files__actions">
        <button type="button" disabled={!canDownload || busy} onClick={download}>Скачать проект</button>
        <button type="button" disabled={!editable} onClick={() => inputRef.current?.click()}>Открыть проект</button>
      </div>
    </div>
    <input ref={inputRef} type="file" hidden accept=".json,application/json" aria-label="Выберите файл проекта" onChange={(e) => {
      const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (file) void choose(file);
    }} />
    <p className="project-files__privacy">Только в этом браузере, без отправки на сервер. Открытие JSON создаёт новый проект. Резервный файл до 4 МБ содержит текст, но не аудио и видео; он не зашифрован.</p>
    {projects.phase === 'loading' && <p role="status">Открываем проекты…</p>}
    {active.deletedAt && <p role="alert" className="project-files__warning">Этот проект перемещён в корзину другой вкладкой. Правки здесь заблокированы. Скачайте текущий вариант или восстановите проект.</p>}
    {trash && <section className="project-trash" aria-label="Корзина проектов"><h2>Корзина проектов</h2>
      <p>Удаления навсегда нет. Сохранённые данные остаются до восстановления или очистки данных браузера.</p>
      {!projects.projects.some((p) => p.deletedAt) && <p>Корзина пуста.</p>}
      {projects.projects.filter((p) => p.deletedAt).map((p) => <div key={p.id} className="project-files__row"><span>{p.title}</span>
        <button disabled={busy} type="button" onClick={() => void perform(() => localProjects.restore(p.id), 'Проект восстановлен. Выберите его в списке.')}>Восстановить «{p.title}»</button></div>)}
    </section>}
    {projects.phase === 'error' && <div className="project-files__actions">
      <button type="button" onClick={() => void localProjects.retry()}>Повторить открытие списка</button>
      {!projects.corrupt && <button type="button" onClick={localProjects.continueInMemory}>Проекты без сохранения</button>}
    </div>}
    {projects.phase === 'memory' && <p className="project-files__warning">Список проектов только в памяти этой вкладки. Скачайте нужные проекты до закрытия страницы.</p>}
    {!ready && projects.phase !== 'loading' && <p role="status">Восстановите черновики в разделах «План» и «Бит-карта» или выберите работу без сохранения.</p>}
    {projects.busy && <p role="status">Сохраняем проект и открываем выбранный…</p>}
    {status && <p role="status">{status}</p>}
    {(error || projects.error) && !preview && !naming && <p role="alert" className="project-files__warning">{error || projects.error}</p>}
    {projects.error && projects.phase === 'ready' && <button type="button" disabled={busy} onClick={() => void localProjects.refresh()}>Обновить список проектов</button>}
    {(preview || naming) && <ProjectDialog title={preview ? 'Добавить проект из файла' : naming === 'rename' ? 'Переименовать проект' : naming === 'duplicate' ? 'Копия проекта' : 'Новый проект'} busy={busy} onCancel={cancel}>
      <form onSubmit={(e) => { e.preventDefault(); submitName(); }}>
        {preview && <>
          <p className="project-preview__filename">{preview.name}</p>
          <p>Будет создан отдельный проект. Текущий разбор и план сцен останутся в списке.</p>
          <dl className="project-preview__summary">
            <div><dt>Субтитры</dt><dd>{preview.file.research.loaded?.fileName ?? 'Нет'}</dd></div>
            <div><dt>Фрагменты / тезисы</dt><dd>{preview.file.research.loaded?.transcript.cues.length ?? 0} / {preview.file.research.notes.length}</dd></div>
            <div><dt>Бит-карта</dt><dd>{preview.file.beats.project?.source.fileName ?? 'Нет'}</dd></div>
            <div><dt>Сцены / режиссура</dt><dd>{preview.file.beats.project?.scenes.length ?? 0} / {Object.keys(preview.file.beats.direction.edits).length}</dd></div>
            <div><dt>Сценарий</dt><dd>{preview.file.beats.storyboard?.scenes.length ?? 0} сцен</dd></div>
          </dl>
        </>}
        {namingInput}
        {naming !== 'rename' && <p className="project-preview__notice">Настройки автосохранения наследуются от текущего проекта. Разделы без сохранения останутся только до закрытия страницы.</p>}
        {(error || projects.error) && <p role="alert" className="project-files__warning">{error || projects.error}</p>}
        {dialogActions}
      </form>
    </ProjectDialog>}
    {deleting && <ProjectDialog title="Переместить проект в корзину?" busy={busy} onCancel={cancel}>
      <p>«{active.title}» исчезнет из основного списка. Разбор, бит-карта и сценарий можно будет восстановить из корзины.</p>
      <p>Разделы с выключенным автосохранением доступны только до закрытия этой вкладки. Сначала скачайте резервную копию, если она нужна.</p>
      <div className="project-files__actions"><button type="button" data-initial-focus disabled={busy} onClick={cancel}>Оставить проект</button>
        <button type="button" disabled={busy} onClick={() => void perform(() => localProjects.archive(active.id), 'Проект в корзине. Его можно восстановить.')}>Переместить в корзину</button></div>
      {(error || projects.error) && <p role="alert">{error || projects.error}</p>}
    </ProjectDialog>}
  </section>;
}
