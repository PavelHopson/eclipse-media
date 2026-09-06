import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildResearchExport, codexHandoff, cueLink, displayCueTime, downloadLocalText,
  MAX_SELECTIONS, parseTranscript, sha256Bytes, validateTranscriptFile, youtubeVideoId,
  type ResearchNote, type ReviewStatus,
} from '../services/researchContract';
import { researchDraft, useLocalDraft } from '../hooks/useLocalDraft';
import { DraftStatus } from './DraftStatus';
import '../research-direction.css';

const EXAMPLE = 'WEBVTT\n\n00:00.000 --> 00:04.000\nВ этом примере мы планируем короткий ролик о мастерской.\n\n00:04.500 --> 00:09.000\nСначала покажем процесс, затем готовый результат.\n\n00:09.000 --> 00:14.000\nСтоимость и сроки нужно проверить у автора проекта.\n';
const PAGE_SIZE = 40;

export function TranscriptResearch() {
  const fileRef = useRef<HTMLInputElement>(null);
  const run = useRef(0);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const draft = useLocalDraft(researchDraft);
  const { videoUrl, loaded, notes, page } = draft.data;
  const setVideoUrl = (videoUrl: string) => researchDraft.update((current) => ({ ...current, videoUrl }));
  const setNotes = (update: (notes: ResearchNote[]) => ResearchNote[]) => researchDraft.update((current) => ({ ...current, notes: update(current.notes) }));
  const setPage = (update: (page: number) => number) => researchDraft.update((current) => ({ ...current, page: update(current.page) }));
  useEffect(() => () => { run.current++; }, []);

  const video = useMemo(() => {
    try { return { id: youtubeVideoId(videoUrl), error: '' }; }
    catch (caught) { return { id: null, error: (caught as Error).message }; }
  }, [videoUrl]);
  const review = useMemo(() => {
    if (!loaded || !notes.length) return { data: null, error: '' };
    try { return { data: buildResearchExport(loaded.transcript, notes, { ...loaded, videoUrl }), error: '' }; }
    catch (caught) { return { data: null, error: (caught as Error).message }; }
  }, [loaded, notes, videoUrl]);

  async function load(file?: File) {
    if (!draft.ready) return;
    const id = ++run.current;
    setBusy(true); setError(''); setStatus('Читаем субтитры на этом устройстве.');
    try {
      if (file) {
        if (!rights) throw new Error('Подтвердите право на обработку субтитров.');
        validateTranscriptFile(file);
      }
      const bytes = file ? await file.arrayBuffer() : new TextEncoder().encode(EXAMPLE).buffer;
      if (id !== run.current) return;
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { throw new Error('Не удалось прочитать UTF-8. Пересохраните субтитры в UTF-8.'); }
      const transcript = parseTranscript(text);
      const sha256 = await sha256Bytes(bytes);
      if (id !== run.current) return;
      researchDraft.update((current) => ({ ...current, loaded: { transcript, sha256, fileName: file?.name ?? 'synthetic-example.vtt' }, notes: [], page: 0 }));
      setStatus((file ? 'Файл прочитан. ' : 'Учебный пример открыт. ') + 'Выберите фрагмент и напишите тезис своими словами.');
    } catch (caught) {
      if (id === run.current) {
        setError(caught instanceof Error ? caught.message : 'Не удалось прочитать субтитры.');
        setStatus('Предыдущий разбор, если он был, сохранён. Можно выбрать другой файл.');
      }
    } finally {
      if (id === run.current) setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function toggleCue(cueId: string) {
    setNotes((current) => current.some((note) => note.cueId === cueId)
      ? current.filter((note) => note.cueId !== cueId)
      : current.length < MAX_SELECTIONS ? [...current, { cueId, claim: '', status: 'unverified', evidenceUrl: '' }] : current);
    setStatus('');
  }
  function updateNote(cueId: string, patch: Partial<ResearchNote>) {
    setNotes((current) => current.map((note) => note.cueId === cueId ? { ...note, ...patch } : note));
    setStatus('');
  }
  function save(forCodex: boolean) {
    if (!review.data) return;
    const text = forCodex
      ? codexHandoff('Разбор видео для Eclipse', 'Проанализируй только выбранные тезисы. Укажи, что устарело и что можно применить. Таймкоды не выдумывай. По тексту нельзя подтверждать визуальные события. Для внешней проверки сначала согласуй источники.', review.data)
      : JSON.stringify(review.data, null, 2) + '\n';
    downloadLocalText(text, forCodex ? 'eclipse-research-codex.md' : 'eclipse-research.json', forCodex ? 'text/markdown;charset=utf-8' : undefined);
    setStatus('Файл подготовлен к сохранению. Включены только выбранные фрагменты. Отправка и публикация не запускались.');
  }
  const cues = loaded?.transcript.cues ?? [];

  return (
    <section className="research-workspace" aria-labelledby="research-title">
      <header className="planning-heading">
        <h2 id="research-title">Разбор субтитров</h2>
        <p>Выберите важные фрагменты, сформулируйте тезисы и сохраните разбор с таймкодами. Локальный черновик поможет продолжить после перезагрузки.</p>
      </header>
      <DraftStatus controller={researchDraft} snapshot={draft} busy={busy} onClear={() => { run.current++; setRights(false); setError(''); setStatus(''); }} />
      <fieldset className="draft-form" disabled={!draft.ready}>
      <legend className="sr-only">Разбор субтитров</legend>
      <div className="planning-toolbar">
        <label className="planning-consent">
          <input type="checkbox" checked={rights} disabled={busy} onChange={(event) => setRights(event.target.checked)} />
          <span>У меня есть право обработать эти субтитры</span>
        </label>
        <input ref={fileRef} type="file" accept=".srt,.vtt,text/vtt,application/x-subrip" hidden
          onChange={(event) => { const file = event.target.files?.[0]; if (file) void load(file); }} />
        <button className="planning-primary" type="button" disabled={!rights || busy} onClick={() => fileRef.current?.click()}>Выбрать SRT / VTT</button>
        <button type="button" disabled={busy} onClick={() => void load()}>Открыть пример</button>
        {busy && <button type="button" onClick={() => { run.current++; setBusy(false); setStatus('Чтение отменено.'); }}>Отменить</button>}
      </div>
      <p className="planning-muted">До 512 КБ и 2000 сегментов. Новый файл заменит разбор только после успешного чтения.</p>
      <label className="planning-field">
        <span>Ссылка YouTube <small>необязательно, только для переходов к таймкодам</small></span>
        <input value={videoUrl} maxLength={2048} inputMode="url" placeholder="https://www.youtube.com/watch?v=..." aria-invalid={Boolean(video.error)}
          onChange={(event) => setVideoUrl(event.target.value)} />
      </label>
      {video.error && <p className="planning-error" role="alert">{video.error}</p>}
      {video.id && <p className="planning-muted">Ссылка не загружается. Соответствие ролика субтитрам нужно проверить вручную.</p>}
      <div aria-live="polite" aria-busy={busy}>{status && <p className="planning-status">{status}</p>}</div>
      {error && <p className="planning-error" role="alert">{error}</p>}
      {!loaded && <div className="planning-empty"><h3>Здесь появятся фрагменты с временем</h3><p>Начните со своего файла или учебного примера. Распознавание речи и скачивание не запускаются.</p></div>}
      {loaded && (
        <>
          <p className="planning-muted">{loaded.fileName} · {cues.length} сегментов{loaded.transcript.overlapCount > 0 ? ' · Есть пересечения по времени: ' + loaded.transcript.overlapCount : ''}</p>
          <div className="research-columns">
            <section aria-labelledby="cue-list-title">
              <h3 id="cue-list-title">Текст источника</h3>
              <ol className="research-cues" start={page * PAGE_SIZE + 1}>
                {cues.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((cue) => {
                  const selected = notes.some((note) => note.cueId === cue.id);
                  const link = cueLink(video.id, cue.start);
                  return <li key={cue.id} className={selected ? 'is-selected' : ''}>
                    <div className="research-cue-heading">
                      <span>{displayCueTime(cue.start)} - {displayCueTime(cue.end)}</span>
                      <button type="button" aria-label={'Выбрать фрагмент ' + cue.id} aria-pressed={selected}
                        disabled={!selected && notes.length >= MAX_SELECTIONS} onClick={() => toggleCue(cue.id)}>{selected ? 'Выбран' : 'Выбрать'}</button>
                    </div>
                    <p>{cue.text}</p>
                    {link && <a href={link} target="_blank" rel="noopener noreferrer">Открыть этот момент</a>}
                  </li>;
                })}
              </ol>
              {cues.length > PAGE_SIZE && <nav className="planning-toolbar" aria-label="Страницы субтитров">
                <button type="button" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Назад</button>
                <span>{page + 1} / {Math.ceil(cues.length / PAGE_SIZE)}</span>
                <button type="button" disabled={(page + 1) * PAGE_SIZE >= cues.length} onClick={() => setPage((value) => value + 1)}>Далее</button>
              </nav>}
            </section>
            <section aria-labelledby="research-notes-title">
              <h3 id="research-notes-title">Ваши тезисы <small>{notes.length} / {MAX_SELECTIONS}</small></h3>
              {!notes.length && <p className="planning-empty">Нажмите «Выбрать» рядом с нужным фрагментом.</p>}
              {notes.map((note, index) => <article key={note.cueId} className="research-note">
                <h4>Тезис {index + 1} <small>{displayCueTime(cues.find((cue) => cue.id === note.cueId)!.start)}</small></h4>
                <label className="planning-field"><span>Тезис своими словами</span><textarea maxLength={300} rows={3} value={note.claim}
                  onChange={(event) => updateNote(note.cueId, { claim: event.target.value })} /></label>
                <label className="planning-field"><span>Проверка тезиса</span><select value={note.status} onChange={(event) => updateNote(note.cueId, { status: event.target.value as ReviewStatus })}>
                  <option value="unverified">Ещё не проверено</option><option value="confirmed">Проверено мной</option><option value="disputed">Есть противоречия</option>
                </select></label>
                <label className="planning-field"><span>Источник подтверждения</span><input inputMode="url" maxLength={2048} value={note.evidenceUrl}
                  placeholder="https://..." onChange={(event) => updateNote(note.cueId, { evidenceUrl: event.target.value })} /></label>
                <button type="button" onClick={() => toggleCue(note.cueId)}>Убрать тезис</button>
              </article>)}
              {review.error && <p className="planning-error" role="status">{review.error}</p>}
              <div className="planning-toolbar">
                <button className="planning-primary" type="button" disabled={!review.data || busy} onClick={() => save(false)}>Скачать разбор</button>
                <button type="button" disabled={!review.data || busy} onClick={() => save(true)}>Задание Codex</button>
              </div>
              <p className="planning-muted">Экспорт не содержит полный транскрипт. Фактчекинг и просмотр кадров не выполняются автоматически.</p>
            </section>
          </div>
        </>
      )}
      </fieldset>
    </section>
  );
}
