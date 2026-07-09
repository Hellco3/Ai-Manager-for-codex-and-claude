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

  it('upserts costStats by model (not duplicate push)', async () => {
    const { sessionStore } = await import('../store/session-store.js');
    const session = sessionStore.create('cost test', 'auto');

    // First entry for model A
    sessionStore.upsertCostStats(session.sessionId, {
      model: 'claude-sonnet-5',
      inputTokens: 1000,
      outputTokens: 500,
      costUSD: 0.02,
      durationMs: 2000,
    });
    expect(session.costStats).toHaveLength(1);
    expect(session.costStats[0].inputTokens).toBe(1000);

    // Second entry for same model — should update, not push
    sessionStore.upsertCostStats(session.sessionId, {
      model: 'claude-sonnet-5',
      inputTokens: 2500,
      outputTokens: 1200,
      costUSD: 0.05,
      durationMs: 5000,
    });
    expect(session.costStats).toHaveLength(1);
    expect(session.costStats[0].inputTokens).toBe(2500);

    // Different model — should push
    sessionStore.upsertCostStats(session.sessionId, {
      model: 'claude-opus-4-8',
      inputTokens: 500,
      outputTokens: 200,
      costUSD: 0.01,
      durationMs: 800,
    });
    expect(session.costStats).toHaveLength(2);

    // Verify persistence round-trip: GET /api/tasks/:id must return costStats
    const fetched = sessionStore.get(session.sessionId)!;
    expect(fetched.costStats).toHaveLength(2);
    expect(fetched.costStats.find(s => s.model === 'claude-sonnet-5')!.inputTokens).toBe(2500);
    expect(fetched.costStats.find(s => s.model === 'claude-opus-4-8')!.costUSD).toBe(0.01);
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
