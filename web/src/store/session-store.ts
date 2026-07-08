import { create } from 'zustand';

interface SessionState {
  sessionId: string | null;
  status: string;
  mode: 'auto' | 'semi-auto';
  task: string;
  error: string | null;

  setSession: (sessionId: string, task: string, mode: 'auto' | 'semi-auto') => void;
  setStatus: (status: string) => void;
  setError: (error: string) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  status: '',
  mode: 'auto',
  task: '',
  error: null,

  setSession: (sessionId, task, mode) => set({ sessionId, task, mode, status: 'decomposing', error: null }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  reset: () => set({ sessionId: null, status: '', mode: 'auto', task: '', error: null }),
}));
