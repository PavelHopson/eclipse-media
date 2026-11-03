import { useEffect, useMemo, useState } from "react";
import { parseMediaAssetJson, validateLocalImageFile, type MediaAssetSidecar } from "../services/mediaAssetContract";
import "../media-asset-import.css";

export function MediaAssetImport() {
  const [sidecar, setSidecar] = useState<MediaAssetSidecar | null>(null);
  const [error, setError] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);

  const imagePreviewUrl = useMemo(() => imageFile ? URL.createObjectURL(imageFile) : "", [imageFile]);

  useEffect(() => {
    return () => { if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl); };
  }, [imagePreviewUrl]);

  async function importFile(file: File | undefined) {
    if (!file) return;
    setSidecar(null);
    setImageFile(null);
    setRightsConfirmed(false);
    setError("");
    try {
      if (file.size > 32 * 1024) throw new Error("Media Asset exceeds 32 KB.");
      if (file.type && file.type !== "application/json") throw new Error("Select the JSON sidecar from Text2Image.");
      setSidecar(parseMediaAssetJson(await file.text()));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Media Asset validation failed.");
    }
  }

  function importImage(file: File | undefined) {
    if (!file || !sidecar) return;
    setError("");
    setImageFile(null);
    setRightsConfirmed(false);
    try {
      validateLocalImageFile(file, sidecar);
      setImageFile(file);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сопоставить локальное изображение.");
    }
  }

  return (
    <section className="media-asset-import" aria-labelledby="media-asset-title">
      <div>
        <p className="studio-eyebrow">TEXT2IMAGE CONTRACT</p>
        <h2 id="media-asset-title">Verify the image passport before production</h2>
        <p>Import the small JSON sidecar. The image stays on your device and is never fetched from a URL.</p>
        <label className="media-asset-import__file">
          <span>{sidecar ? "Select another JSON" : "Select Media Asset JSON"}</span>
          <input type="file" accept="application/json,.json" onChange={(event) => void importFile(event.target.files?.[0])} />
        </label>
        {error && <p className="media-asset-import__error" role="alert">{error}</p>}
        {!sidecar && !error && <p className="media-asset-import__status">Local validation only. No upload, render or publish action.</p>}
      </div>
      <div className="media-asset-import__preview" aria-live="polite">
        {!sidecar ? (
          <div className="media-asset-import__empty">
            <strong>Expected eclipse.media-asset.v1</strong>
            <span>Metadata only ? rights approval required</span>
          </div>
        ) : (
          <>
            <div className="media-asset-import__heading">
              <div><span>VALIDATED</span><h3>{sidecar.asset.fileName}</h3></div>
              <b>{sidecar.asset.aspectRatio} ? {sidecar.asset.mimeType}</b>
            </div>
            <dl>
              <div><dt>Provider</dt><dd>{sidecar.asset.provider}</dd></div>
              <div><dt>Model</dt><dd>{sidecar.asset.model}</dd></div>
              <div><dt>Style</dt><dd>{sidecar.asset.style}</dd></div>
            </dl>
            <p className="media-asset-import__prompt">{sidecar.asset.prompt}</p>
            <div className="media-asset-import__match">
              <div>
                <strong>1. Выберите локальное изображение</strong>
                <p>Файл не загружается и не отправляется в сеть. Имя и формат должны совпасть с паспортом.</p>
                <label className="media-asset-import__file">
                  <span>{imageFile ? "Выбрать другой файл" : "Выбрать изображение"}</span>
                  <input type="file" accept={sidecar.asset.mimeType} onChange={(event) => importImage(event.target.files?.[0])} />
                </label>
              </div>
              {imagePreviewUrl && <img className="media-asset-import__image" src={imagePreviewUrl} alt={`Локальный файл ${sidecar.asset.fileName}`} />}
            </div>
            <label className="media-asset-import__consent">
              <input type="checkbox" checked={rightsConfirmed} disabled={!imageFile} onChange={(event) => setRightsConfirmed(event.target.checked)} />
              <span>Я проверил права на этот файл и могу использовать его в проекте</span>
            </label>
            <p className="media-asset-import__approval" role="status">
              {!imageFile ? "Следующий шаг: выберите совпадающий локальный файл." : !rightsConfirmed ? "Файл сопоставлен. Подтвердите права перед передачей в проект." : "Файл сопоставлен, права подтверждены. Генерация, монтаж и публикация не запускаются автоматически."}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
