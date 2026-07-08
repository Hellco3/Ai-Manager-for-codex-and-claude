import { type SSEEvent } from '@ai_manager/shared';
import { sessionStore } from '../store/session-store.js';
import { sseManager } from '../sse/manager.js';
import { decomposeTask } from './decomposer.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { CostTracker } from '../utils/cost-tracker.js';

class Orchestrator {
  private activeRuns = new Map<string, AbortController>();
  private costTrackers = new Map<string, CostTracker>();

  /**
   * Start a new session pipeline.
   */
  async startSession(sessionId: string): Promise<void> {
    const session = sessionStore.get(sessionId);
    if (!session) {
      logger.error({ sessionId }, 'Session not found');
      return;
    }

    const abortController = new AbortController();
    this.activeRuns.set(sessionId, abortController);
    const costTracker = new CostTracker();
    this.costTrackers.set(sessionId, costTracker);

    try {
      // Stage 1: Decompose
      await this.runDecomposeStage(sessionId, costTracker);

      // Check if cancelled
      if (abortController.signal.aborted) return;

      // Stage 1b: Review (semi-auto mode)
      if (session.mode === 'semi-auto') {
        await this.runReviewStage(sessionId);
        return; // Will be resumed via POST /api/tasks/:id/approve
      }

      // Stage 2: Execute (auto mode)
      await this.runExecuteStage(sessionId, costTracker, abortController.signal);

      // Stage 3: Aggregate
      await this.runAggregateStage(sessionId, costTracker);

      // Complete
      this.completeSession(sessionId, costTracker);
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      logger.error({ sessionId, error }, 'Orchestrator pipeline failed');
      sessionStore.updateStatus(sessionId, 'failed');
      sseManager.broadcast(sessionId, { type: 'session:error', error: error.message || 'Unknown error' });
    }
  }

  /**
   * Resume a session after user review (semi-auto mode).
   */
  async resumeAfterReview(sessionId: string): Promise<void> {
    const session = sessionStore.get(sessionId);
    if (!session) return;

    const abortController = this.activeRuns.get(sessionId);
    const costTracker = this.costTrackers.get(sessionId);
    if (!abortController || !costTracker) {
      logger.error({ sessionId }, 'Cannot resume: missing abort controller or cost tracker');
      sessionStore.updateStatus(sessionId, 'failed');
      sseManager.broadcast(sessionId, { type: 'session:error', error: 'Internal error: session state lost' });
      return;
    }

    try {
      await this.runExecuteStage(sessionId, costTracker, abortController.signal);
      await this.runAggregateStage(sessionId, costTracker);
      this.completeSession(sessionId, costTracker);
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      logger.error({ sessionId, error }, 'Resume pipeline failed');
      sessionStore.updateStatus(sessionId, 'failed');
      sseManager.broadcast(sessionId, { type: 'session:error', error: error.message || 'Unknown error' });
    }
  }

  private async runDecomposeStage(sessionId: string, costTracker: CostTracker): Promise<void> {
    const session = sessionStore.get(sessionId)!;

    // Notify: stage started
    this.broadcastStage(sessionId, 'stage:started', 'decompose');

    const { decomposition, inputTokens, outputTokens } = await decomposeTask(session.task);

    // Store decomposition
    sessionStore.setDecomposition(sessionId, decomposition);

    // Track cost
    const stats = costTracker.addEntry(config.DECOMPOSER_MODEL, inputTokens, outputTokens, 0);
    sseManager.broadcast(sessionId, { type: 'cost:update', stats });

    // Notify: stage completed
    this.broadcastStage(sessionId, 'stage:completed', 'decompose');
  }

  private async runReviewStage(sessionId: string): Promise<void> {
    const session = sessionStore.get(sessionId)!;
    sessionStore.updateStatus(sessionId, 'awaiting_review');

    this.broadcastStage(sessionId, 'stage:started', 'review');
    sseManager.broadcast(sessionId, {
      type: 'stage:awaiting_review',
      decomposition: session.decomposition!,
    });
  }

  private async runExecuteStage(
    sessionId: string,
    costTracker: CostTracker,
    signal: AbortSignal,
  ): Promise<void> {
    const session = sessionStore.get(sessionId)!;
    sessionStore.updateStatus(sessionId, 'executing');

    this.broadcastStage(sessionId, 'stage:started', 'execute');

    const decomposition = session.decomposition!;
    const subtasks = decomposition.subtasks;

    // Build dependency graph: track which subtasks are done
    const completed = new Set<string>();
    const inFlight = new Set<string>();
    const results = new Map<string, string>();
    let hasFailure = false;

    while (completed.size < subtasks.length) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

      // Find subtasks whose dependencies are all satisfied
      const ready = subtasks.filter(st =>
        !completed.has(st.id) &&
        !inFlight.has(st.id) &&
        st.dependencies.every(depId => completed.has(depId))
      );

      if (ready.length === 0 && inFlight.size === 0) {
        // Nothing can progress — deadlock or all remaining have unsatisfied deps
        if (hasFailure) {
          logger.error({ sessionId, completed: completed.size, total: subtasks.length }, 'Execute stage: deadlock due to failures');
          throw new Error('Cannot proceed: dependent subtasks failed and cannot be retried');
        }
        // Shouldn't happen with a valid DAG, but wait briefly
        await new Promise(r => setTimeout(r, 200));
        continue;
      }

      if (ready.length === 0 && inFlight.size > 0) {
        // Wait for in-flight tasks to complete
        await new Promise(r => setTimeout(r, 100));
        continue;
      }

      // Execute ready subtasks with concurrency limit
      const batch = ready.slice(0, config.MAX_CONCURRENT_SUBTASKS);
      batch.forEach(st => inFlight.add(st.id));

      // Launch all in parallel
      const batchPromises = batch.map(async (st) => {
        try {
          // Notify: subtask started
          sessionStore.updateSubtaskStatus(sessionId, st.id, 'running');
          sseManager.broadcast(sessionId, {
            type: 'subtask:started',
            subtaskId: st.id,
            kind: st.kind,
            description: st.description,
            timestamp: Date.now(),
          });

          // Execute with real executors
          const { executeSubtask } = await import('./executor-claude.js');
          const { executeCodexSubtask } = await import('./executor-codex.js');
          const { selectExecutor } = (await import('../utils/retry.js'));

          const executorType = selectExecutor(st);
          const startedAt = Date.now();

          let result: string;
          let inputTokens = 0;
          let outputTokens = 0;

          if (executorType === 'codex') {
            result = await executeCodexSubtask(st, signal, (chunk: string) => {
              sessionStore.appendSubtaskProgress(sessionId, st.id, chunk);
              sseManager.broadcast(sessionId, {
                type: 'subtask:progress',
                subtaskId: st.id,
                chunk,
              });
            });
          } else {
            const execResult = await executeSubtask(st, results, signal, (chunk: string) => {
              sessionStore.appendSubtaskProgress(sessionId, st.id, chunk);
              sseManager.broadcast(sessionId, {
                type: 'subtask:progress',
                subtaskId: st.id,
                chunk,
              });
            });
            result = execResult.text;
            inputTokens = execResult.inputTokens;
            outputTokens = execResult.outputTokens;
          }

          const durationMs = Date.now() - startedAt;
          results.set(st.id, result);
          completed.add(st.id);

          sessionStore.setSubtaskResult(sessionId, st.id, result);
          sseManager.broadcast(sessionId, {
            type: 'subtask:completed',
            subtaskId: st.id,
            result,
            durationMs,
          });

          // Track cost with real token counts
          const executorModel = executorType === 'codex' ? 'codex-cli' : config.EXECUTOR_MODEL;
          const stats = costTracker.addEntry(executorModel, inputTokens, outputTokens, durationMs);
          sseManager.broadcast(sessionId, { type: 'cost:update', stats });
        } catch (error: any) {
          if (error.name === 'AbortError') throw error;
          logger.error({ sessionId, subtaskId: st.id, error }, 'Subtask failed');

          const isRetryable = (await import('../utils/retry.js')).isRetryableError(error);
          sessionStore.setSubtaskError(sessionId, st.id, error.message);
          sseManager.broadcast(sessionId, {
            type: 'subtask:failed',
            subtaskId: st.id,
            error: error.message,
            retryable: isRetryable,
          });
          hasFailure = true;
        } finally {
          inFlight.delete(st.id);
        }
      });

      await Promise.allSettled(batchPromises);
    }

    this.broadcastStage(sessionId, 'stage:completed', 'execute');
  }

  private async runAggregateStage(sessionId: string, costTracker: CostTracker): Promise<void> {
    sessionStore.updateStatus(sessionId, 'aggregating');
    this.broadcastStage(sessionId, 'stage:started', 'aggregate');

    const session = sessionStore.get(sessionId)!;
    const subtaskResults: Record<string, string> = {};

    for (const [id, state] of Object.entries(session.subtaskStates!)) {
      subtaskResults[id] = state.result ?? state.error ?? '(no output)';
    }

    // Build aggregated result
    const costBreakdown = costTracker.getAll();
    const totalCost = costTracker.getTotalCost();
    const totalDurationMs = costTracker.getTotalDuration();

    const summary = `Task completed. ${Object.keys(subtaskResults).length} subtasks executed.`;

    const result = {
      summary,
      subtaskResults,
      totalCost,
      totalDurationMs,
      costBreakdown,
    };

    sseManager.broadcast(sessionId, {
      type: 'session:complete',
      result,
    });

    this.broadcastStage(sessionId, 'stage:completed', 'aggregate');
  }

  private completeSession(sessionId: string, costTracker: CostTracker): void {
    sessionStore.updateStatus(sessionId, 'completed');
    logger.info({ sessionId, totalCost: costTracker.getTotalCost() }, 'Session completed');
    this.activeRuns.delete(sessionId);
  }

  cancelSession(sessionId: string): void {
    const controller = this.activeRuns.get(sessionId);
    if (controller) {
      controller.abort();
      this.activeRuns.delete(sessionId);
    }
    // Clean up Codex CLI processes via AbortSignal
    // The runExecuteStage checks signal.aborted and kills spawned processes
    logger.info({ sessionId }, 'Session cancelled - orchestrator aborting');
  }

  private broadcastStage(sessionId: string, type: 'stage:started' | 'stage:completed', stage: string): void {
    sseManager.broadcast(sessionId, { type, stage, timestamp: Date.now() });
  }
}

// Singleton
export const orchestrator = new Orchestrator();
