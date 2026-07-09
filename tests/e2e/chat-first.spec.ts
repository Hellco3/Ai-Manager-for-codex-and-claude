import { expect, test } from '@playwright/test';

const baseURL = 'http://localhost:5173';

const attachment = {
  id: 'att-1',
  sessionId: 'session-1',
  storageKey: 'uploads/test.txt',
  originalName: 'test-upload.txt',
  mimeType: 'text/plain',
  size: 24,
  status: 'ready',
  type: 'file' as const,
  createdAt: Date.now(),
};

const decomposition = {
  overview: 'This task will produce a small Python calculator with CLI input handling and tests.',
  executionOrder: ['plan', 'code', 'verify'],
  estimatedTimeMinutes: 3,
  subtasks: [
    {
      id: 'plan',
      kind: 'analysis',
      description: 'Plan the calculator structure and supported operations.',
      dependencies: [],
      priority: 2,
      estimatedComplexity: 'low',
    },
    {
      id: 'code',
      kind: 'code',
      description: 'Implement the calculator in Python with add, subtract, multiply, divide.',
      dependencies: ['plan'],
      priority: 1,
      estimatedComplexity: 'medium',
    },
    {
      id: 'verify',
      kind: 'integration',
      description: 'Validate the script output and edge cases.',
      dependencies: ['code'],
      priority: 2,
      estimatedComplexity: 'low',
    },
  ],
};

const sessionState = {
  sessionId: 'session-1',
  status: 'chatting',
  task: '你好',
  mode: 'chat-first',
  subtaskStates: {},
  messages: [],
  attachments: {},
  workspaceDir: 'E:/Code/ai_manager',
  costStats: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

async function installApiMock(page: import('@playwright/test').Page) {
  await page.addInitScript(
    ({ attachment, decomposition, sessionState }) => {
      type SessionState = typeof sessionState;
      type EventPayload = Record<string, unknown>;

      const state: {
        session: SessionState;
        listeners: Map<string, Set<(event: MessageEvent) => void>>;
      } = {
        session: structuredClone(sessionState),
        listeners: new Map(),
      };

      const schedule = (delay: number, event: EventPayload) => {
        window.setTimeout(() => {
          const listeners = state.listeners.get(state.session.sessionId);
          if (!listeners) return;
          const message = new MessageEvent('message', { data: JSON.stringify(event) });
          listeners.forEach((listener) => listener(message));
        }, delay);
      };

      const okJson = (payload: unknown) =>
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

      class MockEventSource extends EventTarget {
        url: string;
        readyState = 1;
        onmessage: ((event: MessageEvent) => void) | null = null;
        onerror: ((event: Event) => void) | null = null;

        constructor(url: string) {
          super();
          this.url = url;
          const sessionId = url.split('/sessions/')[1]?.split('/stream')[0] ?? state.session.sessionId;
          if (!state.listeners.has(sessionId)) {
            state.listeners.set(sessionId, new Set());
          }
          state.listeners.get(sessionId)?.add((event) => {
            this.onmessage?.(event);
          });
        }

        close() {
          this.readyState = 2;
        }
      }

      const originalFetch = window.fetch.bind(window);
      Object.defineProperty(window, 'EventSource', {
        configurable: true,
        writable: true,
        value: MockEventSource,
      });

      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url.endsWith('/api/tasks') && init?.method === 'POST') {
          state.session.messages = [];
          state.session.subtaskStates = {};
          state.session.attachments = {};
          state.session.status = 'chatting';
          return okJson({
            sessionId: state.session.sessionId,
            status: state.session.status,
            workspaceDir: state.session.workspaceDir,
          });
        }

        if (url.endsWith(`/api/tasks/${state.session.sessionId}`)) {
          return okJson(state.session);
        }

        if (url.endsWith('/api/sessions/workspace-test') && init?.method === 'POST') {
          return okJson({ ok: true });
        }

        if (url.endsWith(`/api/sessions/${state.session.sessionId}/workspace`) && init?.method === 'POST') {
          const body = JSON.parse(String(init.body ?? '{}'));
          state.session.workspaceDir = body.workspaceDir;
          return okJson({ ok: true });
        }

        if (url.endsWith('/api/uploads') && init?.method === 'POST') {
          state.session.attachments = { [attachment.id]: attachment };
          return okJson({ files: [attachment] });
        }

        if (url.includes('/api/uploads/')) {
          return new Response('test attachment content', { status: 200 });
        }

        if (url.endsWith(`/api/sessions/${state.session.sessionId}/message`) && init?.method === 'POST') {
          const body = JSON.parse(String(init.body ?? '{}'));
          state.session.messages.push({
            role: 'user',
            content: body.message,
            timestamp: Date.now(),
            attachmentIds: body.attachmentIds,
          });

          if (body.message === '你好') {
            schedule(120, { type: 'message:chunk', chunk: '你' });
            schedule(220, { type: 'message:chunk', chunk: '好！' });
            schedule(360, {
              type: 'message:complete',
              id: 'msg-1',
              role: 'assistant',
              content: '你好！我已准备好协助你处理任务。',
              timestamp: Date.now(),
            });
          } else {
            schedule(120, { type: 'message:chunk', chunk: '这个任务适合拆解执行。' });
            schedule(320, {
              type: 'message:complete',
              id: 'msg-2',
              role: 'assistant',
              content: '这个任务适合拆解执行。你可以点击“开始任务”继续。',
              timestamp: Date.now(),
            });
          }

          return okJson({ ok: true });
        }

        if (url.endsWith(`/api/sessions/${state.session.sessionId}/confirm`) && init?.method === 'POST') {
          state.session.status = 'executing';
          state.session.decomposition = decomposition;

          schedule(80, { type: 'status:progress', message: '正在处理中...', step: 'decompose', progress: 12 });
          schedule(180, { type: 'stage:awaiting_review', decomposition });
          schedule(360, { type: 'stage:started', stage: 'execute', timestamp: Date.now() });
          schedule(420, { type: 'subtask:queued', subtaskId: 'plan', kind: 'analysis', description: decomposition.subtasks[0].description });
          schedule(500, { type: 'subtask:started', subtaskId: 'plan', kind: 'analysis', description: decomposition.subtasks[0].description, timestamp: Date.now() });
          schedule(620, { type: 'subtask:completed', subtaskId: 'plan', result: 'Plan complete', durationMs: 180 });
          schedule(720, { type: 'subtask:started', subtaskId: 'code', kind: 'code', description: decomposition.subtasks[1].description, timestamp: Date.now() });
          schedule(860, { type: 'subtask:progress', subtaskId: 'code', chunk: 'calculator.py created\n' });
          schedule(980, { type: 'subtask:completed', subtaskId: 'code', result: 'calculator.py created', durationMs: 250 });
          schedule(1080, { type: 'subtask:started', subtaskId: 'verify', kind: 'integration', description: decomposition.subtasks[2].description, timestamp: Date.now() });
          schedule(1200, { type: 'subtask:completed', subtaskId: 'verify', result: 'Validation passed', durationMs: 180 });
          schedule(1340, {
            type: 'session:complete',
            result: {
              summary: 'Python calculator implementation complete.',
              deliverables: ['calculator.py', 'basic validation notes'],
              totalCost: 0.0123,
              totalDurationMs: 610,
              costBreakdown: [
                { model: 'claude', inputTokens: 100, outputTokens: 200, costUSD: 0.0061, durationMs: 280 },
                { model: 'codex', inputTokens: 120, outputTokens: 260, costUSD: 0.0062, durationMs: 330 },
              ],
            },
          });
          schedule(1420, {
            type: 'message:complete',
            id: 'msg-3',
            role: 'assistant',
            content: '已完成：生成了一个 Python 计算器，并完成了基本校验。',
            timestamp: Date.now(),
          });

          return okJson({ ok: true });
        }

        return originalFetch(input, init);
      };
    },
    { attachment, decomposition, sessionState },
  );
}

test.describe('chat-first UI', () => {
  test('desktop flow, upload flow, console and network checks', async ({ page }) => {
    const consoleMessages: string[] = [];
    const failedResponses: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        consoleMessages.push(`${msg.type()}: ${msg.text()}`);
      }
    });

    page.on('response', (response) => {
      if (response.status() >= 400) {
        failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    await installApiMock(page);
    await page.goto(baseURL, { waitUntil: 'networkidle' });

    await expect(page.getByText('你好，我是 AI 任务编排助手')).toBeVisible();
    await expect(page.getByText('Workspace')).toBeVisible();
    await expect(page.getByLabel('Message input')).toBeVisible();

    const sendButton = page.getByRole('button', { name: '发送' });
    await expect(sendButton).toHaveClass(/rounded-full/);
    await expect(sendButton).toHaveClass(/bg-purple-500/);

    await page.getByLabel('Message input').fill('你好');
    await sendButton.click();
    await expect(page.getByText('你好！我已准备好协助你处理任务。')).toBeVisible();

    const bubbles = page.locator('.message-bubble-user, .message-bubble-assistant');
    await expect(bubbles).toHaveCount(3);
    const bubbleOverflow = await bubbles.evaluateAll((nodes) =>
      nodes.every((node) => node.scrollWidth <= node.clientWidth || getComputedStyle(node).overflow !== 'visible'),
    );
    expect(bubbleOverflow).toBeTruthy();

    await page.getByLabel('Message input').fill('帮我写一个 Python 计算器');
    await sendButton.click();
    await expect(page.getByRole('button', { name: '开始任务' })).toBeVisible();
    await page.getByRole('button', { name: '开始任务' }).click();

    await expect(page.getByText('正在处理中...')).toBeVisible();
    await expect(page.getByText('This task will produce a small Python calculator')).toBeVisible();
    await expect(page.getByText('Plan the calculator structure and supported operations.')).toBeVisible();
    await expect(page.getByText('已完成：生成了一个 Python 计算器，并完成了基本校验。')).toBeVisible();
    await expect(page.getByText('正在处理中...')).toBeHidden();

    const executionAside = page.locator('aside').first();
    await expect.poll(async () => {
      const box = await executionAside.boundingBox();
      return Math.round(box?.width ?? 0);
    }).toBeGreaterThanOrEqual(410);

    const uploadInput = page.locator('input[type="file"]').first();
    await uploadInput.setInputFiles({
      name: 'test-upload.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('playwright upload payload'),
    });
    await expect(page.getByText('test-upload.txt')).toBeVisible();

    await page.getByLabel('Message input').fill('附上一个测试文件');
    await sendButton.click();
    await expect(page.getByText('附上一个测试文件')).toBeVisible();

    expect(consoleMessages).toEqual([]);
    expect(failedResponses).toEqual([]);
  });

  test('mobile drawer and sticky input', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await installApiMock(page);
    await page.goto(baseURL, { waitUntil: 'networkidle' });

    const executionButton = page.getByRole('button', { name: '执行面板' });
    await expect(executionButton).toBeVisible();
    await executionButton.click();

    const drawer = page.locator('.drawer-shell');
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveClass(/transition-\[transform,opacity\]/);

    const inputBox = page.locator('[aria-describedby="upload-hint"]').last();
    const inputBottomGap = await inputBox.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return Math.round(window.innerHeight - rect.bottom);
    });
    expect(inputBottomGap).toBeLessThanOrEqual(24);

    await page.getByLabel('关闭执行面板').click();
    await expect(drawer).toHaveAttribute('aria-hidden', 'true');

    await context.close();
  });
});
