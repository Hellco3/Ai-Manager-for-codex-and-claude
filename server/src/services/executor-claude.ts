import Anthropic from '@anthropic-ai/sdk';
import { type Subtask } from '@ai_manager/shared';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { isRetryableError } from '../utils/retry.js';

const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

const SYSTEM_PROMPTS: Record<string, string> = {
  analysis: `You are an expert analyst. Analyze the given task thoroughly and provide clear, actionable insights. Be structured and concise.`,
  design: `You are an expert software architect. Design solutions that are practical, scalable, and well-documented. Include diagrams in text (ASCII or Mermaid).`,
  research: `You are an expert researcher. Investigate the given topic and provide comprehensive findings with references and actionable recommendations.`,
  integration: `You are an expert integration engineer. Explain how to wire components together clearly and precisely. Provide step-by-step instructions.`,
};

export interface ClaudeExecutionResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

/**
 * Execute an analysis/design/research/integration subtask via Claude API with streaming.
 * Supports abort signal for cancellation and returns token usage for cost tracking.
 */
export async function executeSubtask(
  subtask: Subtask,
  dependencyResults: Map<string, string>,
  signal: AbortSignal,
  onProgress: (chunk: string) => void,
): Promise<ClaudeExecutionResult> {
  const systemPrompt = SYSTEM_PROMPTS[subtask.kind] ?? SYSTEM_PROMPTS.analysis;

  // Build context from dependency results, truncated to avoid context overflow
  const contextBlocks: string[] = [];
  for (const depId of subtask.dependencies) {
    const depResult = dependencyResults.get(depId);
    if (depResult) {
      // Truncate each dependency result to max 4000 chars
      const truncated = depResult.length > 4000
        ? depResult.slice(0, 4000) + '\n... (truncated)'
        : depResult;
      contextBlocks.push(`--- Result of "${depId}" ---\n${truncated}`);
    }
  }

  const startedAt = Date.now();
  logger.info({ subtaskId: subtask.id, kind: subtask.kind, deps: subtask.dependencies.length }, 'Executing Claude subtask');

  // Check abort before starting
  if (signal.aborted) {
    throw new DOMException('Subtask cancelled before start', 'AbortError');
  }

  const abortHandler = () => {
    stream.controller.abort();
  };
  signal.addEventListener('abort', abortHandler, { once: true });

  const stream = anthropic.messages.stream({
    model: config.EXECUTOR_MODEL,
    max_tokens: 16000,
    thinking: { type: 'enabled', budget_tokens: 2000 },
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: [
        ...(contextBlocks.length > 0
          ? [{ type: 'text' as const, text: contextBlocks.join('\n\n') }]
          : []),
        { type: 'text' as const, text: `Task: ${subtask.description}\n\nProvide your response in clear, well-structured text.` },
      ],
    }],
  });

  let fullText = '';

  try {
    for await (const event of stream) {
      if (signal.aborted) {
        stream.controller.abort();
        throw new DOMException('Subtask cancelled', 'AbortError');
      }
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const text = (event.delta as any).text as string;
        fullText += text;
        onProgress(text);
      }
    }
  } finally {
    signal.removeEventListener('abort', abortHandler);
  }

  const finalMessage = await stream.finalMessage();
  const durationMs = Date.now() - startedAt;

  const inputTokens = finalMessage.usage?.input_tokens ?? 0;
  const outputTokens = finalMessage.usage?.output_tokens ?? 0;

  logger.info({
    subtaskId: subtask.id,
    outputLength: fullText.length,
    inputTokens,
    outputTokens,
    durationMs,
  }, 'Claude subtask completed');

  return { text: fullText, inputTokens, outputTokens, durationMs };
}
