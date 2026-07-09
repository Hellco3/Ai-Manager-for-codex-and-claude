import { spawn, ChildProcess } from 'child_process';
import { type Subtask } from '@ai_manager/shared';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

interface CodexUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CodexExecutionResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/** Specific error class for Codex CLI timeouts; allows the orchestrator to emit subtask:timed_out */
export class CodexTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodexTimeoutError';
  }
}

/** Specific error class for Codex CLI not found; allows orchestrator to fall back to Claude API */
export class CodexNotFoundError extends Error {
  constructor(codexPath: string) {
    super(`Codex CLI not found at "${codexPath}". Is Codex installed?`);
    this.name = 'CodexNotFoundError';
  }
}

function killProcess(proc: ChildProcess, signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
  return new Promise(resolve => {
    const forceKillTimer = setTimeout(() => {
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
      clearTimeout(forceKillTimer);
      resolve();
    }
  });
}

/**
 * Execute a coding subtask via Codex CLI as an isolated child process.
 * Uses JSONL output so we can stream progress and capture usage from turn.completed events.
 */
export async function executeCodexSubtask(
  subtask: Subtask,
  signal: AbortSignal,
  onProgress: (chunk: string) => void,
): Promise<CodexExecutionResult> {
  const codexPath = config.CODEX_CLI_PATH;

  logger.info({ subtaskId: subtask.id, codexPath, model: config.CODEX_MODEL }, 'Executing Codex subtask');

  return new Promise<CodexExecutionResult>((resolve, reject) => {
    const proc = spawn(codexPath, [
      'exec',
      '--skip-git-repo-check',
      '--json',
      '--dangerously-bypass-approvals-and-sandbox',
      '--model', config.CODEX_MODEL,
      '--',
      `[CODING TASK] ${subtask.description}

尽量使用简体中文输出解释、总结、注释和类似提交说明的文字；如果任务明确要求其他语言，再按任务要求处理。
Provide your complete implementation with code. No explanations unless strictly necessary.`,
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: config.ANTHROPIC_API_KEY,
      },
    });

    let stdout = '';
    let stderr = '';

    const onAbort = () => {
      killProcess(proc).then(() => {
        reject(new DOMException('Codex subtask cancelled', 'AbortError'));
      });
    };
    signal.addEventListener('abort', onAbort, { once: true });

    if (signal.aborted) {
      reject(new DOMException('Subtask cancelled before start', 'AbortError'));
      return;
    }

    const timeoutMs = config.CODEX_TIMEOUT_MS;
    const timeoutTimer = setTimeout(async () => {
      logger.warn({ subtaskId: subtask.id, timeoutMs }, 'Codex CLI timeout; terminating');
      await killProcess(proc);
      reject(new CodexTimeoutError(`Codex CLI timed out after ${timeoutMs}ms for subtask: ${subtask.id}`));
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
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new CodexNotFoundError(codexPath));
      } else {
        reject(new Error(`Codex CLI process error: ${err.message}`));
      }
    });

    proc.on('close', (code: number | null, sig: string | null) => {
      clearTimeout(timeoutTimer);
      signal.removeEventListener('abort', onAbort);

      if (code === 0) {
        logger.info({ subtaskId: subtask.id, outputLength: stdout.length }, 'Codex CLI completed');
        resolve(processCodexJsonOutput(stdout));
      } else if (sig) {
        reject(new Error(`Codex CLI killed by signal ${sig} for subtask: ${subtask.id}`));
      } else {
        const combined = stdout + (stderr ? `\n[STDERR]\n${stderr}` : '');
        reject(new Error(`Codex CLI exited with code ${code}: ${combined.slice(-500)}`));
      }
    });
  });
}

function processCodexJsonOutput(output: string): CodexExecutionResult {
  const lines = output.split('\n');
  const messages: string[] = [];
  const usage: CodexUsage = { inputTokens: 0, outputTokens: 0 };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const event = JSON.parse(trimmed);

      if (event.type === 'assistant' && event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === 'text' && block.text) {
            messages.push(block.text);
          }
        }
      }

      if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item?.text) {
        messages.push(event.item.text);
      }

      if (event.type === 'result' && event.result) {
        messages.push(event.result);
      }

      if (event.type === 'tool_use' && event.content) {
        for (const block of event.content) {
          if (block.type === 'text' && block.text) {
            messages.push(block.text);
          }
        }
      }

      if (event.type === 'turn.completed' && event.usage) {
        usage.inputTokens += Number(event.usage.input_tokens ?? 0);
        usage.outputTokens += Number(event.usage.output_tokens ?? 0);
      }
    } catch {
      messages.push(trimmed);
    }
  }

  return {
    text: messages.join('\n').trim() || output.split('\n').filter(line => line.trim()).join('\n').trim(),
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  };
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
