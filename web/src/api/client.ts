import type { SSEEvent, SessionState, Subtask } from '@ai_manager/shared';
import type { FileAttachment } from './upload.js';

const BASE_URL = '/api';

async function parseError(res: Response): Promise<Error> {
  const fallback = `HTTP ${res.status}`;

  try {
    const body = await res.json();
    const message = typeof body?.error === 'string' ? body.error : fallback;
    const details = typeof body?.details === 'string'
      ? `: ${body.details}`
      : Array.isArray(body?.details)
        ? `: ${body.details.join(', ')}`
        : '';
    return new Error(`${message}${details}`);
  } catch {
    return new Error(fallback);
  }
}

export async function postTask(
  task: string,
  mode: 'auto' | 'semi-auto' | 'chat-first',
  workspaceDir?: string,
  deferInitialMessage = false,
): Promise<{ sessionId: string; status: string; workspaceDir?: string | null }> {
  const res = await fetch(`${BASE_URL}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, mode, workspaceDir, deferInitialMessage }),
  });
  if (!res.ok) {
    throw await parseError(res);
  }
  return res.json();
}

export async function getTask(sessionId: string): Promise<SessionState> {
  const res = await fetch(`${BASE_URL}/tasks/${sessionId}`);
  if (!res.ok) {
    throw await parseError(res);
  }
  return res.json();
}

export async function approveDecomposition(sessionId: string, subtasks?: Subtask[]): Promise<void> {
  const res = await fetch(`${BASE_URL}/tasks/${sessionId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subtasks }),
  });
  if (!res.ok) {
    throw await parseError(res);
  }
}

export async function cancelTask(sessionId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/tasks/${sessionId}/cancel`, { method: 'POST' });
  if (!res.ok) {
    throw await parseError(res);
  }
}

export function createSSEConnection(
  sessionId: string,
  onEvent: (event: SSEEvent) => void,
  onError?: (error: Event) => void,
): EventSource {
  const url = `${BASE_URL}/sessions/${sessionId}/stream`;
  const es = new EventSource(url);

  es.onmessage = (msg) => {
    try {
      const event = JSON.parse(msg.data);
      onEvent(event);
    } catch {
      // Ignore parse errors for heartbeat events
    }
  };

  if (onError) {
    es.onerror = onError;
  }

  return es;
}

export async function sendMessage(
  sessionId: string,
  message: string,
  attachmentIds?: string[],
): Promise<void> {
  const res = await fetch(`${BASE_URL}/sessions/${sessionId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, attachmentIds }),
  });
  if (!res.ok) throw await parseError(res);
}

export async function reconstructSession(sessionId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/sessions/${sessionId}/reconstruct`, {
    method: 'POST',
  });
  if (!res.ok) throw await parseError(res);
}

export async function confirmTask(
  sessionId: string,
  task?: string,
  workspaceDir?: string,
  message?: string,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/sessions/${sessionId}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, workspaceDir, message }),
  });
  if (!res.ok) throw await parseError(res);
}

export interface SessionSummary {
  sessionId: string;
  status: string;
  mode: string;
  task: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  workspaceDir: string | null;
}

export async function listSessions(): Promise<SessionSummary[]> {
  const res = await fetch(`${BASE_URL}/sessions`);
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function updateWorkspace(
  sessionId: string,
  workspaceDir: string,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/sessions/${sessionId}/workspace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceDir }),
  });
  if (!res.ok) throw await parseError(res);
}
