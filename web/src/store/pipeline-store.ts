import { create } from 'zustand';
import type {
  CostStats,
  SessionState,
  SSEEvent,
  SubtaskState,
  TaskDecomposition,
} from '@ai_manager/shared';

interface StageEntry {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: number;
  completedAt?: number;
}

interface PipelineStore {
  stages: Record<string, StageEntry>;
  subtasks: Record<string, SubtaskState & { kind?: string }>;
  currentStage: string | null;
  decomposition: TaskDecomposition | null;
  costStats: CostStats[];
  totalCost: number;
  totalDurationMs: number;
  isComplete: boolean;
  isError: boolean;
  errorMessage: string | null;

  applySSEEvent: (event: SSEEvent) => void;
  hydrateFromSession: (session: SessionState) => void;
  initStages: () => void;
  reset: () => void;
}

const DEFAULT_STAGES: Record<string, StageEntry> = {
  decompose: { name: 'decompose', status: 'pending' },
  review: { name: 'review', status: 'pending' },
  execute: { name: 'execute', status: 'pending' },
  aggregate: { name: 'aggregate', status: 'pending' },
};

function createDefaultStages(): Record<string, StageEntry> {
  return {
    decompose: { ...DEFAULT_STAGES.decompose },
    review: { ...DEFAULT_STAGES.review },
    execute: { ...DEFAULT_STAGES.execute },
    aggregate: { ...DEFAULT_STAGES.aggregate },
  };
}

function createPendingSubtasks(
  decomposition: TaskDecomposition | null | undefined,
): Record<string, SubtaskState & { kind?: string }> {
  if (!decomposition) {
    return {};
  }

  return Object.fromEntries(
    decomposition.subtasks.map((subtask) => [
      subtask.id,
      {
        subtask,
        status: 'pending' as const,
        retryCount: 0,
        progressChunks: [],
      },
    ]),
  );
}

function mergeSubtasks(
  current: Record<string, SubtaskState & { kind?: string }>,
  decomposition: TaskDecomposition | null | undefined,
): Record<string, SubtaskState & { kind?: string }> {
  if (!decomposition) {
    return current;
  }

  const merged = { ...createPendingSubtasks(decomposition), ...current };

  for (const subtask of decomposition.subtasks) {
    const existing = merged[subtask.id];
    merged[subtask.id] = {
      ...existing,
      subtask,
    };
  }

  return merged;
}

function hydrateStages(session: SessionState): Record<string, StageEntry> {
  const stages = createDefaultStages();

  if (session.status === 'decomposing') {
    stages.decompose.status = 'running';
    return stages;
  }

  if (session.decomposition && (session.status as string) !== 'decomposing') {
    stages.decompose.status = 'completed';
  }

  if (session.mode === 'auto') {
    stages.review.status = 'skipped';
  }

  if (session.status === 'awaiting_review') {
    stages.review.status = 'running';
    return stages;
  }

  if (session.mode === 'semi-auto' && session.decomposition) {
    stages.review.status = 'completed';
  }

  if (session.status === 'executing') {
    stages.execute.status = 'running';
    return stages;
  }

  if (session.status === 'aggregating') {
    stages.execute.status = 'completed';
    stages.aggregate.status = 'running';
    return stages;
  }

  if (session.status === 'completed') {
    stages.execute.status = 'completed';
    stages.aggregate.status = 'completed';
    return stages;
  }

  if (session.status === 'failed' || session.status === 'cancelled' || session.status === 'timed_out') {
    if (Object.keys(session.subtaskStates).length > 0) {
      stages.execute.status = 'failed';
    } else {
      stages.decompose.status = 'failed';
    }
  }

  return stages;
}

function getCurrentStage(session: SessionState): string | null {
  switch (session.status) {
    case 'decomposing':
      return 'decompose';
    case 'awaiting_review':
      return 'review';
    case 'executing':
      return 'execute';
    case 'aggregating':
    case 'completed':
      return 'aggregate';
    case 'failed':
    case 'cancelled':
    case 'timed_out':
      return Object.keys(session.subtaskStates).length > 0 ? 'execute' : 'decompose';
    default:
      return null;
  }
}

export const usePipelineStore = create<PipelineStore>((set, get) => ({
  stages: createDefaultStages(),
  subtasks: {},
  currentStage: null,
  decomposition: null,
  costStats: [],
  totalCost: 0,
  totalDurationMs: 0,
  isComplete: false,
  isError: false,
  errorMessage: null,

  initStages: () => set({
    stages: createDefaultStages(),
    subtasks: {},
    currentStage: null,
    decomposition: null,
    costStats: [],
    totalCost: 0,
    totalDurationMs: 0,
    isComplete: false,
    isError: false,
    errorMessage: null,
  }),

  hydrateFromSession: (session) => {
    const subtasks = Object.keys(session.subtaskStates).length > 0
      ? mergeSubtasks(session.subtaskStates, session.decomposition)
      : createPendingSubtasks(session.decomposition);

    set({
      stages: hydrateStages(session),
      subtasks,
      currentStage: getCurrentStage(session),
      decomposition: session.decomposition ?? null,
      costStats: session.costStats,
      totalCost: session.costStats.reduce((sum, stat) => sum + stat.costUSD, 0),
      totalDurationMs: session.costStats.reduce((sum, stat) => sum + stat.durationMs, 0),
      isComplete: session.status === 'completed',
      isError: session.status === 'failed' || session.status === 'cancelled' || session.status === 'timed_out',
      errorMessage: session.status === 'cancelled'
        ? 'Task cancelled by user'
        : session.status === 'timed_out'
          ? 'Task timed out'
          : null,
    });
  },

  applySSEEvent: (event: SSEEvent) => {
    switch (event.type) {
      case 'session:created':
        set({ currentStage: 'decompose' });
        break;

      case 'stage:started':
        set((s) => ({
          currentStage: event.stage,
          stages: {
            ...s.stages,
            review: event.stage === 'execute' && s.stages.review.status === 'running'
              ? { ...s.stages.review, status: 'completed', completedAt: event.timestamp }
              : event.stage === 'execute' && s.stages.review.status === 'pending'
                ? { ...s.stages.review, status: 'skipped', completedAt: event.timestamp }
                : s.stages.review,
            [event.stage]: { ...s.stages[event.stage], status: 'running', startedAt: event.timestamp },
          },
        }));
        break;

      case 'stage:completed':
        set((s) => ({
          stages: {
            ...s.stages,
            [event.stage]: { ...s.stages[event.stage], status: 'completed', completedAt: event.timestamp },
          },
        }));
        break;

      case 'stage:awaiting_review':
        set((s) => ({
          currentStage: 'review',
          decomposition: event.decomposition,
          subtasks: mergeSubtasks(s.subtasks, event.decomposition),
          stages: {
            ...s.stages,
            review: { ...s.stages.review, status: 'running' },
            decompose: { ...s.stages.decompose, status: 'completed' },
          },
        }));
        break;

      case 'subtask:queued':
        set((s) => ({
          subtasks: {
            ...s.subtasks,
            [event.subtaskId]: {
              subtask: {
                id: event.subtaskId,
                kind: event.kind as any,
                description: event.description,
                dependencies: [],
                priority: 5,
                estimatedComplexity: 'medium',
              },
              status: 'queued',
              retryCount: 0,
              progressChunks: [],
            },
          },
        }));
        break;

      case 'subtask:started':
        set((s) => {
          const existing = s.subtasks[event.subtaskId];
          return {
            subtasks: {
              ...s.subtasks,
              [event.subtaskId]: {
                ...(existing ?? {
                  subtask: {
                    id: event.subtaskId,
                    kind: 'code',
                    description: event.description,
                    dependencies: [],
                    priority: 5,
                    estimatedComplexity: 'medium',
                  },
                  retryCount: 0,
                  progressChunks: [],
                }),
                status: 'running',
                startedAt: event.timestamp,
              },
            },
          };
        });
        break;

      case 'subtask:progress':
        set((s) => {
          const existing = s.subtasks[event.subtaskId];
          if (!existing) {
            return s;
          }

          return {
            subtasks: {
              ...s.subtasks,
              [event.subtaskId]: {
                ...existing,
                progressChunks: [...existing.progressChunks, event.chunk],
              },
            },
          };
        });
        break;

      case 'subtask:completed':
        set((s) => {
          const existing = s.subtasks[event.subtaskId];
          if (!existing) {
            return s;
          }

          return {
            subtasks: {
              ...s.subtasks,
              [event.subtaskId]: {
                ...existing,
                status: 'completed',
                result: event.result,
                completedAt: Date.now(),
              },
            },
          };
        });
        break;

      case 'subtask:failed':
        set((s) => {
          const existing = s.subtasks[event.subtaskId];
          if (!existing) {
            return s;
          }

          return {
            subtasks: {
              ...s.subtasks,
              [event.subtaskId]: {
                ...existing,
                status: 'failed',
                error: event.error,
                completedAt: Date.now(),
              },
            },
          };
        });
        break;

      case 'subtask:timed_out':
        set((s) => {
          const existing = s.subtasks[event.subtaskId];
          if (!existing) {
            return s;
          }

          return {
            subtasks: {
              ...s.subtasks,
              [event.subtaskId]: {
                ...existing,
                status: 'timed_out',
                completedAt: Date.now(),
              },
            },
          };
        });
        break;

      case 'session:complete':
        set({
          isComplete: true,
          isError: false,
          errorMessage: null,
          currentStage: 'aggregate',
          costStats: event.result.costBreakdown,
          totalCost: event.result.totalCost,
          totalDurationMs: event.result.totalDurationMs,
          stages: {
            ...get().stages,
            aggregate: { ...get().stages.aggregate, status: 'completed' },
            execute: { ...get().stages.execute, status: 'completed' },
            decompose: { ...get().stages.decompose, status: 'completed' },
          },
        });
        break;

      case 'session:error':
        set({
          isComplete: false,
          isError: true,
          errorMessage: event.error,
          stages: {
            ...get().stages,
            [get().currentStage ?? 'execute']: { ...get().stages[get().currentStage ?? 'execute'], status: 'failed' },
          },
        });
        break;

      case 'cost:update':
        set((s) => {
          const existing = s.costStats.find((c) => c.model === event.stats.model);
          const newStats = existing
            ? s.costStats.map((c) => c.model === event.stats.model ? event.stats : c)
            : [...s.costStats, event.stats];

          return {
            costStats: newStats,
            totalCost: newStats.reduce((sum, c) => sum + c.costUSD, 0),
            totalDurationMs: newStats.reduce((sum, c) => sum + c.durationMs, 0),
          };
        });
        break;

      case 'heartbeat':
        break;
    }
  },

  reset: () => set({
    stages: createDefaultStages(),
    subtasks: {},
    currentStage: null,
    decomposition: null,
    costStats: [],
    totalCost: 0,
    totalDurationMs: 0,
    isComplete: false,
    isError: false,
    errorMessage: null,
  }),
}));
