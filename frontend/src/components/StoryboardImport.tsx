import { useState } from 'react';
import { parseStoryboardJson, type ReleaseStoryboard } from '../services/storyboardContract';
import '../storyboard-import.css';

export function StoryboardImport() {
  const [storyboard, setStoryboard] = useState<ReleaseStoryboard | null>(null);
  const [error, setError] = useState('');

  async function importFile(file: File | undefined) {
    if (!file) return;
    setStoryboard(null);
    setError('');
    try {
      if (file.size > 64 * 1024) throw new Error('Файл больше 64 KB. Это не storyboard-контракт Shotforge.');
      if (file.type && file.type !== 'application/json') throw new Error('Выберите JSON-файл из Shotforge.');
      setStoryboard(parseStoryboardJson(await file.text()));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось проверить storyboard.');
    }
  }

  return (
    <section className="storyboard-import" aria-labelledby="storyboard-import-title">
      <div className="storyboard-import__intro">
        <p className="studio-eyebrow">SHOTFORGE CONTRACT</p>
        <h2 id="storyboard-import-title">Проверьте раскадровку до render</h2>
        <p>Загрузите JSON из Shotforge. Eclipse Media проверит схему, timeline и ручной approval, но не запустит CLI и не изменит шаблон.</p>
        <label className="storyboard-import__file">
          <span>{storyboard ? 'Выбрать другой JSON' : 'Выбрать JSON из Shotforge'}</span>
          <input type="file" accept="application/json,.json" onChange={(event) => void importFile(event.target.files?.[0])} />
        </label>
        {error && <p className="storyboard-import__error" role="alert">{error}</p>}
        {!storyboard && !error && <p className="storyboard-import__status">Файл проверяется локально в браузере и никуда не отправляется.</p>}
      </div>

      <div className="storyboard-import__preview" aria-live="polite">
        {!storyboard ? <div className="storyboard-import__empty"><strong>Ожидается eclipse.release-storyboard.v1</strong><span>5 сцен · 15 секунд · approval required</span></div> : <>
          <div className="storyboard-import__heading"><div><span>VALIDATED</span><h3>{storyboard.title}</h3></div><b>{storyboard.format} · {storyboard.duration} sec</b></div>
          <ol>{storyboard.scenes.map((scene) => <li key={scene.id}><time>{scene.start}–{scene.start + scene.duration}s</time><div><span>{scene.eyebrow}</span><strong>{scene.headline}</strong><p>{scene.body}</p></div></li>)}</ol>
          <p className="storyboard-import__approval">Следующий шаг: вручную перенесите подтверждённый текст в editable brief. Автопубликация отключена.</p>
        </>}
      </div>
    </section>
  );
}
