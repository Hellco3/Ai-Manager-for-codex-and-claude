import Anthropic from '@anthropic-ai/sdk';
import { TaskDecomposition } from '@ai_manager/shared';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const DECOMPOSITION_JSON_SCHEMA = {
  type: 'object' as const,
  properties: {
    overview: { type: 'string', description: 'Brief overview of the decomposition strategy' },
    subtasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Unique subtask identifier (e.g., "task-1", "task-2")' },
          kind: {
            type: 'string',
            enum: ['code', 'analysis', 'design', 'research', 'integration'],
            description: 'Type of subtask.',
          },
          description: { type: 'string', description: 'Detailed description of what this subtask should accomplish' },
          dependencies: {
            type: 'array',
            items: { type: 'string' },
            description: 'IDs of subtasks that must complete before this one can start',
          },
          priority: { type: 'integer', minimum: 1, maximum: 10, description: 'Priority (higher = more urgent)' },
          estimatedComplexity: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'Estimated complexity level',
          },
        },
        required: ['id', 'kind', 'description', 'dependencies', 'priority', 'estimatedComplexity'],
        additionalProperties: false,
      },
      description: 'Array of subtasks that together accomplish the user task',
    },
    executionOrder: {
      type: 'array',
      items: { type: 'string' },
      description: 'Ordered list of subtask IDs representing the recommended execution sequence',
    },
    estimatedTimeMinutes: { type: 'number', description: 'Estimated total time in minutes' },
  },
  required: ['overview', 'subtasks', 'executionOrder'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You are an expert task decomposition engine. Given a user's task description, decompose it into discrete, independently executable subtasks.

## Task Kind Classification Rules:
- **code**: Any subtask involving writing, modifying, or generating code. These will be executed by a coding agent (Codex).
- **analysis**: Analyzing code, data, or requirements; answering questions; code review
- **design**: Designing architecture, UI/UX, data models, API schemas
- **research**: Investigating external information, APIs, libraries, or documentation
- **integration**: Wiring components together, configuring tools, writing glue code

## Decomposition Rules:
1. Each subtask must be CLEARLY and SPECIFICALLY described
2. Mark dependencies explicitly
3. Priority 1-10; reserve 8-10 for blocker/critical path items
4. For "code" subtasks, specify the file/module to create or modify
5. For "analysis" subtasks, state the specific question to answer
6. For "design" subtasks, state the deliverable
7. The executionOrder should reflect the dependency DAG
8. MINIMIZE dependencies: if two subtasks can run in parallel, DON'T add artificial dependencies between them

## Subtask Granularity:
- A subtask should take 2-15 minutes of agent work
- If a subtask is too broad, SPLIT it further
- If a subtask is trivial, MERGE it with related work

You MUST respond with ONLY valid JSON matching the specified schema. No other text.`;

/**
 * Decompose a user task into subtasks via Claude API through CCSwitch.
 */
export async function decomposeTask(userTask: string): Promise<{
  decomposition: typeof TaskDecomposition._type;
  inputTokens: number;
  outputTokens: number;
}> {
  logger.info({ baseUrl: config.ANTHROPIC_BASE_URL }, 'Starting task decomposition via CCSwitch...');

  const anthropic = new Anthropic({
    apiKey: config.ANTHROPIC_API_KEY,
    baseURL: config.ANTHROPIC_BASE_URL,
  });

  const startTime = Date.now();

  const response = await anthropic.messages.create({
    model: config.DECOMPOSER_MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userTask }],
  });

  const durationMs = Date.now() - startTime;

  // Extract text from response
  const textBlocks = response.content.filter(b => b.type === 'text');
  const text = textBlocks.map(b => (b as any).text).join('');

  if (!text) {
    throw new Error('No text in LLM response during decomposition');
  }

  // Parse JSON from response (CCSwitch might not support json_schema output_config)
  let raw: any;
  try {
    const jsonStr = text.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
    raw = JSON.parse(jsonStr);
  } catch (err) {
    logger.error({ text: text.slice(0, 500) }, 'Failed to parse decomposition JSON');
    // Retry: maybe the response has embedded JSON
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        raw = JSON.parse(match[0]);
      } catch (err2) {
        throw new Error(`Failed to parse decomposition output: ${err}`);
      }
    } else {
      throw new Error(`Failed to parse decomposition output: ${err}`);
    }
  }

  // Normalize: fix common LLM mistakes (converting string IDs to numbers, etc.)
  if (raw && Array.isArray(raw.subtasks)) {
    raw.subtasks = raw.subtasks.map((st: any) => ({
      ...st,
      id: String(st.id ?? ''),
      kind: String(st.kind ?? 'code'),
      description: String(st.description ?? ''),
      dependencies: Array.isArray(st.dependencies) ? st.dependencies.map(String) : [],
      priority: typeof st.priority === 'number' ? st.priority : 5,
      estimatedComplexity: ['low', 'medium', 'high'].includes(st.estimatedComplexity) ? st.estimatedComplexity : 'medium',
    }));
  }
  if (raw && Array.isArray(raw.executionOrder)) {
    raw.executionOrder = raw.executionOrder.map(String);
  }
  if (raw && !raw.overview) {
    raw.overview = 'Task decomposition';
  }

  // Validate against our Zod schema
  const parsed = TaskDecomposition.safeParse(raw);
  if (!parsed.success) {
    logger.error({
      errors: parsed.error.flatten(),
      raw: JSON.stringify(raw).slice(0, 500),
    }, 'Decomposition validation failed');
    throw new Error(`Decomposition output doesn't match expected schema: ${JSON.stringify(parsed.error.flatten())}`);
  }

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;

  logger.info({
    subtaskCount: parsed.data.subtasks.length,
    inputTokens,
    outputTokens,
    durationMs,
  }, 'Task decomposition complete via CCSwitch');

  return { decomposition: parsed.data, inputTokens, outputTokens };
}
