import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env from project root (server/src/config.ts → server/ → project root/)
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..', '..');
dotenvConfig({ path: resolve(projectRoot, '.env') });

function getApiKey(): string {
  // CCSwitch uses PROXY_MANAGED as auth token — no real key needed
  return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || 'PROXY_MANAGED';
}

export const config = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  HOST: process.env.HOST || '0.0.0.0',

  // Anthropic API — used via CCSwitch proxy
  // CCSwitch listens on localhost:15721, accepts Anthropic-format requests
  get ANTHROPIC_API_KEY() { return getApiKey(); },
  ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || 'http://127.0.0.1:15721',

  // Models — CCSwitch mapping:
  // claude-opus-4-8  → deepseek-v4-pro
  // claude-sonnet-5   → deepseek-v4-pro
  DECOMPOSER_MODEL: process.env.DECOMPOSER_MODEL || 'claude-opus-4-8',
  EXECUTOR_MODEL: process.env.EXECUTOR_MODEL || 'claude-sonnet-5',
  CLAUDE_CODE_CLI_PATH: process.env.CLAUDE_CODE_CLI_PATH || 'claude',
  CLAUDE_CODE_TIMEOUT_MS: parseInt(process.env.CLAUDE_CODE_TIMEOUT_MS || '600000', 10),

  // Codex CLI
  CODEX_CLI_PATH: process.env.CODEX_CLI_PATH || 'codex',
  // Leave undefined to use the model configured by the local Codex CLI.
  CODEX_MODEL: process.env.CODEX_MODEL || undefined,
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
  // CCSwitch handles auth — no API key validation needed
  return errors;
}
