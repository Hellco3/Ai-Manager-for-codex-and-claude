import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright';

const ROOT_URL = 'http://localhost:5173/?lang=en';
const TMP_DIR = path.join(os.tmpdir(), 'ai-manager-e2e');
const IMAGE_NAME = 'e2e-image.png';
const TEXT_NAME = 'e2e-note.md';
const EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAQAAAAAYLlVAAAAm0lEQVR4Ae3XwQmAMAwF0f7/p7s3' +
  'dA2NROm4tW7x8YgnPZXoqBYwygJyIhQtdgQABAgQIECBAgAABAgQIECBAgAABAv4t4DccnE9vrFVs' +
  'yqS/fWznEtCG2l9VmOAXoJ1i8LojRxur2jcWcA6i/K3PaY5E9O+V1YQUAECEBAgQIAAAQIECBAgQIA' +
  'AAQIECBAgQKD/Aj8B7N0ANKPOuUMAAAAASUVORK5CYII=';

function expect(condition, message) {
  assert.ok(condition, message);
}

async function createFixtures() {
  await fs.mkdir(TMP_DIR, { recursive: true });
  const imagePath = path.join(TMP_DIR, IMAGE_NAME);
  const textPath = path.join(TMP_DIR, TEXT_NAME);
  await fs.writeFile(imagePath, Buffer.from(PNG_BASE64, 'base64'));
  await fs.writeFile(textPath, '# E2E note\n\nThis attachment is used by Playwright.\n', 'utf8');
  return { imagePath, textPath };
}

async function setupMocks(page, assetStore) {
  await page.exposeFunction('registerUploadAsset', async ({ storageKey, bytes, mimeType }) => {
    assetStore.set(storageKey, { body: Buffer.from(bytes), mimeType });
  });

  await page.route('**/api/uploads/*', async (route) => {
    const url = new URL(route.request().url());
    const storageKey = decodeURIComponent(url.pathname.split('/').pop() ?? '');
    const asset = assetStore.get(storageKey);
    if (!asset) {
      await route.fulfill({ status: 404, body: 'missing upload' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: asset.mimeType,
      body: asset.body,
    });
  });

  await page.addInitScript(() => {
    const sessions = new Map();
    const listeners = new Map();
    let sessionCounter = 0;
    let attachmentCounter = 0;

    class MockEventSource {
      constructor(url) {
        this.url = url;
        this.readyState = 1;
        this.onmessage = null;
        this.onerror = null;
        const existing = listeners.get(url) ?? [];
        existing.push(this);
        listeners.set(url, existing);
      }

      close() {
        this.readyState = 2;
        const existing = listeners.get(this.url) ?? [];
        listeners.set(
          this.url,
          existing.filter((entry) => entry !== this),
        );
      }
    }

    const emit = (sessionId, payload, delay = 0) => {
      const url = `/api/sessions/${sessionId}/stream`;
      window.setTimeout(() => {
        const targets = listeners.get(url) ?? [];
        for (const target of targets) {
          target.onmessage?.({ data: JSON.stringify(payload) });
        }
      }, delay);
    };

    const json = (payload, status = 200) =>
      Promise.resolve(
        new Response(JSON.stringify(payload), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const streamReply = (sessionId, message) => {
      emit(sessionId, { type: 'message:chunk', chunk: '' }, 40);
      emit(sessionId, { type: 'message:chunk', chunk: 'Working on ' }, 120);
      emit(sessionId, { type: 'message:chunk', chunk: `"${message}"` }, 220);
      emit(
        sessionId,
        {
          type: 'message:complete',
          role: 'assistant',
          content: `Completed reply for: ${message}`,
          timestamp: Date.now() + 320,
        },
        320,
      );
    };

    const originalFetch = window.fetch.bind(window);

    window.EventSource = MockEventSource;

    window.fetch = async (input, init = {}) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url, window.location.origin);
      const method = request.method.toUpperCase();

      if (url.pathname === '/api/tasks' && method === 'POST') {
        const body = JSON.parse(await request.text());
        const sessionId = `session-${++sessionCounter}`;
        sessions.set(sessionId, {
          sessionId,
          status: 'chatting',
          mode: 'chat-first',
          task: body.task,
          messages: [],
          attachments: {},
        });

        if (!body.deferInitialMessage) {
          streamReply(sessionId, body.task);
        }

        return json({ sessionId, status: 'chatting', workspaceDir: body.workspaceDir ?? null });
      }

      if (url.pathname === '/api/uploads' && method === 'POST') {
        const formData = await request.formData();
        const sessionId = String(formData.get('sessionId'));
        const session = sessions.get(sessionId);
        const files = formData.getAll('files');
        const attachments = [];

        for (const file of files) {
          const storageKey = `upload-${++attachmentCounter}-${file.name}`;
          const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
          await window.registerUploadAsset({ storageKey, bytes, mimeType: file.type || 'application/octet-stream' });

          const attachment = {
            id: `attachment-${attachmentCounter}`,
            sessionId,
            storageKey,
            originalName: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            status: 'ready',
            type: file.type.startsWith('image/') ? 'image' : 'file',
            createdAt: Date.now(),
          };

          attachments.push(attachment);
          if (session) {
            session.attachments[attachment.id] = attachment;
          }
        }

        return json({ files: attachments });
      }

      const messageMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/message$/);
      if (messageMatch && method === 'POST') {
        const sessionId = messageMatch[1];
        const body = JSON.parse(await request.text());
        const session = sessions.get(sessionId);
        session?.messages.push({
          role: 'user',
          content: body.message,
          timestamp: Date.now(),
          attachmentIds: body.attachmentIds,
        });
        streamReply(sessionId, body.message || 'attachment');
        return json({ accepted: true });
      }

      const confirmMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/confirm$/);
      if (confirmMatch && method === 'POST') {
        return json({ accepted: true });
      }

      const workspaceMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/workspace$/);
      if (workspaceMatch && method === 'POST') {
        const body = JSON.parse(await request.text());
        return json({ workspaceDir: body.workspaceDir });
      }

      const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
      if (taskMatch && method === 'GET') {
        const session = sessions.get(taskMatch[1]);
        if (!session) {
          return json({ error: 'Session not found' }, 404);
        }
        return json({
          sessionId: session.sessionId,
          status: session.status,
          mode: session.mode,
          task: session.task,
          subtaskStates: {},
          messages: session.messages,
          attachments: session.attachments,
          costStats: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }

      return originalFetch(input, init);
    };
  });
}

async function sendChatMessage(page, text, { expectStreaming = true } = {}) {
  const input = page.getByLabel('Message input');
  await input.fill(text);
  await page.getByLabel('Send').click();

  if (expectStreaming) {
    await page.waitForSelector('text=Thinking...', { timeout: 3000 });
  }

  await page.waitForSelector(`text=Completed reply for: ${text}`, { timeout: 5000 });
}

async function dispatchPasteImage(page) {
  const bytes = Array.from(Buffer.from(PNG_BASE64, 'base64'));
  await page.evaluate(async ({ bytes }) => {
    const input = document.querySelector('textarea[aria-label="Message input"]');
    if (!(input instanceof HTMLTextAreaElement)) {
      throw new Error('message input not found');
    }

    const dataTransfer = new DataTransfer();
    const file = new File([new Uint8Array(bytes)], 'pasted-image.png', { type: 'image/png' });
    dataTransfer.items.add(file);

    const event = new ClipboardEvent('paste', {
      clipboardData: dataTransfer,
      bubbles: true,
      cancelable: true,
    });

    input.dispatchEvent(event);
  }, { bytes });
}

async function dispatchDrop(page, fileName) {
  const bytes = Array.from(Buffer.from(PNG_BASE64, 'base64'));
  await page.evaluate(async ({ bytes, fileName }) => {
    const dropZone = document.querySelector('[aria-describedby="upload-hint"]');
    if (!(dropZone instanceof HTMLElement)) {
      throw new Error('drop zone not found');
    }

    const dataTransfer = new DataTransfer();
    const file = new File([new Uint8Array(bytes)], fileName, { type: 'image/png' });
    dataTransfer.items.add(file);

    for (const type of ['dragenter', 'dragover', 'drop']) {
      const event = new DragEvent(type, {
        dataTransfer,
        bubbles: true,
        cancelable: true,
      });
      dropZone.dispatchEvent(event);
    }
  }, { bytes, fileName });
}

async function run() {
  const fixtures = await createFixtures();
  const browser = await chromium.launch({ headless: true, executablePath: EDGE_PATH });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const assetStore = new Map();
  const consoleMessages = [];

  page.on('console', (msg) => {
    if (msg.type() === 'warning' || msg.type() === 'error') {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    consoleMessages.push(`[pageerror] ${error.message}`);
  });

  await setupMocks(page, assetStore);
  await page.goto(ROOT_URL, { waitUntil: 'networkidle' });

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByLabel('Add file').click();
  const chooser = await chooserPromise;
  await chooser.setFiles([fixtures.imagePath, fixtures.textPath]);

  await page.waitForSelector(`text=${IMAGE_NAME}`);
  await page.waitForSelector(`text=${TEXT_NAME}`);

  await page.getByLabel('Message input').fill('Attachment round-trip');
  await page.getByLabel('Send').click();

  await page.waitForSelector(`text=Completed reply for: Attachment round-trip`, { timeout: 5000 });
  await page.waitForSelector(`button[aria-label="Preview ${IMAGE_NAME}"]`, { timeout: 5000 });
  await page.waitForSelector(`text=${TEXT_NAME}`, { timeout: 5000 });

  await page.getByRole('button', { name: `Preview ${IMAGE_NAME}` }).click();
  await page.waitForSelector('[role="dialog"]', { timeout: 3000 });
  await page.keyboard.press('Escape');
  await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 3000 });

  await dispatchPasteImage(page);
  await page.waitForSelector('text=pasted-image.png', { timeout: 5000 });

  await page.evaluate(() => {
    const dropZone = document.querySelector('[aria-describedby="upload-hint"]');
    if (!(dropZone instanceof HTMLElement)) {
      throw new Error('drop zone not found');
    }
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(['drop'], 'drag-image.png', { type: 'image/png' }));
    const enterEvent = new DragEvent('dragenter', { dataTransfer, bubbles: true, cancelable: true });
    dropZone.dispatchEvent(enterEvent);
  });
  await page.waitForSelector('text=Drop to upload', { timeout: 3000 });
  await dispatchDrop(page, 'drag-image.png');
  await page.waitForSelector('text=Drop to upload', { state: 'hidden', timeout: 3000 });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(200);
  expect(await page.getByRole('button', { name: 'Execution' }).isVisible(), 'mobile execution button should be visible');
  await page.getByRole('button', { name: 'Execution' }).click();
  await page.waitForFunction(() => document.querySelector('.drawer-shell')?.getAttribute('aria-hidden') === 'false');
  await page.getByRole('button', { name: 'Close execution panel' }).first().click();
  await page.waitForFunction(() => document.querySelector('.drawer-shell')?.getAttribute('aria-hidden') === 'true');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(200);

  for (let index = 0; index < 8; index += 1) {
    await sendChatMessage(page, `message-${index}`);
  }

  const scrollMetrics = await page.locator('.chat-shell .chat-scroll').first().evaluate((element) => ({
    scrollTop: element.scrollTop,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  expect(
    scrollMetrics.scrollTop + scrollMetrics.clientHeight >= scrollMetrics.scrollHeight - 24,
    'message list should stay scrolled to the bottom',
  );

  const hardErrors = consoleMessages.filter((message) => message.includes('[error]') || message.includes('[pageerror]'));
  expect(hardErrors.length === 0, `console errors detected:\n${hardErrors.join('\n')}`);

  await browser.close();
  return {
    warnings: consoleMessages.filter((message) => message.includes('[warning]')),
  };
}

export { run };

if (typeof process !== 'undefined' && import.meta.url === `file://${process.argv[1]}`) {
  run()
    .then((result) => {
      if (result.warnings.length > 0) {
        console.log(result.warnings.join('\n'));
      }
      console.log('Playwright e2e passed.');
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
