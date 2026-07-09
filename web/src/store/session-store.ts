import { create } from 'zustand';

const LAST_SESSION_KEY = 'aiManagerLastSessionId';

function readLastSessionId(): string | null {
  try {
    return localStorage.getItem(LAST_SESSION_KEY);
  } catch {
    return null;
  }
}

function writeLastSessionId(sessionId: string | null): void {
  try {
    if (sessionId) {
      localStorage.setItem(LAST_SESSION_KEY, sessionId);
    } else {
      localStorage.removeItem(LAST_SESSION_KEY);
    }
  } catch {
    // ignore quota errors
  }
}

interface SessionState {
  sessionId: string | null;
  status: string;
  mode: 'auto' | 'semi-auto' | 'chat-first';
  task: string;
  error: string | null;

  lastSessionId: string | null;

  setSession: (sessionId: string, task: string, mode: 'auto' | 'semi-auto' | 'chat-first') => void;
  setStatus: (status: string) => void;
  setError: (error: string) => void;
  reset: () => void;
  clearLastSession: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  status: '',
  mode: 'auto',
  task: '',
  error: null,

  lastSessionId: readLastSessionId(),

  setSession: (sessionId, task, mode) => {
    writeLastSessionId(sessionId);
    set({ sessionId, task, mode, status: 'decomposing', error: null, lastSessionId: sessionId });
  },
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  reset: () => {
    writeLastSessionId(null);
    set({ sessionId: null, status: '', mode: 'auto', task: '', error: null, lastSessionId: null });
  },
  clearLastSession: () => {
    writeLastSessionId(null);
    set({ lastSessionId: null });
  },
}));
