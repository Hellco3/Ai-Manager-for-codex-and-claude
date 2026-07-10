import { z } from 'zod';
import { Subtask, SubtaskState, TaskDecomposition, CostStats, AggregatedResult, FileAttachment } from './task.js';

const MessageType = z.enum(['text', 'completion']);
export type MessageType = z.infer<typeof MessageType>;

// --- SSE Event Types ---
export const SSEEventType = z.enum([
  'session:created',
  'stage:started',
  'stage:completed',
  'stage:awaiting_review',
  'subtask:queued',
  'subtask:started',
  'subtask:progress',
  'subtask:completed',
  'subtask:failed',
  'subtask:timed_out',
  'session:complete',
  'session:error',
  'cost:update',
  'message:chunk',
  'message:complete',
  'attachment:updated',
  'status:progress',
  'heartbeat',
]);
export type SSEEventType = z.infer<typeof SSEEventType>;

// --- SSE Event ---
export const SSEEvent = z.discriminatedUnion('type', [
  z.object({ id: z.string().optional(), type: z.literal('session:created'), sessionId: z.string() }),
  z.object({ id: z.string().optional(), type: z.literal('stage:started'), stage: z.string(), timestamp: z.number() }),
  z.object({ id: z.string().optional(), type: z.literal('stage:completed'), stage: z.string(), timestamp: z.number() }),
  z.object({ id: z.string().optional(), type: z.literal('stage:awaiting_review'), decomposition: TaskDecomposition }),
  z.object({ id: z.string().optional(), type: z.literal('subtask:queued'), subtaskId: z.string(), kind: z.string(), description: z.string() }),
  z.object({ id: z.string().optional(), type: z.literal('subtask:started'), subtaskId: z.string(), kind: z.string(), description: z.string(), timestamp: z.number() }),
  z.object({ id: z.string().optional(), type: z.literal('subtask:progress'), subtaskId: z.string(), chunk: z.string() }),
  z.object({ id: z.string().optional(), type: z.literal('subtask:completed'), subtaskId: z.string(), result: z.string(), durationMs: z.number() }),
  z.object({ id: z.string().optional(), type: z.literal('subtask:failed'), subtaskId: z.string(), error: z.string(), retryable: z.boolean() }),
  z.object({ id: z.string().optional(), type: z.literal('subtask:timed_out'), subtaskId: z.string(), durationMs: z.number() }),
  z.object({ id: z.string().optional(), type: z.literal('session:complete'), result: AggregatedResult }),
  z.object({ id: z.string().optional(), type: z.literal('session:error'), error: z.string() }),
  z.object({ id: z.string().optional(), type: z.literal('cost:update'), stats: CostStats }),
  z.object({ id: z.string().optional(), type: z.literal('message:chunk'), chunk: z.string() }),
  z.object({ id: z.string().optional(), type: z.literal('message:complete'), content: z.string(), role: z.string(), timestamp: z.number(), attachmentIds: z.array(z.string()).optional(), messageType: MessageType.optional() }),
  z.object({ id: z.string().optional(), type: z.literal('attachment:updated'), attachment: FileAttachment }),
  z.object({ id: z.string().optional(), type: z.literal('status:progress'), message: z.string(), step: z.string(), progress: z.number().optional() }),
  z.object({ id: z.string().optional(), type: z.literal('heartbeat'), timestamp: z.number() }),
]);
export type SSEEvent = z.infer<typeof SSEEvent>;

// --- Pipeline State (for frontend Zustand store) ---
export const PipelineState = z.object({
  stages: z.record(z.string(), z.object({
    name: z.string(),
    status: z.enum(['pending', 'running', 'completed', 'failed', 'skipped']),
    startedAt: z.number().optional(),
    completedAt: z.number().optional(),
  })),
  subtasks: z.record(z.string(), SubtaskState),
  currentStage: z.string().nullable(),
  costStats: z.array(CostStats).default([]),
  totalCost: z.number().default(0),
  totalDurationMs: z.number().default(0),
});
export type PipelineState = z.infer<typeof PipelineState>;

// --- Session State ---
export const SessionState = z.object({
  sessionId: z.string(),
  status: z.enum(['chatting', 'decomposing', 'awaiting_review', 'executing', 'aggregating', 'completed', 'failed', 'cancelled', 'timed_out']),
  task: z.string(),
  mode: z.enum(['auto', 'semi-auto', 'chat-first']),
  decomposition: TaskDecomposition.optional(),
  subtaskStates: z.record(z.string(), SubtaskState).default({}),
  messages: z.array(z.object({
    role: z.string(),
    content: z.string(),
    timestamp: z.number(),
    attachmentIds: z.array(z.string()).optional(),
    messageType: MessageType.optional(),
  })).optional(),
  attachments: z.record(z.string(), FileAttachment).optional(),
  workspaceDir: z.string().optional(),
  aggregatedResult: AggregatedResult.optional(),
  costStats: z.array(CostStats).default([]),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type SessionState = z.infer<typeof SessionState>;
