import { create } from 'zustand';
import { PreCacheProgress } from '@/services/tts/PreCacheService';

export interface BookCacheStatus {
  bookKey: string;
  cachedCount: number;
  totalCount: number;
  percentage: number;
  lastUpdated: number;
}

interface PreCacheState {
  // Active pre-cache operations by bookKey
  activePreCaches: Map<string, PreCacheProgress>;

  // Cache status for each book
  bookCacheStatuses: Map<string, BookCacheStatus>;

  // Dialog state
  openDialogBookKey: string | null;

  // Actions
  setPreCacheProgress: (bookKey: string, progress: PreCacheProgress) => void;
  removePreCacheProgress: (bookKey: string) => void;
  getPreCacheProgress: (bookKey: string) => PreCacheProgress | undefined;

  setBookCacheStatus: (bookKey: string, status: BookCacheStatus) => void;
  getBookCacheStatus: (bookKey: string) => BookCacheStatus | undefined;

  setOpenDialog: (bookKey: string | null) => void;
  isDialogOpen: (bookKey: string) => boolean;
}

export const usePreCacheStore = create<PreCacheState>((set, get) => ({
  activePreCaches: new Map(),
  bookCacheStatuses: new Map(),
  openDialogBookKey: null,

  setPreCacheProgress: (bookKey, progress) =>
    set((state) => {
      const newMap = new Map(state.activePreCaches);
      newMap.set(bookKey, progress);
      return { activePreCaches: newMap };
    }),

  removePreCacheProgress: (bookKey) =>
    set((state) => {
      const newMap = new Map(state.activePreCaches);
      newMap.delete(bookKey);
      return { activePreCaches: newMap };
    }),

  getPreCacheProgress: (bookKey) => {
    return get().activePreCaches.get(bookKey);
  },

  setBookCacheStatus: (bookKey, status) =>
    set((state) => {
      const newMap = new Map(state.bookCacheStatuses);
      newMap.set(bookKey, status);
      return { bookCacheStatuses: newMap };
    }),

  getBookCacheStatus: (bookKey) => {
    return get().bookCacheStatuses.get(bookKey);
  },

  setOpenDialog: (bookKey) => set({ openDialogBookKey: bookKey }),

  isDialogOpen: (bookKey) => get().openDialogBookKey === bookKey,
}));
