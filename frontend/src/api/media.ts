const BASE = '/api';

export interface VideoFormat {
  id: string;
  label: string;
  height: number;
}

export interface VideoInfo {
  title: string;
  thumbnail: string;
  duration: number | null;
  uploader: string;
  webpage_url: string;
  formats: VideoFormat[];
}

export interface ProgressEvent {
  type: 'progress';
  percent: number;
  speed: string;
  eta: string;
}

export interface DoneEvent {
  type: 'done';
  filename: string;
}

export interface ErrorEvent {
  type: 'error';
  message: string;
}

export type SSEEvent = ProgressEvent | DoneEvent | ErrorEvent;

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const data = await res.json().catch(() => ({ detail: res.statusText }));

  if (!res.ok) {
    const message = typeof data.detail === 'string'
      ? data.detail
      : data.detail?.[0]?.msg ?? 'Ошибка сервера';
    throw new Error(message);
  }

  return data;
}

export async function fetchInfo(url: string, proxy?: string): Promise<VideoInfo> {
  const res = await apiFetch<{ ok: boolean; data: VideoInfo }>('/info', {
    method: 'POST',
    body: JSON.stringify({ url, proxy: proxy || undefined }),
  });
  return res.data;
}

export async function startDownload(params: {
  url: string;
  format: 'video' | 'audio';
  format_id?: string;
  title: string;
  audio_format?: string;
  audio_quality?: string;
  proxy?: string;
}): Promise<string> {
  const res = await apiFetch<{ ok: boolean; data: { job_id: string } }>('/download', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return res.data.job_id;
}

export function subscribeProgress(
  jobId: string,
  onEvent: (e: SSEEvent) => void,
): () => void {
  const es = new EventSource(`${BASE}/progress/${jobId}`);

  es.onmessage = (e) => {
    try {
      const parsed = JSON.parse(e.data) as SSEEvent;
      onEvent(parsed);
      if (parsed.type === 'done' || parsed.type === 'error') {
        es.close();
      }
    } catch {
      // ignore malformed frames
    }
  };

  es.onerror = () => {
    onEvent({ type: 'error', message: 'Потеряно соединение с сервером' });
    es.close();
  };

  return () => es.close();
}

export function getFileUrl(jobId: string): string {
  return `${BASE}/file/${jobId}`;
}

export async function testProxy(proxy: string): Promise<{ ok: boolean; message: string }> {
  return apiFetch('/proxy-test', {
    method: 'POST',
    body: JSON.stringify({ proxy }),
  });
}

export async function deleteJob(jobId: string): Promise<void> {
  await apiFetch(`/job/${jobId}`, { method: 'DELETE' });
}

export interface TranscriptSegment {
  start: string;
  end: string;
  text: string;
}

export interface TranscriptResult {
  title: string;
  uploader: string;
  duration: number | null;
  language: string;
  auto_generated: boolean;
  segments_count: number;
  text: string;
  segments: TranscriptSegment[];
}

export async function fetchTranscript(url: string, lang = 'auto'): Promise<TranscriptResult> {
  const res = await apiFetch<{ ok: boolean; data: TranscriptResult }>('/transcript', {
    method: 'POST',
    body: JSON.stringify({ url, lang }),
  });
  return res.data;
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
