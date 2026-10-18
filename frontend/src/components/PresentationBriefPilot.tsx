import { useState } from 'react';
import {
  buildSnapdeckPrompt,
  createPresentationBrief,
  serializePresentationBrief,
  type BriefSource,
  type PresentationBrief,
  type PresentationFormat,
} from '../services/presentationBriefContract';
import '../presentation-brief.css';

function newSource(): BriefSource { return { id: `source-${crypto.randomUUID()}`, title: '', url: '', claim: '', review: 'unchecked' }; }
function download(name: string, contents: string, type: string) { const url = URL.createObjectURL(new Blob([contents], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0); }

export function PresentationBriefPilot() {
  const [title, setTitle] = useState('Презентация Eclipse');
  const [goal, setGoal] = useState('Показать проверенную идею коротко и понятно.');
  const [audience, setAudience] = useState('Команда и первые пользователи');
  const [format, setFormat] = useState<PresentationFormat>('ppt-16-9');
  const [slideCount, setSlideCount] = useState(8);
  const [visualDirection, setVisualDirection] = useState('Editorial dark: крупная типографика, один акцент, много воздуха.');
  const [sources, setSources] = useState<BriefSource[]>([newSource()]);
  const [forbiddenText, setForbiddenText] = useState('');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [privateDataExcluded, setPrivateDataExcluded] = useState(false);
  const [brief, setBrief] = useState<PresentationBrief | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Заполните brief. Snapdeck подключается только после ручной проверки.');

  function updateSource(id: string, patch: Partial<BriefSource>) { setSources(current => current.map(source => source.id === id ? { ...source, ...patch } : source)); }
  function build() {
    setError('');
    try {
      const next = createPresentationBrief({ title, goal, audience, format, slideCount, visualDirection, sources, forbiddenClaims: forbiddenText.split('\n').map(value => value.trim()).filter(Boolean), rightsConfirmed, privateDataExcluded });
      setBrief(next); setStatus('Готово: outline можно передать в Snapdeck после ручного согласования.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось собрать brief.'); }
  }
  async function copyPrompt() {
    if (!brief) return;
    if (!navigator.clipboard) { setError('Буфер обмена недоступен. Скачайте JSON и скопируйте prompt из локального файла.'); return; }
    try { await navigator.clipboard.writeText(buildSnapdeckPrompt(brief)); setError(''); setStatus('Промпт скопирован локально. Перед отправкой ещё раз проверьте источники и приватность.'); }
    catch { setError('Не удалось записать в буфер обмена. Скачайте JSON и продолжите вручную.'); }
  }

  return <section className="presentation-brief" aria-labelledby="presentation-brief-title">
    <header className="presentation-brief__hero"><div><p className="studio-eyebrow">SNAPDECK / LOCAL BRIEF</p><h1 id="presentation-brief-title">Презентация начинается с доказательств</h1><p>Соберите цель, аудиторию, источники и ограничения здесь. Snapdeck может оформить черновик, но не заменяет проверку фактов, прав и финального PPTX.</p></div><div className="presentation-brief__badge" aria-hidden="true"><span>BRIEF</span><b>01</b><small>review<br />before<br />send</small></div></header>
    <form className="presentation-brief__form" onSubmit={event => { event.preventDefault(); build(); }}>
      <div className="presentation-brief__section"><span>01 / СООБЩЕНИЕ</span><h2>Что должна сказать презентация</h2><div className="presentation-brief__fields"><label className="planning-field"><span>Название</span><input maxLength={140} value={title} onChange={event => setTitle(event.target.value)} /></label><label className="planning-field"><span>Цель</span><textarea maxLength={600} rows={2} value={goal} onChange={event => setGoal(event.target.value)} /></label><label className="planning-field"><span>Аудитория</span><input maxLength={240} value={audience} onChange={event => setAudience(event.target.value)} /></label><label className="planning-field"><span>Формат</span><select value={format} onChange={event => setFormat(event.target.value as PresentationFormat)}><option value="ppt-16-9">PPT · 16:9</option><option value="ppt-4-3">PPT · 4:3</option><option value="carousel-4-5">Карусель · 4:5</option></select></label><label className="planning-field"><span>Слайдов</span><input type="number" min={3} max={300} value={slideCount} onChange={event => setSlideCount(Number(event.target.value))} /></label><label className="planning-field presentation-brief__wide"><span>Визуальное направление</span><input maxLength={300} value={visualDirection} onChange={event => setVisualDirection(event.target.value)} /></label></div></div>
      <div className="presentation-brief__section"><div className="presentation-brief__section-heading"><div><span>02 / ИСТОЧНИКИ</span><h2>Что можно использовать</h2></div><button type="button" onClick={() => setSources(current => [...current, newSource()])} disabled={sources.length >= 12}>Добавить источник</button></div><div className="presentation-brief__sources">{sources.map((source, index) => <fieldset key={source.id}><legend>Источник {String(index + 1).padStart(2, '0')}</legend><div className="presentation-brief__fields"><label className="planning-field"><span>Название</span><input maxLength={140} value={source.title} onChange={event => updateSource(source.id, { title: event.target.value })} /></label><label className="planning-field"><span>URL</span><input type="url" maxLength={2048} placeholder="https://…" value={source.url} onChange={event => updateSource(source.id, { url: event.target.value })} /></label><label className="planning-field presentation-brief__wide"><span>Какой тезис подтверждает</span><textarea maxLength={500} rows={2} value={source.claim} onChange={event => updateSource(source.id, { claim: event.target.value })} /></label><label className="presentation-brief__check"><input type="checkbox" checked={source.review === 'checked'} onChange={event => updateSource(source.id, { review: event.target.checked ? 'checked' : 'unchecked' })} /> Источник проверен редактором</label></div>{sources.length > 1 && <button type="button" className="presentation-brief__remove" onClick={() => setSources(current => current.filter(item => item.id !== source.id))}>Удалить источник</button>}</fieldset>)}</div></div>
      <div className="presentation-brief__section"><span>03 / ОГРАНИЧЕНИЯ</span><h2>Что не должно попасть в слайды</h2><label className="planning-field"><span>По одному запрету на строку</span><textarea rows={4} maxLength={3600} placeholder="Не обещать гарантированный результат\nНе показывать персональные данные" value={forbiddenText} onChange={event => setForbiddenText(event.target.value)} /></label><div className="presentation-brief__checks"><label className="presentation-brief__check"><input type="checkbox" checked={rightsConfirmed} onChange={event => setRightsConfirmed(event.target.checked)} /> Есть права на материалы и их переработку</label><label className="presentation-brief__check"><input type="checkbox" checked={privateDataExcluded} onChange={event => setPrivateDataExcluded(event.target.checked)} /> Приватные данные исключены</label></div><button className="planning-primary" type="submit">Собрать presentation brief</button>{error && <p className="planning-error" role="alert">{error}</p>}<p className="presentation-brief__status" role="status">{status}</p></div>
    </form>
    {brief && <section className="presentation-brief__preview" aria-labelledby="presentation-brief-preview-title"><div className="presentation-brief__preview-heading"><div><span className="studio-eyebrow">04 / REVIEW GATE</span><h2 id="presentation-brief-preview-title">{brief.title}</h2><p>{brief.format} · {brief.slideCount} слайдов · {brief.sources.length} источника</p></div><div className="presentation-brief__actions"><button type="button" onClick={() => void copyPrompt()}>Скопировать промпт Snapdeck</button><button type="button" className="planning-primary" onClick={() => download(`${brief.title.replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'presentation'}-brief.json`, serializePresentationBrief(brief), 'application/json;charset=utf-8')}>Скачать JSON</button></div></div><div className="presentation-brief__gate"><strong>{brief.sources.every(source => source.review === 'checked') ? 'Источники отмечены для ручной проверки' : 'Есть источники без отметки редактора'}</strong><span>Это не подтверждение достоверности: перед генерацией проверьте каждый тезис и экспортированный PPTX.</span></div></section>}
  </section>;
}
