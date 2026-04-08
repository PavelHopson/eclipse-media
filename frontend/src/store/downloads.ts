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

export interface DownloadItem {
  id: string;            // локальный uuid
  url: string;
  info: VideoInfo | null;
  status: DownloadStatus;
  format: 'video' | 'audio';
  formatId: string | null;
  audioFormat: AudioFormat;
  audioQuality: AudioQuality;
  jobId: string | null;
  progress: number;
  speed: string;
  eta: string;
  filename: string | null;
  error: string | null;
  createdAt: number;
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
  proxy: string;
  setProxy: (proxy: string) => void;
  addItem: (url: string) => string;
  removeItem: (id: string) => void;
  setInfo: (id: string, info: VideoInfo) => void;
  setStatus: (id: string, status: DownloadStatus, error?: string) => void;
  setFormat: (id: string, format: 'video' | 'audio') => void;
  setFormatId: (id: string, formatId: string | null) => void;
  setAudioFormat: (id: string, audioFormat: AudioFormat) => void;
  setAudioQuality: (id: string, audioQuality: AudioQuality) => void;
  setJobId: (id: string, jobId: string) => void;
  setProgress: (id: string, percent: number, speed: string, eta: string) => void;
  setDone: (id: string, filename: string) => void;
  addToHistory: (item: DownloadItem, filename: string) => void;
  clearHistory: () => void;
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const useDownloads = create<DownloadsState>()(
  persist(
    (set, get) => ({
      items: [],
      history: [],
      proxy: '',
      setProxy: (proxy) => set({ proxy }),

      addItem: (url) => {
        const id = makeId();
        set((s) => ({
          items: [
            ...s.items,
            {
              id,
              url,
              info: null,
              status: 'idle',
              format: 'video',
              formatId: null,
              audioFormat: 'mp3',
              audioQuality: 'best',
              jobId: null,
              progress: 0,
              speed: '',
              eta: '',
              filename: null,
              error: null,
              createdAt: Date.now(),
            },
          ],
        }));
        return id;
      },

      removeItem: (id) =>
        set((s) => ({ items: s.items.filter((i) => i.id !== id) })),

      setInfo: (id, info) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id ? { ...i, info, status: 'ready' } : i,
          ),
        })),

      setStatus: (id, status, error) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id ? { ...i, status, error: error ?? i.error } : i,
          ),
        })),

      setFormat: (id, format) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id ? { ...i, format, formatId: null } : i,
          ),
        })),

      setFormatId: (id, formatId) =>
        set((s) => ({
          items: s.items.map((i) => (i.id === id ? { ...i, formatId } : i)),
        })),

      setAudioFormat: (id, audioFormat) =>
        set((s) => ({
          items: s.items.map((i) => (i.id === id ? { ...i, audioFormat } : i)),
        })),

      setAudioQuality: (id, audioQuality) =>
        set((s) => ({
          items: s.items.map((i) => (i.id === id ? { ...i, audioQuality } : i)),
        })),

      setJobId: (id, jobId) =>
        set((s) => ({
          items: s.items.map((i) => (i.id === id ? { ...i, jobId } : i)),
        })),

      setProgress: (id, progress, speed, eta) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id ? { ...i, progress, speed, eta } : i,
          ),
        })),

      setDone: (id, filename) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id
              ? { ...i, status: 'done', progress: 100, filename }
              : i,
          ),
        })),

      addToHistory: (item, filename) => {
        const entry: HistoryEntry = {
          id: makeId(),
          title: item.info?.title ?? item.url,
          url: item.url,
          filename,
          format: item.format,
          downloadedAt: Date.now(),
        };
        set((s) => ({
          history: [entry, ...s.history].slice(0, 50), // макс 50 записей
        }));
        void get;
      },

      clearHistory: () => set({ history: [] }),
    }),
    {
      name: 'eclipse-media-store',
      partialize: (s) => ({ history: s.history, proxy: s.proxy }),
    },
  ),
);
