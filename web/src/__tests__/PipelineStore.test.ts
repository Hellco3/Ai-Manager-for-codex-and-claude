import { describe, it, expect } from 'vitest';
import { usePipelineStore } from '../store/pipeline-store';

describe('PipelineStore', () => {
  it('initializes with default stages', () => {
    const state = usePipelineStore.getState();
    expect(state.stages.decompose.status).toBe('pending');
    expect(state.stages.review.status).toBe('pending');
    expect(state.stages.execute.status).toBe('pending');
    expect(state.stages.aggregate.status).toBe('pending');
  });

  it('applies session:created event', () => {
    usePipelineStore.getState().applySSEEvent({
      type: 'session:created',
      sessionId: 'test-123',
    });
    expect(usePipelineStore.getState().currentStage).toBe('decompose');
  });

  it('applies stage:started and stage:completed events', () => {
    const store = usePipelineStore.getState();
    store.applySSEEvent({ type: 'stage:started', stage: 'decompose', timestamp: 1000 });
    expect(usePipelineStore.getState().stages.decompose.status).toBe('running');

    store.applySSEEvent({ type: 'stage:completed', stage: 'decompose', timestamp: 2000 });
    expect(usePipelineStore.getState().stages.decompose.status).toBe('completed');
  });

  it('applies subtask lifecycle events', () => {
    const store = usePipelineStore.getState();
    store.applySSEEvent({ type: 'subtask:started', subtaskId: 't1', kind: 'code', description: 'test', timestamp: 1000 });
    expect(usePipelineStore.getState().subtasks.t1.status).toBe('running');

    store.applySSEEvent({ type: 'subtask:progress', subtaskId: 't1', chunk: 'hello' });
    expect(usePipelineStore.getState().subtasks.t1.progressChunks).toContain('hello');

    store.applySSEEvent({ type: 'subtask:completed', subtaskId: 't1', result: 'done', durationMs: 500 });
    expect(usePipelineStore.getState().subtasks.t1.status).toBe('completed');
    expect(usePipelineStore.getState().subtasks.t1.result).toBe('done');
  });

  it('preserves the executor kind from a live subtask event', () => {
    usePipelineStore.getState().applySSEEvent({
      type: 'subtask:started',
      subtaskId: 'research-1',
      kind: 'research',
      description: 'research task',
      timestamp: 1000,
    });

    expect(usePipelineStore.getState().subtasks['research-1'].subtask.kind).toBe('research');
    expect(usePipelineStore.getState().statusMessage).toContain('research task');
  });

  it('keeps visible processing feedback during execute and aggregate stages', () => {
    const store = usePipelineStore.getState();
    store.applySSEEvent({ type: 'stage:started', stage: 'execute', timestamp: 2000 });
    expect(usePipelineStore.getState().statusMessage).toBe('正在执行子任务...');
    expect(usePipelineStore.getState().statusStartedAt).toBeTruthy();

    store.applySSEEvent({ type: 'stage:started', stage: 'aggregate', timestamp: 3000 });
    expect(usePipelineStore.getState().statusMessage).toBe('正在汇总结果...');
    expect(usePipelineStore.getState().statusProgress).toBe(80);
  });

  it('resets correctly', () => {
    usePipelineStore.getState().reset();
    expect(usePipelineStore.getState().decomposition).toBeNull();
    expect(Object.keys(usePipelineStore.getState().subtasks)).toHaveLength(0);
  });
});
