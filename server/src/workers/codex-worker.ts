import { type Subtask } from '@ai_manager/shared';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { executeCodexSubtask } from '../services/executor-codex.js';

interface CodexWorkerJob {
  subtask: Subtask;
}

/**
 * Codex Worker — manages Codex CLI execution in an isolated manner.
 * JSON I/O: receives job object, produces structured output.
 */
export async function runCodexWorker(
  subtask: Subtask,
  signal: AbortSignal,
  onProgress: (chunk: string) => void,
): Promise<string> {
  const startedAt = Date.now();
  logger.info({ subtaskId: subtask.id, kind: subtask.kind }, 'Codex Worker starting');

  try {
    const result = await executeCodexSubtask(subtask, signal, onProgress);
    const durationMs = Date.now() - startedAt;
    logger.info({ subtaskId: subtask.id, durationMs }, 'Codex Worker completed');
    return result;
  } catch (error: any) {
    const durationMs = Date.now() - startedAt;
    logger.error({ subtaskId: subtask.id, durationMs, error }, 'Codex Worker failed');
    throw error;
  }
}
