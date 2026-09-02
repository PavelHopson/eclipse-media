import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MediaLibraryItem } from '../services/mediaLibraryContract';

interface MediaLibraryState {
  items: MediaLibraryItem[];
  addItem: (item: MediaLibraryItem) => void;
  replaceItem: (item: MediaLibraryItem) => void;
  removeItem: (id: string) => void;
}

export const useMediaLibrary = create<MediaLibraryState>()(
  persist(
    (set) => ({
      items: [],
      addItem: (item) => set((state) => ({
        items: [item, ...state.items.filter((current) => current.file.sha256 !== item.file.sha256)].slice(0, 200),
      })),
      replaceItem: (item) => set((state) => ({
        items: state.items.map((current) => current.id === item.id ? item : current),
      })),
      removeItem: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
    }),
    { name: 'eclipse-media-library-v1' },
  ),
);
