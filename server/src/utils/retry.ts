import {
  type Subtask,
} from '@ai_manager/shared';

/**
 * Retry with exponential backoff + jitter.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    onRetry?: (attempt: number, error: Error) => void;
    isRetryable?: (error: unknown) => boolean;
  } = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    onRetry,
    isRetryable = () => true,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt > maxRetries || !isRetryable(error)) {
        throw error;
      }

      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt - 1),
        maxDelayMs,
      ) + Math.random() * 1000;

      onRetry?.(attempt, lastError);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Execute a function with a timeout.
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  label?: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout after ${timeoutMs}ms${label ? `: ${label}` : ''}`));
    }, timeoutMs);

    fn()
      .then(result => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Route a subtask to the appropriate executor.
 */
export function selectExecutor(subtask: Subtask): 'claude' | 'codex' {
  switch (subtask.kind) {
    case 'code':
      return 'codex';
    case 'analysis':
    case 'design':
    case 'research':
    case 'integration':
      return 'claude';
    default:
      return 'claude';
  }
}

/**
 * Classify if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
  const msg = String(error).toLowerCase();
  if (msg.includes('rate limit') || msg.includes('429')) return true;
  if (msg.includes('timeout') || msg.includes('etimedout')) return true;
  if (msg.includes('econnrefused') || msg.includes('econnreset')) return true;
  if (msg.includes('internal server error') || msg.includes('500')) return true;
  if (msg.includes('503') || msg.includes('502') || msg.includes('overloaded')) return true;
  return false;
}

/** Dead-letter queue for failed subtasks */
export class DeadLetterQueue {
  private failed: Array<{ subtask: Subtask; error: string; timestamp: number }> = [];

  record(subtask: Subtask, error: string): void {
    this.failed.push({ subtask, error, timestamp: Date.now() });
    // Keep max 100 entries
    if (this.failed.length > 100) this.failed.shift();
  }

  getAll() {
    return [...this.failed];
  }

  getCount(): number {
    return this.failed.length;
  }

  clear(): void {
    this.failed = [];
  }
}
