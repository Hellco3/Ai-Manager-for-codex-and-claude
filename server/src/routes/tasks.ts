import { Router, Request, Response } from 'express';
import { sessionStore } from '../store/session-store.js';
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

    const { task, mode } = req.body;
    if (!task || typeof task !== 'string') {
      res.status(400).json({ error: 'Invalid task submission', details: 'task is required' });
      return;
    }

    const safeMode = mode === 'semi-auto' ? 'semi-auto' : 'auto';

    // Create session
    const session = sessionStore.create(task, safeMode);
    logger.info({ sessionId: session.sessionId, mode: safeMode }, 'Task session created');

    // Return immediately, processing happens asynchronously
    res.json({ sessionId: session.sessionId, status: session.status });

    // Fire off decomposition asynchronously
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
