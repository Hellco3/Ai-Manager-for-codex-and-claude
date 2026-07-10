import fs from 'fs/promises';
import path from 'path';
import { v4 as uuid } from 'uuid';
import {
  type SessionState,
  type SessionStatus,
  type SubtaskState,
  type SubtaskStatus,
  type Subtask,
  type CostStats,
  type FileAttachment,
  type AggregatedResult,
} from '@ai_manager/shared';
import { logger } from '../utils/logger.js';
import { attachmentStore } from './attachment-store.js';

interface StoredSession {
  sessionId: string;
  status: SessionStatus;
  task: string;
  mode: 'auto' | 'semi-auto';
  decomposition: any;
  subtaskStates: Record<string, SubtaskState>;
  messages?: Array<{ role: string; content: string; timestamp: number; attachmentIds?: string[]; messageType?: 'text' | 'completion' }>;
  aggregatedResult?: AggregatedResult;
  costStats: CostStats[];
  createdAt: number;
  updatedAt: number;
}

export class SessionStore {
  private sessions = new Map<string, SessionState>();
  private persistPath: string | null;
  private dirty = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushSoonTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(persistPath?: string) {
    this.persistPath = persistPath ?? null;
    if (this.persistPath) {
      this.loadFromDisk().catch(() => {});
      // Auto-flush every 30s
      this.flushTimer = setInterval(() => this.flushToDisk(), 30000);
    }
    // Cleanup old sessions every 5 minutes
    setInterval(() => this.cleanupExpired(), 300000);
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const data = await fs.readFile(this.persistPath!, 'utf-8');
      const records: StoredSession[] = JSON.parse(data);
      for (const rec of records) {
        this.sessions.set(rec.sessionId, rec as SessionState);
      }
      logger.info({ count: records.length }, 'Sessions loaded from disk');
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        logger.error({ error: err }, 'Failed to load sessions from disk');
      }
    }
  }

  private async flushToDisk(): Promise<void> {
    if (!this.persistPath || !this.dirty) return;
    try {
      // Ensure the directory exists before writing
      const dir = path.dirname(this.persistPath);
      await fs.mkdir(dir, { recursive: true });
      const records = Array.from(this.sessions.values()).map((s) => ({
        ...s,
        // Exclude large progress chunks from persistence
        subtaskStates: Object.fromEntries(
          Object.entries(s.subtaskStates ?? {}).map(([k, v]) => [
            k,
            { ...v, progressChunks: v.progressChunks.slice(-50) }, // keep last 50 chunks only
          ]),
        ),
      }));
      await fs.writeFile(this.persistPath, JSON.stringify(records), 'utf-8');
      this.dirty = false;
    } catch (err) {
      logger.error({ error: err }, 'Failed to flush sessions to disk');
    }
  }

  private markDirty(): void {
    this.dirty = true;
    if (!this.persistPath) return;
    if (this.flushSoonTimer) clearTimeout(this.flushSoonTimer);
    this.flushSoonTimer = setTimeout(() => {
      this.flushSoonTimer = null;
      this.flushToDisk().catch(() => {});
    }, 1000);
  }

  private async cleanupExpired(): Promise<void> {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    for (const [id, session] of this.sessions) {
      if (
        (session.status === 'completed' || session.status === 'failed' || session.status === 'cancelled') &&
        now - session.updatedAt > maxAge
      ) {
        // Clean up attachments first
        await attachmentStore.cleanupBySession(id);
        this.sessions.delete(id);
        this.markDirty();
      }
    }
  }

  create(task: string, mode: 'auto' | 'semi-auto' | 'chat-first', workspaceDir?: string): SessionState {
    const sessionId = uuid();
    const now = Date.now();
    const initialStatus = mode === 'chat-first' ? 'chatting' as const : 'decomposing' as const;
    const session: SessionState = {
      sessionId,
      status: initialStatus,
      task,
      mode,
      subtaskStates: {},
      costStats: [],
      createdAt: now,
      updatedAt: now,
    };
    if (workspaceDir) {
      (session as any).workspaceDir = workspaceDir;
    }
    this.sessions.set(sessionId, session);
    this.markDirty();
    logger.info({ sessionId, mode, workspaceDir }, 'Session created');
    return session;
  }

  get(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  updateStatus(sessionId: string, status: SessionStatus): SessionState | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    session.status = status;
    session.updatedAt = Date.now();
    this.markDirty();
    return session;
  }

  /**
   * Atomically transition session status from one state to another.
   * Returns true if the transition succeeded, false if the current status
   * didn't match the expected value (concurrent request already won the race).
   */
  tryTransitionStatus(
    sessionId: string,
    expected: SessionStatus | SessionStatus[],
    next: SessionStatus,
  ): SessionState | undefined {
    const expectedSet = new Set(Array.isArray(expected) ? expected : [expected]);
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    if (!expectedSet.has(session.status)) return undefined;
    session.status = next;
    session.updatedAt = Date.now();
    this.markDirty();
    logger.info({ sessionId, prevStatus: [...expectedSet], newStatus: next }, 'Status transition (atomic)');
    return session;
  }

  setDecomposition(sessionId: string, decomposition: any): SessionState | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    session.decomposition = decomposition;
    // Reset subtask states to clear old run data
    session.subtaskStates = {};
    for (const st of decomposition.subtasks) {
      session.subtaskStates[st.id] = {
        subtask: st,
        status: 'pending',
        retryCount: 0,
        progressChunks: [],
      };
    }
    session.updatedAt = Date.now();
    this.markDirty();
    return session;
  }

  updateSubtaskStatus(sessionId: string, subtaskId: string, status: SubtaskStatus): SessionState | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    const st = session.subtaskStates![subtaskId];
    if (!st) return undefined;
    st.status = status;
    const now = Date.now();
    if (status === 'running') st.startedAt = now;
    if (status === 'completed' || status === 'failed') st.completedAt = now;
    session.updatedAt = now;
    this.markDirty();
    return session;
  }

  appendSubtaskProgress(sessionId: string, subtaskId: string, chunk: string): SessionState | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    const st = session.subtaskStates![subtaskId];
    if (!st) return undefined;
    st.progressChunks.push(chunk);
    session.updatedAt = Date.now();
    return session;
  }

  setSubtaskResult(sessionId: string, subtaskId: string, result: string): SessionState | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    const st = session.subtaskStates![subtaskId];
    if (!st) return undefined;
    st.result = result;
    st.status = 'completed';
    st.completedAt = Date.now();
    session.updatedAt = Date.now();
    this.markDirty();
    return session;
  }

  setSubtaskError(sessionId: string, subtaskId: string, error: string): SessionState | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    const st = session.subtaskStates![subtaskId];
    if (!st) return undefined;
    st.error = error;
    st.status = 'failed';
    st.completedAt = Date.now();
    session.updatedAt = Date.now();
    this.markDirty();
    return session;
  }

  incrementRetry(sessionId: string, subtaskId: string): SessionState | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    const st = session.subtaskStates![subtaskId];
    if (!st) return undefined;
    st.retryCount++;
    session.updatedAt = Date.now();
    this.markDirty();
    return session;
  }

  /**
   * Add or update cost stats, keyed by model name.
   * Unlike addCostStats (which blindly pushes), this prevents duplicate/accumulated
   * entries for the same model when cost updates arrive from multiple stages.
   */
  upsertCostStats(sessionId: string, stats: CostStats): SessionState | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    const idx = session.costStats.findIndex(s => s.model === stats.model);
    if (idx >= 0) {
      session.costStats[idx] = stats;
    } else {
      session.costStats.push(stats);
    }
    session.updatedAt = Date.now();
    this.markDirty();
    return session;
  }

  addCostStats(sessionId: string, stats: CostStats): SessionState | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    session.costStats.push(stats);
    session.updatedAt = Date.now();
    this.markDirty();
    return session;
  }

  addMessage(sessionId: string, role: string, content: string, attachmentIds?: string[], messageType?: 'text' | 'completion'): SessionState | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    if (!session.messages) session.messages = [];
    const message: any = { role, content, timestamp: Date.now() };
    if (attachmentIds && attachmentIds.length > 0) {
      message.attachmentIds = attachmentIds;
      attachmentStore.bindToMessage(attachmentIds, `${sessionId}:${session.messages.length}`);
    }
    if (messageType) message.messageType = messageType;
    session.messages.push(message);
    session.updatedAt = Date.now();
    this.markDirty();
    return session;
  }

  setAggregatedResult(sessionId: string, result: AggregatedResult): SessionState | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    (session as any).aggregatedResult = result;
    session.updatedAt = Date.now();
    this.markDirty();
    return session;
  }

  setWorkspaceDir(sessionId: string, workspaceDir: string): SessionState | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    (session as any).workspaceDir = workspaceDir;
    session.updatedAt = Date.now();
    this.markDirty();
    return session;
  }

  getAllSessions(): SessionState[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  delete(sessionId: string): boolean {
    const deleted = this.sessions.delete(sessionId);
    if (deleted) this.markDirty();
    return deleted;
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.flushSoonTimer) {
      clearTimeout(this.flushSoonTimer);
      this.flushSoonTimer = null;
    }
    await this.flushToDisk();
  }
}

// Singleton with optional file persistence
const persistPath = process.env.SESSION_STORE_PATH
  ? path.resolve(process.env.SESSION_STORE_PATH)
  : path.resolve('data', 'sessions.json');

export const sessionStore = new SessionStore(persistPath);
