import { Router, Request, Response } from 'express';
import { sessionStore } from '../store/session-store.js';
import { attachmentStore } from '../store/attachment-store.js';
import { sseManager } from '../sse/manager.js';
import { logger } from '../utils/logger.js';
import { validateConfig } from '../config.js';

const router = Router();

// Validate API key on startup
const configErrors = validateConfig();

// Helper to get param as string (Express v5 returns string | string[])
const param = (req: Request, name: string): string => {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
};

// POST /api/tasks
router.post('/tasks', async (req: Request, res: Response) => {
  try {
    if (configErrors.length > 0) {
      res.status(500).json({ error: 'Server misconfigured', details: configErrors });
      return;
    }

    const { task, mode, workspaceDir, deferInitialMessage } = req.body;
    if (!task || typeof task !== 'string') {
      res.status(400).json({ error: 'Invalid task submission', details: 'task is required' });
      return;
    }

    const safeMode = (
      mode === 'semi-auto' ? 'semi-auto' :
      mode === 'chat-first' ? 'chat-first' :
      'auto'
    );

    // Create session
    const session = sessionStore.create(task, safeMode, workspaceDir);
    logger.info({ sessionId: session.sessionId, mode: safeMode, workspaceDir }, 'Task session created');

    // chat-first mode: don't decompose immediately, go to chatting phase
    if (safeMode === 'chat-first') {
      res.json({ sessionId: session.sessionId, status: 'chatting', workspaceDir: workspaceDir ?? null });

      if (deferInitialMessage) {
        return;
      }

      // Store the first user message
      sessionStore.addMessage(session.sessionId, 'user', task);

      // Fire off the chat-first phase (stream AI reply, no decomposition)
      const { orchestrator } = await import('../services/orchestrator.js');
      orchestrator.chatFirstPhase(session.sessionId, task).catch(err => {
        logger.error({ sessionId: session.sessionId, error: err }, 'Chat-first phase failed');
      });
      return;
    }

    // Traditional auto/semi-auto: fire decomposition immediately
    res.json({ sessionId: session.sessionId, status: session.status });

    const { orchestrator } = await import('../services/orchestrator.js');
    orchestrator.startSession(session.sessionId).catch(err => {
      logger.error({ sessionId: session.sessionId, error: err }, 'Orchestrator failed');
    });
  } catch (error) {
    logger.error({ error }, 'POST /api/tasks error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tasks/:id
router.get('/tasks/:id', (req: Request, res: Response) => {
  const id = param(req, 'id');
  const session = sessionStore.get(id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  res.json({
    sessionId: session.sessionId,
    status: session.status,
    mode: session.mode,
    task: session.task,
    decomposition: session.decomposition,
    subtaskStates: session.subtaskStates,
    messages: session.messages ?? [],
    attachments: Object.fromEntries(
      attachmentStore.getBySession(id).map((attachment) => [attachment.id, attachment]),
    ),
    workspaceDir: (session as any).workspaceDir ?? null,
    costStats: session.costStats,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  });
});

// POST /api/tasks/:id/approve
router.post('/tasks/:id/approve', async (req: Request, res: Response) => {
  const id = param(req, 'id');
  const session = sessionStore.get(id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  if (session.status !== 'awaiting_review') {
    res.status(400).json({ error: 'Session is not awaiting review' });
    return;
  }

  // Accept optional modified decomposition
  if (req.body.subtasks) {
    const decomposition = session.decomposition!;
    decomposition.subtasks = req.body.subtasks;
    sessionStore.setDecomposition(session.sessionId, decomposition);
  }

  // Resume execution
  const { orchestrator } = await import('../services/orchestrator.js');
  orchestrator.resumeAfterReview(session.sessionId).catch(err => {
    logger.error({ sessionId: session.sessionId, error: err }, 'Resume after review failed');
  });

  res.json({ accepted: true });
});

// POST /api/tasks/:id/cancel
router.post('/tasks/:id/cancel', async (req: Request, res: Response) => {
  const id = param(req, 'id');
  const session = sessionStore.get(id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  // Cancel the orchestrator (abort running subtasks + Codex processes)
  const { orchestrator } = await import('../services/orchestrator.js');
  orchestrator.cancelSession(id);

  sessionStore.updateStatus(id, 'cancelled');
  sseManager.broadcast(id, { type: 'session:error', error: 'Task cancelled by user' });
  sseManager.closeAll(id);

  res.json({ cancelled: true });
});

// POST /api/sessions/:id/message — send follow-up message within a session
router.post('/sessions/:id/message', async (req: Request, res: Response) => {
  const id = param(req, 'id');
  const session = sessionStore.get(id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const { message, attachmentIds } = req.body;
  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  // Validate attachment IDs belong to this session
  const ids: string[] = Array.isArray(attachmentIds) ? attachmentIds : [];
  if (ids.length > 0) {
    try {
      attachmentStore.assertAttachable(id, ids);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
      return;
    }
  }

  // In chat-first (chatting) mode: just have a conversation, no decomposition
  if (session.status === 'chatting') {
    sessionStore.addMessage(id, 'user', message.trim(), ids.length > 0 ? ids : undefined);

    // Broadcast user message
    sseManager.broadcast(id, {
      type: 'message:complete',
      content: message.trim(),
      role: 'user',
      timestamp: Date.now(),
      attachmentIds: ids.length > 0 ? ids : undefined,
    });

    // Generate streaming AI reply (no decomposition)
    const { orchestrator } = await import('../services/orchestrator.js');
    orchestrator.chatFirstPhase(id, message.trim(), ids.length > 0 ? ids : undefined).catch(err => {
      logger.error({ sessionId: id, error: err }, 'Chat reply failed');
    });

    res.json({ accepted: true });
    return;
  }

  // For terminal/idle states: stay in chat mode, require explicit confirm to re-decompose
  // This prevents the system from auto-triggering decomposition on a follow-up message.
  // The user must click the confirm button (POST /api/sessions/:id/confirm) to start execution.
  const terminalStates: Array<'completed' | 'failed' | 'cancelled' | 'awaiting_review' | 'timed_out'> = ['completed', 'failed', 'cancelled', 'awaiting_review', 'timed_out'];
  const claimed = sessionStore.tryTransitionStatus(id, terminalStates as any, 'chatting');
  if (!claimed) {
    res.status(409).json({ error: 'Session is currently processing. Please wait for it to complete before sending a message.' });
    return;
  }

  sessionStore.addMessage(id, 'user', message.trim(), ids.length > 0 ? ids : undefined);

  // Broadcast user message
  sseManager.broadcast(id, {
    type: 'message:complete',
    content: message.trim(),
    role: 'user',
    timestamp: Date.now(),
    attachmentIds: ids.length > 0 ? ids : undefined,
  });

  // Generate streaming AI reply only — no decomposition. User must explicitly confirm to start.
  const { orchestrator } = await import('../services/orchestrator.js');
  orchestrator.chatFirstPhase(id, message.trim(), ids.length > 0 ? ids : undefined).catch(err => {
    logger.error({ sessionId: id, error: err }, 'Chat reply failed');
  });

  res.json({ accepted: true });
});

// POST /api/sessions/:id/reconstruct — re-decompose remaining work
router.post('/sessions/:id/reconstruct', async (req: Request, res: Response) => {
  const id = param(req, 'id');
  const session = sessionStore.get(id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  // Atomically claim the session — only allow transition from terminal/idle states
  const claimed = sessionStore.tryTransitionStatus(
    id,
    ['completed', 'failed', 'cancelled', 'awaiting_review', 'timed_out'],
    'decomposing',
  );
  if (!claimed) {
    res.status(409).json({ error: 'Session is currently processing. Please wait.' });
    return;
  }

  const { orchestrator } = await import('../services/orchestrator.js');
  orchestrator.reconstructSession(id).catch(err => {
    logger.error({ sessionId: id, error: err }, 'Reconstruct session failed');
  });

  res.json({ accepted: true });
});

// POST /api/sessions/:id/confirm — confirm task and trigger decomposition (chat-first mode)
router.post('/sessions/:id/confirm', async (req: Request, res: Response) => {
  const id = param(req, 'id');
  const session = sessionStore.get(id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  // Allow confirm from chatting or terminal states
  if (session.status !== 'chatting' &&
      session.status !== 'completed' &&
      session.status !== 'failed' &&
      session.status !== 'cancelled') {
    res.status(409).json({ error: 'Session is currently processing. Please wait.' });
    return;
  }

  const { task: refinedTask, workspaceDir, message: confirmMessage } = req.body;

  // Save the user's confirmation message so it survives refresh
  if (confirmMessage && typeof confirmMessage === 'string' && confirmMessage.trim()) {
    sessionStore.addMessage(id, 'user', confirmMessage.trim());
    sseManager.broadcast(id, {
      type: 'message:complete',
      content: confirmMessage.trim(),
      role: 'user',
      timestamp: Date.now(),
    });
  }

  // Atomically claim
  const claimed = sessionStore.tryTransitionStatus(id, [session.status], 'decomposing');
  if (!claimed) {
    res.status(409).json({ error: 'Session state changed. Please try again.' });
    return;
  }

  // Update workspaceDir if provided
  if (workspaceDir) {
    sessionStore.setWorkspaceDir(id, workspaceDir);
  }

  // Trigger decomposition + execution
  const { orchestrator } = await import('../services/orchestrator.js');
  orchestrator.confirmAndDecompose(id, refinedTask).catch(err => {
    logger.error({ sessionId: id, error: err }, 'Confirm and decompose failed');
  });

  res.json({ accepted: true });
});

// POST /api/sessions/:id/workspace — update project workspace directory
router.post('/sessions/:id/workspace', async (req: Request, res: Response) => {
  const id = param(req, 'id');
  const session = sessionStore.get(id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const { workspaceDir } = req.body;
  if (!workspaceDir || typeof workspaceDir !== 'string') {
    res.status(400).json({ error: 'workspaceDir is required' });
    return;
  }

  // Validate path exists
  const fs = await import('fs/promises');
  try {
    await fs.access(workspaceDir);
  } catch {
    res.status(400).json({ error: `Directory not found: ${workspaceDir}` });
    return;
  }

  sessionStore.setWorkspaceDir(id, workspaceDir);
  sseManager.broadcast(id, {
    type: 'message:complete',
    content: `Workspace changed to: ${workspaceDir}`,
    role: 'system',
    timestamp: Date.now(),
  });

  res.json({ workspaceDir });
});

// GET /api/sessions/:id/stream
router.get('/sessions/:id/stream', (req: Request, res: Response) => {
  const sessionId = param(req, 'id');
  const session = sessionStore.get(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const lastEventId = req.headers['last-event-id'] as string | undefined;
  sseManager.register(sessionId, res, lastEventId);
});

export default router;
