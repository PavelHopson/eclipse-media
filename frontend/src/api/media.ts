import { getDesktopRuntime } from './desktopRuntime';

const BROWSER_BASE = '/api';

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
  phase?: 'preparing' | 'downloading' | 'processing' | 'finalizing';
  speed: string;
  eta: string;
  fragment_current?: number | null;
  fragment_total?: number | null;
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
  const runtime = await getDesktopRuntime();
  const headers = new Headers(options?.headers);
  if (options?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (runtime) headers.set('X-Eclipse-Media-Session', runtime.sessionToken);

  const res = await fetch(`${runtime?.baseUrl ?? BROWSER_BASE}${path}`, { ...options, headers });

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
  audio_format?: string;
  audio_quality?: string;
  proxy?: string;
  rights_confirmed: boolean;
  preset?: 'standard' | 'archive';
  subtitle_mode?: 'none' | 'manual' | 'auto';
  subtitle_lang?: string;
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
  const controller = new AbortController();

  void (async () => {
    try {
      const runtime = await getDesktopRuntime();
      const headers = new Headers();
      if (runtime) headers.set('X-Eclipse-Media-Session', runtime.sessionToken);
      const response = await fetch(`${runtime?.baseUrl ?? BROWSER_BASE}/progress/${jobId}`, {
        headers,
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error('Progress stream unavailable');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let terminal = false;

      while (!terminal) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const data = frame.split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n');
          if (!data) continue;
          try {
            const parsed = JSON.parse(data) as SSEEvent;
            onEvent(parsed);
            terminal = parsed.type === 'done' || parsed.type === 'error';
          } catch {
            // Ignore malformed or partial frames without terminating a healthy stream.
          }
        }
        if (done) break;
      }
    } catch {
      if (!controller.signal.aborted) {
        onEvent({ type: 'error', message: 'Потеряно соединение с сервером' });
      }
    }
  })();

  return () => controller.abort();
}

export function getFileUrl(jobId: string): string {
  return `${BROWSER_BASE}/file/${jobId}`;
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

export interface LocalEditCapability {
  enabled: boolean;
  ready: boolean;
  mode: 'desktop-local' | 'preview-only';
  profile: 'mp4-h264-aac-720p-v1';
  maxSourceBytes: number;
  maxSourceMs: number;
  maxClipMs: number;
  reason: string | null;
}

export interface LocalEditSourceOption {
  jobId: string;
  filename: string;
}

export interface LocalEditSource extends LocalEditSourceOption {
  assetId: string;
  sha256: string;
  sizeBytes: number;
  durationMs: number;
  hasAudio: boolean;
}

export type LocalEditRunState =
  | 'approved'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface LocalEditRun {
  runId: string;
  state: LocalEditRunState;
  phase: 'waiting' | 'verifying' | 'encoding' | 'validating' | 'complete' | 'failed' | 'cancelled';
  createdAt: number;
  planDigest: string;
  source: LocalEditSource;
  errorCode?: string;
  result?: {
    jobId: string;
    filename: string;
    sha256: string;
    sizeBytes: number;
    durationMs: number;
  };
}

export async function getLocalEditCapability(): Promise<LocalEditCapability> {
  const res = await apiFetch<{ ok: boolean; data: LocalEditCapability }>('/local-edit/capability');
  return res.data;
}

export async function listLocalEditSources(): Promise<LocalEditSourceOption[]> {
  const res = await apiFetch<{ ok: boolean; data: LocalEditSourceOption[] }>('/local-edit/sources');
  return res.data;
}

export async function registerLocalEditSource(jobId: string): Promise<LocalEditSource> {
  const res = await apiFetch<{ ok: boolean; data: LocalEditSource }>('/local-edit/source', {
    method: 'POST',
    body: JSON.stringify({ job_id: jobId }),
  });
  return res.data;
}

export async function approveLocalEdit(planJson: string, rightsConfirmed: boolean): Promise<{
  runId: string;
  approvalToken: string;
  expiresInSeconds: number;
  planDigest: string;
}> {
  const res = await apiFetch<{
    ok: boolean;
    data: {
      runId: string;
      approvalToken: string;
      expiresInSeconds: number;
      planDigest: string;
    };
  }>('/local-edit/approve', {
    method: 'POST',
    body: JSON.stringify({ plan_json: planJson, rights_confirmed: rightsConfirmed }),
  });
  return res.data;
}

export async function startLocalEdit(
  runId: string,
  approvalToken: string,
  planJson: string,
): Promise<LocalEditRun> {
  const res = await apiFetch<{ ok: boolean; data: LocalEditRun }>('/local-edit/start', {
    method: 'POST',
    body: JSON.stringify({
      run_id: runId,
      approval_token: approvalToken,
      plan_json: planJson,
    }),
  });
  return res.data;
}

export async function getLocalEditRun(runId: string): Promise<LocalEditRun> {
  const res = await apiFetch<{ ok: boolean; data: LocalEditRun }>(`/local-edit/run/${encodeURIComponent(runId)}`);
  return res.data;
}

export async function cancelLocalEdit(runId: string): Promise<LocalEditRun> {
  const res = await apiFetch<{ ok: boolean; data: LocalEditRun }>(
    `/local-edit/run/${encodeURIComponent(runId)}`,
    { method: 'DELETE' },
  );
  return res.data;
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

export async function fetchTranscript(url: string, lang = 'auto', rightsConfirmed = false): Promise<TranscriptResult> {
  const res = await apiFetch<{ ok: boolean; data: TranscriptResult }>('/transcript', {
    method: 'POST',
    body: JSON.stringify({ url, lang, rights_confirmed: rightsConfirmed }),
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
