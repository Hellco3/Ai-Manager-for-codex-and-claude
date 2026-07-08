import { describe, it, expect } from 'vitest';

describe('SessionStore', () => {
  it('creates sessions', async () => {
    const { sessionStore } = await import('../store/session-store.js');
    const session = sessionStore.create('test task', 'auto');
    expect(session.sessionId).toBeDefined();
    expect(session.status).toBe('decomposing');
    expect(session.task).toBe('test task');
    expect(session.mode).toBe('auto');
  });

  it('updates status', async () => {
    const { sessionStore } = await import('../store/session-store.js');
    const session = sessionStore.create('test', 'auto');
    sessionStore.updateStatus(session.sessionId, 'executing');
    const updated = sessionStore.get(session.sessionId)!;
    expect(updated.status).toBe('executing');
  });
});

describe('TaskQueue', () => {
  it('processes tasks', async () => {
    const { taskQueue } = await import('../queue/task-queue.js');
    let done = false;
    taskQueue.enqueue('j1', {}, async () => { done = true; });
    await new Promise(r => setTimeout(r, 300));
    expect(done).toBe(true);
  });
});

describe('Config', () => {
  it('has default values', async () => {
    const { config } = await import('../config.js');
    expect(config.PORT).toBe(3001);
    expect(typeof config.ANTHROPIC_BASE_URL).toBe('string');
  });
});

describe('Retry utils', () => {
  it('selectExecutor routes correctly', async () => {
    const { selectExecutor } = await import('../utils/retry.js');
    expect(selectExecutor({ kind: 'code' } as any)).toBe('codex');
    expect(selectExecutor({ kind: 'analysis' } as any)).toBe('claude');
    expect(selectExecutor({ kind: 'design' } as any)).toBe('claude');
  });

  it('isRetryableError works', async () => {
    const { isRetryableError } = await import('../utils/retry.js');
    expect(isRetryableError(new Error('rate limit'))).toBe(true);
    expect(isRetryableError(new Error('syntax error'))).toBe(false);
  });
});

describe('CostTracker', () => {
  it('tracks and aggregates', async () => {
    const { CostTracker } = await import('../utils/cost-tracker.js');
    const t = new CostTracker();
    t.addEntry('claude-sonnet-5', 1000, 500, 2000);
    t.addEntry('claude-opus-4-8', 500, 200, 800);
    expect(t.getAll()).toHaveLength(2);
    expect(t.getTotalCost()).toBeGreaterThan(0);
  });
});
