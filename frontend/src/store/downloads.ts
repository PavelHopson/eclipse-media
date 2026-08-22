import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { VideoInfo } from '../api/media';

export type DownloadStatus =
  | 'idle'
  | 'fetching'
  | 'ready'
  | 'downloading'
  | 'done'
  | 'error';

export type AudioFormat = 'mp3' | 'flac' | 'opus' | 'm4a' | 'wav';
export type AudioQuality = 'best' | '320' | '192' | '128';
export type DownloadPreset = 'standard' | 'archive';
export type SubtitleMode = 'none' | 'manual' | 'auto';
export type DownloadPhase = 'preparing' | 'downloading' | 'processing' | 'finalizing';
export type MediaIntent = 'watch' | 'video' | 'audio' | 'transcript';
export type MediaRequestStatus = 'planned' | 'in_progress' | 'done';

export interface MediaRequest {
  id: string;
  url: string;
  intent: MediaIntent;
  project: string;
  title: string;
  note: string;
  rightsConfirmed: boolean;
  status: MediaRequestStatus;
  createdAt: number;
}

export interface DownloadItem {
  id: string;
  url: string;
  info: VideoInfo | null;
  status: DownloadStatus;
  format: 'video' | 'audio';
  formatId: string | null;
  audioFormat: AudioFormat;
  audioQuality: AudioQuality;
  jobId: string | null;
  progress: number;
  phase: DownloadPhase;
  speed: string;
  eta: string;
  fragmentCurrent: number | null;
  fragmentTotal: number | null;
  filename: string | null;
  error: string | null;
  createdAt: number;
  rightsConfirmed: boolean;
  preset: DownloadPreset;
  subtitleMode: SubtitleMode;
  subtitleLang: string;
  requestId: string | null;
}

export interface HistoryEntry {
  id: string;
  title: string;
  url: string;
  filename: string;
  format: 'video' | 'audio';
  downloadedAt: number;
}

interface DownloadsState {
  items: DownloadItem[];
  history: HistoryEntry[];
  requests: MediaRequest[];
  proxy: string;
  setProxy: (proxy: string) => void;
  addItem: (url: string, options?: { format?: 'video' | 'audio'; rightsConfirmed?: boolean; requestId?: string }) => string;
  removeItem: (id: string) => void;
  setInfo: (id: string, info: VideoInfo) => void;
  setStatus: (id: string, status: DownloadStatus, error?: string) => void;
  setFormat: (id: string, format: 'video' | 'audio') => void;
  setFormatId: (id: string, formatId: string | null) => void;
  setAudioFormat: (id: string, audioFormat: AudioFormat) => void;
  setAudioQuality: (id: string, audioQuality: AudioQuality) => void;
  setRightsConfirmed: (id: string, confirmed: boolean) => void;
  setPreset: (id: string, preset: DownloadPreset) => void;
  setSubtitleMode: (id: string, mode: SubtitleMode) => void;
  setSubtitleLang: (id: string, lang: string) => void;
  setJobId: (id: string, jobId: string) => void;
  setProgress: (id: string, percent: number, speed: string, eta: string, phase?: DownloadPhase, fragmentCurrent?: number | null, fragmentTotal?: number | null) => void;
  setDone: (id: string, filename: string) => void;
  addToHistory: (item: DownloadItem, filename: string) => void;
  clearHistory: () => void;
  addRequest: (request: Omit<MediaRequest, 'id' | 'status' | 'createdAt'>) => string;
  setRequestStatus: (id: string, status: MediaRequestStatus) => void;
  removeRequest: (id: string) => void;
  clearCompletedRequests: () => void;
}

function makeId(): string {
  return crypto.randomUUID();
}

export const useDownloads = create<DownloadsState>()(
  persist(
    (set) => ({
      items: [],
      history: [],
      requests: [],
      proxy: '',
      setProxy: (proxy) => set({ proxy }),

      addItem: (url, options) => {
        const id = makeId();
        set((state) => ({
          items: [
            ...state.items,
            {
              id,
              url,
              info: null,
              status: 'idle',
              format: options?.format ?? 'video',
              formatId: null,
              audioFormat: 'mp3',
              audioQuality: 'best',
              jobId: null,
              progress: 0,
              phase: 'preparing',
              speed: '',
              eta: '',
              fragmentCurrent: null,
              fragmentTotal: null,
              filename: null,
              error: null,
              createdAt: Date.now(),
              rightsConfirmed: options?.rightsConfirmed ?? false,
              preset: 'standard',
              subtitleMode: 'none',
              subtitleLang: 'en',
              requestId: options?.requestId ?? null,
            },
          ],
        }));
        return id;
      },

      removeItem: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
      setInfo: (id, info) => set((state) => ({
        items: state.items.map((item) => item.id === id ? { ...item, info, status: 'ready' } : item),
      })),
      setStatus: (id, status, error) => set((state) => ({
        items: state.items.map((item) => item.id === id
          ? { ...item, status, error: error ?? item.error, ...(status === 'downloading' ? { phase: 'preparing' as const, progress: 0 } : {}) }
          : item),
      })),
      setFormat: (id, format) => set((state) => ({
        items: state.items.map((item) => item.id === id ? { ...item, format, formatId: null } : item),
      })),
      setFormatId: (id, formatId) => set((state) => ({
        items: state.items.map((item) => item.id === id ? { ...item, formatId } : item),
      })),
      setAudioFormat: (id, audioFormat) => set((state) => ({
        items: state.items.map((item) => item.id === id ? { ...item, audioFormat } : item),
      })),
      setAudioQuality: (id, audioQuality) => set((state) => ({
        items: state.items.map((item) => item.id === id ? { ...item, audioQuality } : item),
      })),
      setRightsConfirmed: (id, rightsConfirmed) => set((state) => ({
        items: state.items.map((item) => item.id === id ? { ...item, rightsConfirmed } : item),
      })),
      setPreset: (id, preset) => set((state) => ({
        items: state.items.map((item) => item.id === id ? { ...item, preset } : item),
      })),
      setSubtitleMode: (id, subtitleMode) => set((state) => ({
        items: state.items.map((item) => item.id === id ? { ...item, subtitleMode } : item),
      })),
      setSubtitleLang: (id, subtitleLang) => set((state) => ({
        items: state.items.map((item) => item.id === id ? { ...item, subtitleLang } : item),
      })),
      setJobId: (id, jobId) => set((state) => ({
        items: state.items.map((item) => item.id === id ? { ...item, jobId } : item),
      })),
      setProgress: (id, progress, speed, eta, phase, fragmentCurrent, fragmentTotal) => set((state) => ({
        items: state.items.map((item) => item.id === id ? {
          ...item,
          progress,
          speed,
          eta,
          phase: phase ?? (progress > 0 ? 'downloading' : item.phase),
          fragmentCurrent: fragmentCurrent ?? item.fragmentCurrent,
          fragmentTotal: fragmentTotal ?? item.fragmentTotal,
        } : item),
      })),
      setDone: (id, filename) => set((state) => {
        const requestId = state.items.find((item) => item.id === id)?.requestId;
        return {
          items: state.items.map((item) => item.id === id
            ? { ...item, status: 'done', progress: 100, filename }
            : item),
          requests: requestId
            ? state.requests.map((request) => request.id === requestId ? { ...request, status: 'done' } : request)
            : state.requests,
        };
      }),
      addToHistory: (item, filename) => set((state) => ({
        history: [{
          id: makeId(),
          title: item.info?.title ?? item.url,
          url: item.url,
          filename,
          format: item.format,
          downloadedAt: Date.now(),
        }, ...state.history].slice(0, 50),
      })),
      clearHistory: () => set({ history: [] }),

      addRequest: (request) => {
        const id = makeId();
        set((state) => ({
          requests: [{ ...request, id, status: 'planned' as const, createdAt: Date.now() }, ...state.requests].slice(0, 100),
        }));
        return id;
      },
      setRequestStatus: (id, status) => set((state) => ({
        requests: state.requests.map((request) => request.id === id ? { ...request, status } : request),
      })),
      removeRequest: (id) => set((state) => ({ requests: state.requests.filter((request) => request.id !== id) })),
      clearCompletedRequests: () => set((state) => ({
        requests: state.requests.filter((request) => request.status !== 'done'),
      })),
    }),
    {
      name: 'eclipse-media-store',
      partialize: (state) => ({ history: state.history, requests: state.requests, proxy: state.proxy }),
    },
  ),
);
