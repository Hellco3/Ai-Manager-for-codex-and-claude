import Anthropic from '@anthropic-ai/sdk';
import { type Subtask } from '@ai_manager/shared';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const SYSTEM_PROMPTS: Record<string, string> = {
  analysis: `You are an expert analyst. Analyze the given task thoroughly and provide clear, actionable insights. Be structured and concise. Prefer Simplified Chinese in your response unless the task clearly requires another language.`,
  design: `You are an expert software architect. Design solutions that are practical, scalable, and well-documented. Include diagrams in text (ASCII or Mermaid). Prefer Simplified Chinese in your response unless the task clearly requires another language.`,
  research: `You are an expert researcher. Investigate the given topic and provide comprehensive findings with references and actionable recommendations. Prefer Simplified Chinese in your response unless the task clearly requires another language.`,
  integration: `You are an expert integration engineer. Explain how to wire components together clearly and precisely. Provide step-by-step instructions. Prefer Simplified Chinese in your response unless the task clearly requires another language.`,
};

export interface ClaudeExecutionResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

/**
 * Execute an analysis/design/research/integration subtask via Claude API.
 * Uses CCSwitch proxy at ANTHROPIC_BASE_URL — same as Claude Code.
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
      const truncated = depResult.length > 4000
        ? depResult.slice(0, 4000) + '\n... (truncated)'
        : depResult;
      contextBlocks.push(`--- Result of "${depId}" ---\n${truncated}`);
    }
  }

  const startedAt = Date.now();
  logger.info({ subtaskId: subtask.id, kind: subtask.kind, baseUrl: config.ANTHROPIC_BASE_URL }, 'Executing subtask via CCSwitch');

  // Check abort before starting
  if (signal.aborted) {
    throw new DOMException('Subtask cancelled before start', 'AbortError');
  }

  const anthropic = new Anthropic({
    apiKey: config.ANTHROPIC_API_KEY,
    baseURL: config.ANTHROPIC_BASE_URL,
  });

  const stream = anthropic.messages.stream({
    model: config.EXECUTOR_MODEL,
    max_tokens: 16000,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: [
        ...(contextBlocks.length > 0
          ? [{ type: 'text' as const, text: contextBlocks.join('\n\n') }]
          : []),
        { type: 'text' as const, text: `Task: ${subtask.description}\n\nPlease reply in clear, well-structured Simplified Chinese unless the task explicitly requires another language.` },
      ],
    }],
  });

  let fullText = '';

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
  }, 'Subtask completed via CCSwitch');

  return { text: fullText, inputTokens, outputTokens, durationMs };
}
