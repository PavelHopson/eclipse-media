import { ChangeEvent, useRef, useState } from 'react';
import {
  createInteractiveBookProject,
  serializeInteractiveBookProject,
  totalBookDuration,
  type BookBeat,
  type InteractiveBookProject,
} from '../services/interactiveBookContract';
import '../interactive-book.css';

const MAX_PDF_BYTES = 64 * 1024 * 1024;

async function hashFile(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Браузер не поддерживает локальный SHA-256.');
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function download(project: InteractiveBookProject) {
  const url = URL.createObjectURL(new Blob([serializeInteractiveBookProject(project)], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `${project.title.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'web-book'}-manifest.json`; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function InteractiveBookPilot() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('Новая интерактивная книга');
  const [chapterTitle, setChapterTitle] = useState('Введение');
  const [audience, setAudience] = useState('Команда Eclipse и читатели гайда');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [project, setProject] = useState<InteractiveBookProject | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Выберите PDF, который разрешено обрабатывать локально.');
  const [error, setError] = useState('');

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0]; if (!next) return;
    setFile(null); setProject(null); setError('');
    try {
      if (next.size > MAX_PDF_BYTES) throw new Error('PDF больше 64 МБ. Для пилота выберите меньший файл.');
      if (next.type !== 'application/pdf' && !next.name.toLowerCase().endsWith('.pdf')) throw new Error('Выберите PDF-файл.');
      setBusy(true); setStatus('Считаем SHA-256 локально. Содержимое PDF не отправляется в сеть.');
      await hashFile(next); setFile(next); setStatus('PDF принят. Заполните подтверждение прав и соберите локальный план.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось проверить PDF.'); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ''; }
  }

  async function buildPlan() {
    if (!file) { setError('Сначала выберите PDF.'); return; }
    if (!rightsConfirmed) { setError('Подтвердите право на обработку PDF.'); return; }
    setBusy(true); setError(''); setStatus('Создаём локальный storyboard и editable quiz.');
    try {
      const sha256 = await hashFile(file);
      setProject(createInteractiveBookProject({ title, audience, chapterTitle, source: { fileName: file.name, mimeType: 'application/pdf', bytes: file.size, sha256, rightsConfirmed, sourceKeptPrivate: true } }));
      setStatus('Готово: план можно проверить, изменить в следующем шаге и экспортировать как manifest.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось собрать план.'); }
    finally { setBusy(false); }
  }

  function updateBeat(chapterId: string, beatId: string, patch: Partial<BookBeat>) {
    setProject(current => current ? {
      ...current,
      chapters: current.chapters.map(chapter => chapter.id !== chapterId ? chapter : {
        ...chapter,
        beats: chapter.beats.map(beat => beat.id === beatId ? { ...beat, ...patch } : beat),
      }),
    } : null);
  }

  return <section className="interactive-book" aria-labelledby="interactive-book-title">
    <header className="interactive-book__hero"><div><p className="studio-eyebrow">PAPERMORPH / CODEX PILOT</p><h1 id="interactive-book-title">PDF → интерактивная веб-книга</h1><p>Локальный конвейер Eclipse Media: исходник → storyboard → narration → animation → quiz → статичный manifest. Сначала проверяем структуру и права, затем подключаем генераторы.</p></div><div className="interactive-book__orbit" aria-hidden="true"><span>1600×900</span><b>WEB<br />BOOK</b></div></header>
    <div className="interactive-book__grid"><form className="interactive-book__form" onSubmit={event => { event.preventDefault(); void buildPlan(); }}>
      <div className="interactive-book__section-heading"><span>01 / ИСТОЧНИК</span><h2>Соберите паспорт PDF</h2></div>
      <label className="planning-field"><span>Файл PDF</span><input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={event => void selectFile(event)} disabled={busy} />{file && <small>{file.name} · {(file.size / 1024 / 1024).toFixed(1)} МБ · хэш будет записан в manifest</small>}</label>
      <label className="planning-field"><span>Название книги</span><input maxLength={120} value={title} onChange={event => setTitle(event.target.value)} /></label>
      <label className="planning-field"><span>Первая глава</span><input maxLength={120} value={chapterTitle} onChange={event => setChapterTitle(event.target.value)} /></label>
      <label className="planning-field"><span>Для кого</span><input maxLength={180} value={audience} onChange={event => setAudience(event.target.value)} /></label>
      <label className="interactive-book__check"><input type="checkbox" checked={rightsConfirmed} onChange={event => setRightsConfirmed(event.target.checked)} /> <span>У меня есть право обрабатывать этот PDF и использовать его материалы.</span></label>
      <button className="planning-primary" type="submit" disabled={busy || !file}>{busy ? 'Проверяем…' : 'Собрать локальный план'}</button>
      <p className="interactive-book__status" role="status">{status}</p>{error && <p className="planning-error" role="alert">{error}</p>}
    </form><aside className="interactive-book__notes"><div className="interactive-book__section-heading"><span>02 / КОНТРОЛЬ</span><h2>Что остаётся под ревью</h2></div><ul><li><b>PDF</b><span>Не загружается в облако; в export попадает только метадата и SHA-256.</span></li><li><b>Storyboard</b><span>Каждый beat редактируемый: тезис, визуал, длительность и quiz.</span></li><li><b>Генерация</b><span>Озвучка и анимация пока помечены как pending — никаких скрытых вызовов провайдеров.</span></li></ul><div className="interactive-book__pipeline" aria-label="Этапы конвейера"><span className="is-done">PDF</span><i>→</i><span className="is-done">ПЛАН</span><i>→</i><span>VOICE</span><i>→</i><span>WEB</span></div></aside></div>
    {project && <section className="interactive-book__preview" aria-labelledby="interactive-book-preview-title"><div className="interactive-book__preview-heading"><div><span className="studio-eyebrow">03 / ПРЕДПРОСМОТР</span><h2 id="interactive-book-preview-title">{project.title}</h2><p>{project.audience} · {project.chapters.length} глава · {Math.round(totalBookDuration(project))} сек. чернового таймлайна</p></div><button type="button" className="planning-primary" onClick={() => download(project)}>Скачать manifest</button></div>{project.chapters.map(chapter => <article className="interactive-book__chapter" key={chapter.id}><div><span>ГЛАВА 01</span><h3>{chapter.title}</h3><p>{chapter.summary}</p></div><ol>{chapter.beats.map((beat, index) => <li key={beat.id}><span>{String(index + 1).padStart(2, '0')}</span><div className="interactive-book__beat"><label className="planning-field"><span>Beat {String(index + 1).padStart(2, '0')}</span><input maxLength={120} value={beat.title} onChange={event => updateBeat(chapter.id, beat.id, { title: event.target.value })} /></label><label className="planning-field"><span>Текст narration</span><textarea maxLength={600} rows={2} value={beat.narration} onChange={event => updateBeat(chapter.id, beat.id, { narration: event.target.value })} /></label><small>{beat.duration} сек · {beat.visual}{beat.quiz ? ' · quiz' : ''}</small></div></li>)}</ol></article>)}</section>}
  </section>;
}
