import Anthropic from '@anthropic-ai/sdk';
import { TaskDecomposition } from '@ai_manager/shared';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

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
            description: 'Type of subtask. "code" for coding/implementation, "analysis" for analysis, "design" for design/architecture, "research" for research/investigation, "integration" for integration/plumbing.',
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
      description: 'Array of subtasks that together accomplish the user\'s task',
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

const SYSTEM_PROMPT = `You are an expert task decomposition engine. Given a user's task description, you MUST decompose it into discrete, independently executable subtasks.

## Task Kind Classification Rules:
- **code**: Any subtask involving writing, modifying, or generating code (e.g., "create a React component", "implement an API endpoint", "fix a bug"). These will be executed by a coding agent.
- **analysis**: Analyzing existing code, data, or requirements; answering questions about implementation approaches; code review
- **design**: Designing architecture, UI/UX, data models, API schemas; producing design documents or diagrams
- **research**: Investigating external information, APIs, libraries, or documentation; gathering requirements
- **integration**: Wiring components together, configuring tools, setting up infrastructure, writing glue code

## Decomposition Rules:
1. Each subtask must be CLEARLY and SPECIFICALLY described — vague tasks like "do the implementation" are unacceptable
2. Mark dependencies explicitly: if subtask B needs subtask A's output to start, add A's ID to B's dependencies
3. Priority 1-10; reserve 8-10 for blocker/critical path items
4. For "code" subtasks, specify the file/module to create or modify and the expected output
5. For "analysis" subtasks, state the specific question to answer
6. For "design" subtasks, state the deliverable (e.g., "API design document", "component tree")
7. The executionOrder should reflect the dependency DAG (dependencies before dependents)
8. MINIMIZE dependencies: if two subtasks can run in parallel, DON'T add artificial dependencies between them

## Subtask Granularity:
- A subtask should take 2-15 minutes of agent work
- If a subtask is too broad (e.g., "build the entire backend"), SPLIT it further
- If a subtask is trivial (single trivial action), MERGE it with related work

Output JSON conforming to the specified schema. Do NOT include any text outside the JSON.`;

export async function decomposeTask(userTask: string): Promise<{ decomposition: typeof TaskDecomposition._type; inputTokens: number; outputTokens: number }> {
  logger.info('Starting task decomposition...');

  const startTime = Date.now();
  const response = await anthropic.messages.create({
    model: config.DECOMPOSER_MODEL,
    max_tokens: 16000,
    thinking: { type: 'enabled', budget_tokens: 4000 },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userTask }],
    // Use JSON Schema structured output for guaranteed valid JSON
    output_config: {
      format: {
        type: 'json_schema',
        schema: DECOMPOSITION_JSON_SCHEMA,
      },
      effort: 'xhigh',
    },
  });

  const durationMs = Date.now() - startTime;

  // Extract text from response
  const textBlocks = response.content.filter(b => b.type === 'text');
  const text = textBlocks.map(b => (b as any).text).join('');

  if (!text) {
    throw new Error('No text in Claude response during decomposition');
  }

  // Parse JSON from response
  let raw: any;
  try {
    // The response might include markdown code fences — strip them
    const jsonStr = text.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
    raw = JSON.parse(jsonStr);
  } catch (err) {
    logger.error({ text: text.slice(0, 500) }, 'Failed to parse decomposition JSON');
    throw new Error(`Failed to parse Claude decomposition output: ${err}`);
  }

  // Validate against our Zod schema
  const parsed = TaskDecomposition.safeParse(raw);
  if (!parsed.success) {
    logger.error({ errors: parsed.error.flatten(), raw: JSON.stringify(raw).slice(0, 500) }, 'Decomposition validation failed');
    throw new Error(`Decomposition output doesn't match expected schema: ${JSON.stringify(parsed.error.flatten())}`);
  }

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;

  logger.info({ subtaskCount: parsed.data.subtasks.length, inputTokens, outputTokens, durationMs }, 'Task decomposition complete');

  return {
    decomposition: parsed.data,
    inputTokens,
    outputTokens,
  };
}
