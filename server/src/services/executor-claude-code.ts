import { spawn, type ChildProcess } from 'child_process';
import { type Subtask } from '@ai_manager/shared';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export interface ClaudeCodeExecutionResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

function stopProcess(proc: ChildProcess): void {
  try { proc.kill('SIGTERM'); } catch { /* already stopped */ }
}

export async function executeClaudeCodeSubtask(
  subtask: Subtask,
  signal: AbortSignal,
  onProgress: (chunk: string) => void,
  workspaceDir?: string,
): Promise<ClaudeCodeExecutionResult> {
  const cwd = workspaceDir ?? process.cwd();
  const args = [
    '--print',
    '--output-format', 'stream-json',
    '--verbose',
    '--dangerously-skip-permissions',
    '--model', config.EXECUTOR_MODEL,
    `请在当前工作区直接完成以下代码任务：${subtask.description}\n\n必须实际读取和修改文件，并运行适当验证。完成后用简体中文简要列出修改文件和验证结果。`,
  ];

  logger.info({ subtaskId: subtask.id, cwd, model: config.EXECUTOR_MODEL }, 'Executing code subtask via Claude Code CLI');

  return new Promise((resolve, reject) => {
    const proc = spawn(config.CLAUDE_CODE_CLI_PATH, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      env: { ...process.env },
    });
    let stdout = '';
    let stderr = '';

    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      stopProcess(proc);
      cleanup();
      reject(new DOMException('Claude Code subtask cancelled', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });

    const timeout = setTimeout(() => {
      stopProcess(proc);
      cleanup();
      reject(new Error(`Claude Code CLI timed out after ${config.CLAUDE_CODE_TIMEOUT_MS}ms`));
    }, config.CLAUDE_CODE_TIMEOUT_MS);

    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stdout += text;
      onProgress(text);
    });
    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stderr += text;
      onProgress(text);
    });
    proc.on('error', (error) => {
      clearTimeout(timeout);
      cleanup();
      reject(new Error(`Claude Code CLI process error: ${error.message}`));
    });
    proc.on('close', (code) => {
      clearTimeout(timeout);
      cleanup();
      if (code !== 0) {
        reject(new Error(`Claude Code CLI exited with code ${code}: ${stderr.slice(-500)}`));
        return;
      }

      let result = '';
      let inputTokens = 0;
      let outputTokens = 0;
      for (const line of stdout.split('\n')) {
        try {
          const event = JSON.parse(line);
          if (event.type === 'assistant' && event.message?.content) {
            result += event.message.content
              .filter((block: any) => block.type === 'text')
              .map((block: any) => block.text)
              .join('');
          }
          if (event.type === 'result' && typeof event.result === 'string') result += event.result;
          const usage = event.usage ?? event.message?.usage;
          inputTokens += Number(usage?.input_tokens ?? 0);
          outputTokens += Number(usage?.output_tokens ?? 0);
        } catch { /* ignore incomplete/non-JSON lines */ }
      }
      resolve({ text: result.trim() || 'Claude Code 已完成代码任务。', inputTokens, outputTokens });
    });
  });
}
