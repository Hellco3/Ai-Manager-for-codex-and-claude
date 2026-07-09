import { type SSEEvent, type FileAttachment } from '@ai_manager/shared';
import { sessionStore } from '../store/session-store.js';
import { attachmentStore } from '../store/attachment-store.js';
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
      // Reset any subtasks still marked "running" to prevent stuck state
      this.resetRunningSubtasks(sessionId);
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
      this.resetRunningSubtasks(sessionId);
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

    // Pre-load executor modules once (not inside the while loop)
    const { executeSubtask } = await import('./executor-claude.js');
    const { executeCodexSubtask, CodexTimeoutError, CodexNotFoundError } = await import('./executor-codex.js');
    const { selectExecutor, withRetry, isRetryableError } = await import('../utils/retry.js');

    const decomposition = session.decomposition!;
    const subtasks = decomposition.subtasks;

    // Build dependency graph: track which subtasks are done / failed after retries
    const completed = new Set<string>();
    const hardFailed = new Set<string>(); // subtasks that failed after all retries
    const inFlight = new Set<string>();
    const results = new Map<string, string>();

    while (completed.size + hardFailed.size < subtasks.length) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

      // Find subtasks whose dependencies are all satisfied
      // Skip subtasks that depend on a hard-failed dependency — they can't proceed
      const ready = subtasks.filter(st =>
        !completed.has(st.id) &&
        !hardFailed.has(st.id) &&
        !inFlight.has(st.id) &&
        st.dependencies.every(depId => completed.has(depId))
      );

      if (ready.length === 0 && inFlight.size === 0) {
        // Nothing can progress — deadlock, all completed, or all remaining hard-failed
        if (hardFailed.size > 0 && completed.size + hardFailed.size === subtasks.length) {
          // All subtasks done (some hard-failed, some completed) — exit cleanly
          break;
        }
        if (hardFailed.size > 0) {
          logger.error({
            sessionId,
            completed: completed.size,
            hardFailed: [...hardFailed],
            total: subtasks.length,
          }, 'Execute stage: deadlock due to exhausted retries');
          throw new Error('Cannot proceed: dependent subtasks failed after all retries');
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
        let attemptCount = 0;
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

          const executorType = selectExecutor(st);
          const startedAt = Date.now();

          // If Codex is the preferred executor but may not be available,
          // we'll fall back to Claude API on ANY Codex error
          let actualExecutor: 'codex' | 'claude' = executorType;

          // Retry logic: transient errors get up to MAX_RETRIES attempts
          const maxRetries = config.MAX_RETRIES;
          const execResult = await withRetry(
            async (): Promise<{ result: string; inputTokens: number; outputTokens: number }> => {
              let result: string;
              let inputTokens = 0;
              let outputTokens = 0;

              if (actualExecutor === 'codex') {
                try {
                  const wsDir = (session as any).workspaceDir as string | undefined;
                  const codexResult = await executeCodexSubtask(st, signal, (chunk: string) => {
                    sessionStore.appendSubtaskProgress(sessionId, st.id, chunk);
                    sseManager.broadcast(sessionId, {
                      type: 'subtask:progress',
                      subtaskId: st.id,
                      chunk,
                    });
                  }, wsDir);
                  result = codexResult.text;
                  inputTokens = codexResult.inputTokens;
                  outputTokens = codexResult.outputTokens;
                } catch (codexErr) {
                  // ANY Codex error → fall back to Claude API
                  // (Codex may be unavailable due to network, auth, or missing executable)
                  logger.warn(
                    { sessionId, subtaskId: st.id, codexError: String(codexErr) },
                    'Codex CLI unavailable, falling back to Claude API',
                  );
                  actualExecutor = 'claude';
                  const claudeResult = await executeSubtask(st, results, signal, (chunk: string) => {
                      sessionStore.appendSubtaskProgress(sessionId, st.id, chunk);
                      sseManager.broadcast(sessionId, {
                        type: 'subtask:progress',
                        subtaskId: st.id,
                        chunk,
                      });
                    });
                    result = claudeResult.text;
                    inputTokens = claudeResult.inputTokens;
                    outputTokens = claudeResult.outputTokens;
                    return { result, inputTokens, outputTokens };
                }
              } else {
                const claudeResult = await executeSubtask(st, results, signal, (chunk: string) => {
                  sessionStore.appendSubtaskProgress(sessionId, st.id, chunk);
                  sseManager.broadcast(sessionId, {
                    type: 'subtask:progress',
                    subtaskId: st.id,
                    chunk,
                  });
                });
                result = claudeResult.text;
                inputTokens = claudeResult.inputTokens;
                outputTokens = claudeResult.outputTokens;
              }

              return { result: result!, inputTokens, outputTokens };
            },
            {
              maxRetries,
              baseDelayMs: 1000,
              maxDelayMs: 30000,
              isRetryable: (err) => {
                // Never retry abort signals, timeouts, or Codex-not-found
                if (err instanceof DOMException && err.name === 'AbortError') return false;
                if (err instanceof CodexTimeoutError) return false;
                if (err instanceof CodexNotFoundError) return false;
                return isRetryableError(err);
              },
              onRetry: (attempt, err) => {
                attemptCount = attempt;
                logger.warn(
                  { sessionId, subtaskId: st.id, attempt, error: String(err) },
                  'Retrying subtask after transient error',
                );
                sessionStore.incrementRetry(sessionId, st.id);
                sessionStore.updateSubtaskStatus(sessionId, st.id, 'running');
                sseManager.broadcast(sessionId, {
                  type: 'subtask:started',
                  subtaskId: st.id,
                  kind: st.kind,
                  description: `[Retry ${attempt}] ${st.description}`,
                  timestamp: Date.now(),
                });
              },
            },
          );

          // Success after possible retries
          const durationMs = Date.now() - startedAt;
          results.set(st.id, execResult.result);
          completed.add(st.id);

          sessionStore.setSubtaskResult(sessionId, st.id, execResult.result);
          sseManager.broadcast(sessionId, {
            type: 'subtask:completed',
            subtaskId: st.id,
            result: execResult.result,
            durationMs,
          });

          // Track cost with the actual executor that ran (may differ from preferred)
          const executorModel = actualExecutor === 'codex' ? 'codex-cli' : config.EXECUTOR_MODEL;
          const stats = costTracker.addEntry(executorModel, execResult.inputTokens, execResult.outputTokens, durationMs);
          sseManager.broadcast(sessionId, { type: 'cost:update', stats });
        } catch (error: any) {
          if (error.name === 'AbortError') throw error;

          // Codex timeout: emit the correct event type
          if (error instanceof CodexTimeoutError) {
            hardFailed.add(st.id);
            sessionStore.setSubtaskError(sessionId, st.id, error.message);
            sseManager.broadcast(sessionId, {
              type: 'subtask:timed_out',
              subtaskId: st.id,
              durationMs: Date.now() - (session.subtaskStates?.[st.id]?.startedAt ?? Date.now()),
            });
            return;
          }

          // All retries exhausted — mark as hard failure
          const retryable = isRetryableError(error);
          const failureKind = retryable ? 'failed (retries exhausted)' : 'failed (non-retryable)';
          logger.error(
            { sessionId, subtaskId: st.id, attempts: attemptCount + 1, error },
            `Subtask ${failureKind}`,
          );

          hardFailed.add(st.id);
          sessionStore.setSubtaskError(sessionId, st.id,
            `[${attemptCount + 1} attempt(s)] ${error.message}`,
          );
          sseManager.broadcast(sessionId, {
            type: 'subtask:failed',
            subtaskId: st.id,
            error: error.message,
            retryable: false, // already exhausted
          });
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

    // Count completed vs failed subtasks
    const completedCount = Object.values(session.subtaskStates!).filter(s => s.status === 'completed').length;
    const failedCount = Object.values(session.subtaskStates!).filter(s => s.status === 'failed' || s.status === 'timed_out').length;

    const summary = completedCount > 0
      ? `Task completed. ${completedCount} subtask(s) succeeded, ${failedCount} failed.`
      : `Task failed: all ${failedCount} subtask(s) failed.`;

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
    logger.info({ sessionId }, 'Session cancelled - orchestrator aborting');
  }

  /** Reset subtasks still marked "running" to "failed" after an orchestrator crash */
  private resetRunningSubtasks(sessionId: string): void {
    const session = sessionStore.get(sessionId);
    if (!session?.subtaskStates) return;
    for (const [id, state] of Object.entries(session.subtaskStates)) {
      if (state.status === 'running') {
        sessionStore.setSubtaskError(sessionId, id, 'Orchestrator pipeline failed');
        logger.info({ sessionId, subtaskId: id }, 'Reset stuck running subtask to failed');
      }
    }
  }

  /** Continue a session with a follow-up message */
  async continueSession(sessionId: string, message: string, attachmentIds?: string[]): Promise<void> {
    const session = sessionStore.get(sessionId);
    if (!session) return;

    // Set status to decomposing immediately to prevent race conditions
    sessionStore.updateStatus(sessionId, 'decomposing');

    const abortController = new AbortController();
    this.activeRuns.set(sessionId, abortController);
    const costTracker = this.costTrackers.get(sessionId) ?? new CostTracker();
    this.costTrackers.set(sessionId, costTracker);

    // Store user message (only source of truth — route handler does NOT push)
    sessionStore.addMessage(sessionId, 'user', message, attachmentIds);

    // Broadcast user message to SSE for connected clients
    sseManager.broadcast(sessionId, {
      type: 'message:complete',
      content: message,
      role: 'user',
      timestamp: Date.now(),
      attachmentIds,
    });

    // Re-decompose with conversation context
    try {
      // Phase 1: Generate conversational AI response (streaming)
      await this.streamChatResponse(sessionId, message, abortController.signal, attachmentIds);

      // Phase 2: Re-decompose
      this.broadcastStage(sessionId, 'stage:started', 'decompose');

      const { decomposeTask } = await import('./decomposer.js');

      // Build context from conversation history
      let contextTask = session.task;
      if (session.messages && session.messages.length > 0) {
        const history = session.messages.map(m => `${m.role}: ${m.content}`).join('\n');
        contextTask = `原始任务：${session.task}\n\n对话历史：\n${history}\n\n最新请求：${message}\n\n请尽量使用简体中文进行重新拆解。`;
      } else {
        contextTask = `原始任务：${session.task}\n\n追加请求：${message}\n\n请尽量使用简体中文进行重新拆解。`;
      }

      const { decomposition, inputTokens, outputTokens } = await decomposeTask(contextTask);
      sessionStore.setDecomposition(sessionId, decomposition);

      const stats = costTracker.addEntry(config.DECOMPOSER_MODEL, inputTokens, outputTokens, 0);
      sseManager.broadcast(sessionId, { type: 'cost:update', stats });
      this.broadcastStage(sessionId, 'stage:completed', 'decompose');

      // Notify chat about new plan
      const planSummary = decomposition.overview +
        `\n\n我已经为这次请求拆出了 ${decomposition.subtasks.length} 个子任务，预计耗时 ${decomposition.estimatedTimeMinutes ?? '未知'} 分钟。`;
      sseManager.broadcast(sessionId, {
        type: 'message:complete',
        content: planSummary,
        role: 'assistant',
        timestamp: Date.now(),
      });
      sessionStore.addMessage(sessionId, 'assistant', planSummary);

      // Phase 3: Execute new plan
      await this.runExecuteStage(sessionId, costTracker, abortController.signal);
      await this.runAggregateStage(sessionId, costTracker);
      this.completeSession(sessionId, costTracker);
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      logger.error({ sessionId, error }, 'Continue session failed');
      sessionStore.updateStatus(sessionId, 'failed');
      this.resetRunningSubtasks(sessionId);
      sseManager.broadcast(sessionId, { type: 'session:error', error: error.message || 'Unknown error' });
      // Clean up bookkeeping so stale entries don't leak
      this.activeRuns.delete(sessionId);
    }
  }

  /**
   * Generate a streaming conversational AI response via Claude.
   * Handles image attachments as Claude-compatible content blocks.
   */
  private async streamChatResponse(
    sessionId: string,
    userMessage: string,
    signal: AbortSignal,
    attachmentIds?: string[],
  ): Promise<void> {
    const session = sessionStore.get(sessionId)!;
    let fullResponse = '';

    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;

      const anthropic = new Anthropic({
        apiKey: config.ANTHROPIC_API_KEY,
        baseURL: config.ANTHROPIC_BASE_URL,
      });

      // Build conversation context
      const historyMessages = (session.messages ?? [])
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-10) // last 10 messages for context
        .map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

      // Build user message content — may include image attachments
      let userContent: any = userMessage;

      if (attachmentIds && attachmentIds.length > 0) {
        const attachments = attachmentStore.getByIds(attachmentIds);
        const imageAtts = attachments.filter(a => a.type === 'image' && a.status === 'ready');
        const fileAtts = attachments.filter(a => a.type !== 'image' && a.status === 'ready');

        if (imageAtts.length > 0 || fileAtts.length > 0) {
          // Use array content format for multimodal messages
          const contentBlocks: any[] = [];

          for (const img of imageAtts) {
            try {
              const fs = (await import('fs/promises')).default ?? await import('fs/promises');
              const path = (await import('node:path')).default ?? await import('node:path');
              const UPLOAD_ROOT = path.resolve('uploads');
              const resolved = path.resolve(UPLOAD_ROOT, img.storageKey);
              if (resolved.startsWith(UPLOAD_ROOT + path.sep)) {
                const imageData = await fs.readFile(resolved);
                const base64 = imageData.toString('base64');
                contentBlocks.push({
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: img.mimeType,
                    data: base64,
                  },
                });
              }
            } catch (err: any) {
              logger.warn({ error: err, attachmentId: img.id }, 'Failed to read image attachment for Claude');
            }
          }

          // Build text with file references
          let textContent = userMessage;
          if (fileAtts.length > 0) {
            const fileList = fileAtts.map(f => `- ${f.originalName} (${f.mimeType}, ${(f.size / 1024).toFixed(1)}KB)`).join('\n');
            textContent = `${userMessage}\n\n[用户上传了以下文件：\n${fileList}\n]`;
          }

          contentBlocks.push({ type: 'text', text: textContent });
          userContent = contentBlocks;
        }
      }

      const stream = anthropic.messages.stream({
        model: config.EXECUTOR_MODEL,
        max_tokens: 4000,
        system: `你是任务编排系统中的 AI 助手。用户提交的任务是：”${session.task}”。

你正在围绕这个任务与用户继续对话。请简洁、友好、协作地回应，先确认用户诉求，再说明你接下来会怎么处理。你的回复后，系统会自动重新拆解并执行子任务。

重要：回复尽量简短，控制在 2 到 4 句话内。默认优先使用简体中文；只有当任务明确要求其他语言时才切换。系统会负责实际执行，你只需要把话说明白。`,
        messages: [
          ...historyMessages,
          { role: 'user' as const, content: userContent },
        ],
      });

      for await (const event of stream) {
        if (signal.aborted) {
          stream.controller.abort();
          throw new DOMException('Chat response cancelled', 'AbortError');
        }
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const text = (event.delta as any).text as string;
          fullResponse += text;
          sseManager.broadcast(sessionId, {
            type: 'message:chunk',
            chunk: text,
          });
        }
      }

      // Finalize the streaming message
      if (fullResponse) {
        sseManager.broadcast(sessionId, {
          type: 'message:complete',
          content: fullResponse,
          role: 'assistant',
          timestamp: Date.now(),
        });
        sessionStore.addMessage(sessionId, 'assistant', fullResponse);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') throw error;
      logger.error({ sessionId, error }, 'Chat response streaming failed');
      // Non-fatal: broadcast the real error to chat and continue with re-decomposition
      const errorMessage = error?.status === 401
        ? 'AI 服务认证失败，请检查相关配置。'
        : `聊天回复暂时不可用（${error.message || '未知错误'}），系统将继续进行任务重新拆解。`;
      sseManager.broadcast(sessionId, {
        type: 'message:complete',
        content: errorMessage,
        role: 'system',
        timestamp: Date.now(),
      });
      sessionStore.addMessage(sessionId, 'system', errorMessage);
    }
  }

  /** Re-decompose remaining work in a session */
  async reconstructSession(sessionId: string): Promise<void> {
    const session = sessionStore.get(sessionId);
    if (!session) return;

    // Set status immediately to prevent concurrent execution
    sessionStore.updateStatus(sessionId, 'decomposing');

    const abortController = new AbortController();
    this.activeRuns.set(sessionId, abortController);
    const costTracker = this.costTrackers.get(sessionId) ?? new CostTracker();
    this.costTrackers.set(sessionId, costTracker);

    try {

      // Build context from completed subtasks and messages
      const completedResults: string[] = [];
      for (const [id, state] of Object.entries(session.subtaskStates ?? {})) {
        if (state.status === 'completed' && state.result) {
          completedResults.push(`[${id}] ${state.subtask.description}: ${state.result.slice(0, 500)}`);
        }
      }

      let contextTask = session.task;
      if (session.messages && session.messages.length > 0) {
        contextTask += '\n\n对话记录：\n' + session.messages.map(m => `${m.role}: ${m.content}`).join('\n');
      }
      if (completedResults.length > 0) {
        contextTask += '\n\n已完成工作：\n' + completedResults.join('\n');
      }
      contextTask += '\n\n请基于以上上下文重新拆解并继续剩余工作，尽量使用简体中文输出。';

      const { decomposeTask } = await import('./decomposer.js');
      const { decomposition, inputTokens, outputTokens } = await decomposeTask(contextTask);
      sessionStore.setDecomposition(sessionId, decomposition);

      const stats = costTracker.addEntry(config.DECOMPOSER_MODEL, inputTokens, outputTokens, 0);
      sseManager.broadcast(sessionId, { type: 'cost:update', stats });

      await this.runExecuteStage(sessionId, costTracker, abortController.signal);
      await this.runAggregateStage(sessionId, costTracker);
      this.completeSession(sessionId, costTracker);
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      logger.error({ sessionId, error }, 'Reconstruct session failed');
      sessionStore.updateStatus(sessionId, 'failed');
      this.resetRunningSubtasks(sessionId);
      sseManager.broadcast(sessionId, { type: 'session:error', error: error.message || 'Unknown error' });
      this.activeRuns.delete(sessionId);
    }
  }

  private broadcastStage(sessionId: string, type: 'stage:started' | 'stage:completed', stage: string): void {
    sseManager.broadcast(sessionId, { type, stage, timestamp: Date.now() });
  }

  /**
   * Chat-first phase: generate a streaming conversational AI response without decomposition.
   * Used when the user sends a message in 'chatting' mode — just talk, don't execute.
   */
  async chatFirstPhase(sessionId: string, userMessage: string, attachmentIds?: string[]): Promise<void> {
    const session = sessionStore.get(sessionId);
    if (!session) return;

    const abortController = this.activeRuns.get(sessionId) ?? new AbortController();
    if (!this.activeRuns.has(sessionId)) {
      this.activeRuns.set(sessionId, abortController);
    }

    try {
      await this.streamChatResponse(sessionId, userMessage, abortController.signal, attachmentIds);
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      logger.error({ sessionId, error }, 'Chat-first phase failed');
    }
  }

  /**
   * Confirm and decompose: trigger task decomposition + execution from chat-first mode.
   * Uses full conversation context to understand what the user wants.
   */
  async confirmAndDecompose(sessionId: string, refinedTask?: string): Promise<void> {
    const session = sessionStore.get(sessionId);
    if (!session) return;

    const abortController = new AbortController();
    this.activeRuns.set(sessionId, abortController);
    const costTracker = this.costTrackers.get(sessionId) ?? new CostTracker();
    this.costTrackers.set(sessionId, costTracker);

    try {
      // Build context from conversation history for decomposition
      const taskDescription = refinedTask ?? session.task;
      let contextTask = taskDescription;
      if (session.messages && session.messages.length > 0) {
        const history = session.messages.map(m => `${m.role}: ${m.content}`).join('\n');
        contextTask = `原始任务描述：${taskDescription}\n\n对话历史（用户与 AI 的讨论）：\n${history}\n\n请基于对话历史中达成的共识，重新理解和拆解任务。尽量使用简体中文输出。`;
      }

      // Phase 1: Decompose
      this.broadcastStage(sessionId, 'stage:started', 'decompose');
      const { decomposeTask } = await import('./decomposer.js');
      const { decomposition, inputTokens, outputTokens } = await decomposeTask(contextTask);
      sessionStore.setDecomposition(sessionId, decomposition);
      this.broadcastStage(sessionId, 'stage:completed', 'decompose');

      const stats = costTracker.addEntry(config.DECOMPOSER_MODEL, inputTokens, outputTokens, 0);
      sseManager.broadcast(sessionId, { type: 'cost:update', stats });

      // Notify chat about the plan
      const planSummary = decomposition.overview +
        `\n\n我已将任务拆解为 ${decomposition.subtasks.length} 个子任务，预计耗时 ${decomposition.estimatedTimeMinutes ?? '未知'} 分钟。现在开始执行...`;
      sseManager.broadcast(sessionId, {
        type: 'message:complete',
        content: planSummary,
        role: 'assistant',
        timestamp: Date.now(),
      });
      sessionStore.addMessage(sessionId, 'assistant', planSummary);

      // Phase 2: Execute
      await this.runExecuteStage(sessionId, costTracker, abortController.signal);

      // Phase 3: Aggregate
      await this.runAggregateStage(sessionId, costTracker);

      // Phase 4: Generate completion report in chat
      const session2 = sessionStore.get(sessionId)!;
      const completedCount = Object.values(session2.subtaskStates!).filter(s => s.status === 'completed').length;
      const failedCount = Object.values(session2.subtaskStates!).filter(s => s.status === 'failed' || s.status === 'timed_out').length;
      const totalCost = costTracker.getTotalCost();
      const totalDuration = costTracker.getTotalDuration();
      const durationSec = Math.floor(totalDuration / 1000);
      const durationStr = durationSec < 60 ? `${durationSec}s` : `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`;

      const reportSummary = `✅ 任务执行完成！\
\n\n📊 **执行汇总**：\
\n- 成功：${completedCount} 个子任务\
\n- 失败：${failedCount} 个子任务\
\n- 总耗时：${durationStr}\
\n- 预估费用：$${totalCost.toFixed(4)}\
\n\n有什么需要调整的吗？告诉我你的想法，我会重新规划并执行。`;

      sessionStore.addMessage(sessionId, 'assistant', reportSummary);
      // Stream it as a message for the chat UI
      for (let i = 0; i < reportSummary.length; i += 5) {
        const chunk = reportSummary.slice(i, i + 5);
        sseManager.broadcast(sessionId, { type: 'message:chunk', chunk });
        await new Promise(r => setTimeout(r, 10)); // simulate streaming
      }
      sseManager.broadcast(sessionId, {
        type: 'message:complete',
        content: reportSummary,
        role: 'assistant',
        timestamp: Date.now(),
      });

      this.completeSession(sessionId, costTracker);
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      logger.error({ sessionId, error }, 'Confirm and decompose failed');
      sessionStore.updateStatus(sessionId, 'failed');
      this.resetRunningSubtasks(sessionId);
      sseManager.broadcast(sessionId, { type: 'session:error', error: error.message || 'Unknown error' });
      this.activeRuns.delete(sessionId);
    }
  }
}

// Singleton
export const orchestrator = new Orchestrator();
