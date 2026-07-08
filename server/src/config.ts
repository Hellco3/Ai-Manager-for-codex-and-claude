import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env from project root (server/src/config.ts → server/ → project root/)
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..', '..');
dotenvConfig({ path: resolve(projectRoot, '.env') });

function getApiKey(): string {
  // env var passed inline takes priority over .env
  return process.env.ANTHROPIC_API_KEY || '';
}

export const config = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  HOST: process.env.HOST || '0.0.0.0',

  // Anthropic API — use getter so .env loading at import time takes effect
  get ANTHROPIC_API_KEY() { return getApiKey(); },
  DECOMPOSER_MODEL: process.env.DECOMPOSER_MODEL || 'claude-opus-4-8',
  EXECUTOR_MODEL: process.env.EXECUTOR_MODEL || 'claude-sonnet-5',

  // Codex CLI
  CODEX_CLI_PATH: process.env.CODEX_CLI_PATH || 'codex',
  CODEX_TIMEOUT_MS: parseInt(process.env.CODEX_TIMEOUT_MS || '300000', 10),
  CODEX_WORKER_TIMEOUT_MS: parseInt(process.env.CODEX_WORKER_TIMEOUT_MS || '180000', 10),

  // Orchestrator
  MAX_CONCURRENT_SUBTASKS: parseInt(process.env.MAX_CONCURRENT_SUBTASKS || '5', 10),
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES || '3', 10),
  TASK_TIMEOUT_MS: parseInt(process.env.TASK_TIMEOUT_MS || '1800000', 10),

  // SSE
  HEARTBEAT_INTERVAL_MS: 15000,
  MAX_EVENT_HISTORY: 1000,
};

export function validateConfig(): string[] {
  const errors: string[] = [];
  if (!config.ANTHROPIC_API_KEY) {
    errors.push('ANTHROPIC_API_KEY is not set. Set ANTHROPIC_API_KEY environment variable or create .env file.');
  }
  return errors;
}
