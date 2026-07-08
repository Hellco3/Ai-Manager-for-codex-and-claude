import Anthropic from '@anthropic-ai/sdk';
import { type SubtaskState } from '@ai_manager/shared';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

/**
 * Aggregate subtask results into a final summary.
 * This is a lightweight pass — for Phase 1, it's a simple concatenation.
 * In later phases, we can call Claude again for a smarter synthesis.
 */
export async function aggregateResults(
  task: string,
  subtaskStates: Record<string, SubtaskState>,
): Promise<string> {
  const entries = Object.entries(subtaskStates);
  const completed = entries.filter(([_, s]) => s.status === 'completed');
  const failed = entries.filter(([_, s]) => s.status === 'failed');

  const parts: string[] = [];
  parts.push(`# Task Result Summary\n`);
  parts.push(`**Original Task**: ${task}\n`);
  parts.push(`**Completed**: ${completed.length}/${entries.length} subtasks\n`);

  for (const [id, state] of completed) {
    parts.push(`\n## ${id}: ${state.subtask.description}\n`);
    parts.push(state.result ?? '(no output)');
  }

  if (failed.length > 0) {
    parts.push(`\n## Failed Subtasks\n`);
    for (const [id, state] of failed) {
      parts.push(`- **${id}**: ${state.error ?? 'Unknown error'}`);
    }
  }

  return parts.join('\n');
}
