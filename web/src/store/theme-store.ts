import { create } from 'zustand';

interface ThemeStore {
  theme: 'dark' | 'light';
  toggle: () => void;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: (typeof window !== 'undefined' && localStorage.getItem('theme') as 'dark' | 'light') || 'dark',
  toggle: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    set({ theme: next });
  },
}));
