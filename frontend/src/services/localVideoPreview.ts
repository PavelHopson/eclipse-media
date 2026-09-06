import type { LocalEditSource } from '../api/media';

export function validatePreviewFile(file: Pick<File, 'name' | 'size'>, header?: Uint8Array) {
  if (!/\.mp4$/i.test(file.name) || file.name.length > 512 || /[\p{Cc}\p{Cf}]/u.test(file.name)) throw new Error('Выберите MP4 с обычным именем файла.');
  if (file.size < 12 || file.size > 60 * 1024 * 1024) throw new Error('Для предпросмотра нужен MP4 до 60 МБ.');
  if (header && new TextDecoder().decode(header.slice(4, 8)) !== 'ftyp') throw new Error('Содержимое файла не похоже на MP4.');
}
export async function prepareLocalVideo(file: File): Promise<{ url: string; source: LocalEditSource }> {
  // Bound size before reading even the header; never upload the file or persist its URL.
  validatePreviewFile(file);
  validatePreviewFile(file, new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const url = URL.createObjectURL(file); const video = document.createElement('video'); video.preload = 'metadata';
  try {
    const durationMs = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => { clear(); reject(new Error('Не удалось прочитать длительность MP4.')); }, 8000);
      function clear() { clearTimeout(timer); video.onloadedmetadata = null; video.onerror = null; }
      video.onloadedmetadata = () => { const ms = Math.round(video.duration * 1000); clear();
        if (!Number.isSafeInteger(ms) || ms < 1 || ms > 300000) reject(new Error('Нужен видеоклип длительностью до 5 минут.'));
        else resolve(ms);
      };
      video.onerror = () => { clear(); reject(new Error('Браузер не смог прочитать видео. Попробуйте MP4 H.264.')); };
      video.src = url;
    });
    return { url, source: { jobId: '', assetId: crypto.randomUUID(), filename: file.name, sha256, sizeBytes: file.size, durationMs, hasAudio: false } };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
  finally { video.removeAttribute('src'); video.load(); }
}
