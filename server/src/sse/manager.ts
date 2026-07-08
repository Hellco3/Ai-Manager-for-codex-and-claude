import { Response } from 'express';
import { type SSEEvent } from '@ai_manager/shared';
import { logger } from '../utils/logger.js';

export class SSEManager {
  private connections = new Map<string, Set<Response>>();
  private eventHistory = new Map<string, SSEEvent[]>();
  private heartbeatIntervals = new Map<string, ReturnType<typeof setInterval>>();

  register(sessionId: string, res: Response, lastEventId?: string): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Send initial session:created event
    const initPayload = `id: ${sessionId}:0\ndata: ${JSON.stringify({ id: `${sessionId}:0`, type: 'session:created', sessionId })}\n\n`;
    res.write(initPayload);

    // Replay missed events on reconnect
    if (lastEventId) {
      const history = this.eventHistory.get(sessionId) ?? [];
      const lastIndex = history.findIndex(e => e.id === lastEventId);
      if (lastIndex >= 0) {
        const missed = history.slice(lastIndex + 1);
        for (const event of missed) {
          res.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
        }
        logger.info({ sessionId, missedCount: missed.length }, 'SSE replay');
      }
    }

    // Track connection
    if (!this.connections.has(sessionId)) {
      this.connections.set(sessionId, new Set());
    }
    this.connections.get(sessionId)!.add(res);

    // Heartbeat
    const heartbeat = setInterval(() => {
      try {
        res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`);
      } catch {
        clearInterval(heartbeat);
        this.connections.get(sessionId)?.delete(res);
      }
    }, 15000);
    this.heartbeatIntervals.set(`${sessionId}:${Date.now()}`, heartbeat);

    res.on('close', () => {
      clearInterval(heartbeat);
      this.connections.get(sessionId)?.delete(res);
      logger.info({ sessionId }, 'SSE client disconnected');
    });

    logger.info({ sessionId }, 'SSE client connected');
  }

  broadcast(sessionId: string, event: SSEEvent): void {
    // Assign monotonic event ID
    if (!event.id) {
      if (!this.eventHistory.has(sessionId)) {
        this.eventHistory.set(sessionId, []);
      }
      event.id = `${sessionId}:${this.eventHistory.get(sessionId)!.length + 1}`;
    }

    // Store in history
    const history = this.eventHistory.get(sessionId);
    if (history) {
      history.push(event);
      if (history.length > 1000) {
        history.shift();
      }
    }

    // Send to all connected clients
    const payload = `id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`;
    const conns = this.connections.get(sessionId);
    if (conns) {
      for (const res of conns) {
        try {
          res.write(payload);
        } catch {
          conns.delete(res);
        }
      }
    }
  }

  getConnectionCount(sessionId: string): number {
    return this.connections.get(sessionId)?.size ?? 0;
  }

  closeAll(sessionId: string): void {
    const conns = this.connections.get(sessionId);
    if (conns) {
      for (const res of conns) {
        try { res.end(); } catch { /* ignore */ }
      }
      this.connections.delete(sessionId);
    }
    // Clean up heartbeats
    for (const [key, interval] of this.heartbeatIntervals) {
      if (key.startsWith(sessionId)) {
        clearInterval(interval);
        this.heartbeatIntervals.delete(key);
      }
    }
    logger.info({ sessionId }, 'All SSE connections closed');
  }
}

// Singleton
export const sseManager = new SSEManager();
