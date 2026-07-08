import { z } from 'zod';

// --- Subtask Kind ---
export const SubtaskKind = z.enum(['code', 'analysis', 'design', 'research', 'integration']);
export type SubtaskKind = z.infer<typeof SubtaskKind>;

// --- Subtask Complexity ---
export const SubtaskComplexity = z.enum(['low', 'medium', 'high']);
export type SubtaskComplexity = z.infer<typeof SubtaskComplexity>;

// --- Subtask ---
export const Subtask = z.object({
  id: z.string(),
  kind: SubtaskKind,
  description: z.string().min(1),
  dependencies: z.array(z.string()).default([]),
  priority: z.number().int().min(1).max(10).default(5),
  estimatedComplexity: SubtaskComplexity.default('medium'),
});
export type Subtask = z.infer<typeof Subtask>;

// --- Task Decomposition ---
export const TaskDecomposition = z.object({
  overview: z.string(),
  subtasks: z.array(Subtask),
  executionOrder: z.array(z.string()),
  estimatedTimeMinutes: z.number().optional(),
});
export type TaskDecomposition = z.infer<typeof TaskDecomposition>;

// --- Session Status ---
export const SessionStatus = z.enum([
  'decomposing',
  'awaiting_review',
  'executing',
  'aggregating',
  'completed',
  'failed',
  'cancelled',
  'timed_out',
]);
export type SessionStatus = z.infer<typeof SessionStatus>;

// --- Subtask Status ---
export const SubtaskStatus = z.enum([
  'pending',
  'queued',
  'running',
  'completed',
  'failed',
  'timed_out',
  'cancelled',
]);
export type SubtaskStatus = z.infer<typeof SubtaskStatus>;

// --- Subtask State ---
export const SubtaskState = z.object({
  subtask: Subtask,
  status: SubtaskStatus,
  result: z.string().optional(),
  error: z.string().optional(),
  retryCount: z.number().int().default(0),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  progressChunks: z.array(z.string()).default([]),
});
export type SubtaskState = z.infer<typeof SubtaskState>;

// --- Stage State ---
export const StageName = z.enum(['decompose', 'review', 'execute', 'aggregate']);
export type StageName = z.infer<typeof StageName>;

export const StageState = z.object({
  name: StageName,
  status: z.enum(['pending', 'running', 'completed', 'failed', 'skipped']),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
});
export type StageState = z.infer<typeof StageState>;

// --- Task Submission ---
export const TaskSubmission = z.object({
  task: z.string().min(1),
  mode: z.enum(['auto', 'semi-auto']).default('auto'),
});
export type TaskSubmission = z.infer<typeof TaskSubmission>;

// --- Cost Stats ---
export const CostStats = z.object({
  model: z.string(),
  inputTokens: z.number().default(0),
  outputTokens: z.number().default(0),
  costUSD: z.number().default(0),
  durationMs: z.number().default(0),
});
export type CostStats = z.infer<typeof CostStats>;

// --- Aggregated Result ---
export const AggregatedResult = z.object({
  summary: z.string(),
  subtaskResults: z.record(z.string(), z.string()),
  totalCost: z.number(),
  totalDurationMs: z.number(),
  costBreakdown: z.array(CostStats),
});
export type AggregatedResult = z.infer<typeof AggregatedResult>;
