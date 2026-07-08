import { spawn, ChildProcess } from 'child_process';
import { type Subtask } from '@ai_manager/shared';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

function killProcess(proc: ChildProcess, signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
  return new Promise(resolve => {
    const forceKillTimer = setTimeout(() => {
      // Force kill after 10s grace period
      try { proc.kill('SIGKILL'); } catch { /* already dead */ }
      resolve();
    }, 10000);

    proc.on('close', () => {
      clearTimeout(forceKillTimer);
      resolve();
    });

    try {
      proc.kill(signal);
    } catch {
      // Process already exited
      clearTimeout(forceKillTimer);
      resolve();
    }
  });
}

/**
 * Execute a coding subtask via Codex CLI as an isolated child process.
 * Uses JSON-standardized I/O and streaming stdout.
 */
export async function executeCodexSubtask(
  subtask: Subtask,
  signal: AbortSignal,
  onProgress: (chunk: string) => void,
): Promise<string> {
  const codexPath = config.CODEX_CLI_PATH;

  logger.info({ subtaskId: subtask.id, codexPath }, 'Executing Codex subtask');

  return new Promise<string>((resolve, reject) => {
    const proc = spawn(codexPath, [
      'exec',
      '--skip-git-repo-check',
      '--output-format', 'text',
      '--approval', 'never',
      '--model', 'claude-sonnet-5',
      `[CODING TASK] ${subtask.description}\n\nProvide your complete implementation with code. No explanations unless strictly necessary.`,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: config.ANTHROPIC_API_KEY,
      },
      // No timeout at the spawn level — we manage it ourselves
    });

    let stdout = '';
    let stderr = '';

    // Watch for abort signal from orchestrator
    const onAbort = () => {
      killProcess(proc).then(() => {
        reject(new DOMException(`Codex subtask cancelled`, 'AbortError'));
      });
    };
    signal.addEventListener('abort', onAbort, { once: true });

    // If already aborted before we started, don't spawn
    if (signal.aborted) {
      reject(new DOMException('Subtask cancelled before start', 'AbortError'));
      return;
    }

    const timeoutMs = config.CODEX_TIMEOUT_MS;
    const timeoutTimer = setTimeout(async () => {
      logger.warn({ subtaskId: subtask.id, timeoutMs }, 'Codex CLI timeout — terminating');
      await killProcess(proc);
      reject(new Error(`Codex CLI timed out after ${timeoutMs}ms for subtask: ${subtask.id}`));
    }, timeoutMs);

    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      stdout += text;
      onProgress(text);
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      stderr += text;
      onProgress(text);
    });

    proc.on('error', (err: Error) => {
      clearTimeout(timeoutTimer);
      // Check if Codex CLI exists
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error(`Codex CLI not found at "${codexPath}". Is Codex installed?`));
      } else {
        reject(new Error(`Codex CLI process error: ${err.message}`));
      }
    });

    proc.on('close', (code: number | null, sig: string | null) => {
      clearTimeout(timeoutTimer);
      signal.removeEventListener('abort', onAbort);

      if (code === 0) {
        logger.info({ subtaskId: subtask.id, outputLength: stdout.length }, 'Codex CLI completed');
        // Clean up the Codex header/status lines from stdout
        const cleaned = cleanCodexOutput(stdout);
        resolve(cleaned);
      } else if (sig) {
        reject(new Error(`Codex CLI killed by signal ${sig} for subtask: ${subtask.id}`));
      } else {
        // Some Codex errors are recoverable — include stderr in the output
        const combined = stdout + (stderr ? `\n[STDERR]\n${stderr}` : '');
        reject(new Error(`Codex CLI exited with code ${code}: ${combined.slice(-500)}`));
      }
    });
  });
}

/**
 * Clean up Codex CLI output headers (model info, tokens used, etc.).
 */
function cleanCodexOutput(output: string): string {
  const lines = output.split('\n');
  const cleaned: string[] = [];
  let passedHeader = false;

  for (const line of lines) {
    if (!passedHeader) {
      if (line.startsWith('OpenAI Codex') ||
          line.startsWith('--------') ||
          line.startsWith('workdir:') ||
          line.startsWith('model:') ||
          line.startsWith('provider:') ||
          line.startsWith('approval:') ||
          line.startsWith('sandbox:') ||
          line.startsWith('reasoning') ||
          line.startsWith('session id:') ||
          line.startsWith('tokens used') ||
          line.startsWith('user') ||
          line.startsWith('codex')) {
        continue;
      }
      passedHeader = true;
    }
    cleaned.push(line);
  }

  return cleaned.join('\n').trim();
}

/**
 * Check the health of a running Codex CLI process.
 */
export async function checkCodexHealth(): Promise<{ available: boolean; version?: string; error?: string }> {
  return new Promise(resolve => {
    try {
      const proc = spawn(config.CODEX_CLI_PATH, ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 10000,
      });

      let output = '';
      proc.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString('utf-8'); });

      proc.on('error', (err: Error) => {
        resolve({ available: false, error: err.message });
      });

      proc.on('close', (code: number) => {
        if (code === 0) {
          resolve({ available: true, version: output.trim() });
        } else {
          resolve({ available: false, error: `Exit code: ${code}` });
        }
      });
    } catch (err) {
      resolve({ available: false, error: String(err) });
    }
  });
}
