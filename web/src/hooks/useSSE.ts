import { useEffect, useRef, useCallback } from 'react';
import { createSSEConnection } from '../api/client.js';
import { usePipelineStore } from '../store/pipeline-store.js';
import type { SSEEvent } from '@ai_manager/shared';

/**
 * Hook to manage SSE connection for a session.
 * Handles reconnect logic automatically.
 */
export function useSSE(sessionId: string | null, enabled = true) {
  const applySSEEvent = usePipelineStore((s) => s.applySSEEvent);
  const clearStreamingState = usePipelineStore((s) => s.clearStreamingState);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCountRef = useRef(0);
  const isClosedRef = useRef(false);

  const close = useCallback(() => {
    isClosedRef.current = true;
    reconnectCountRef.current = 0;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!sessionId || !enabled || isClosedRef.current) return;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const es = createSSEConnection(
      sessionId,
      (event: SSEEvent) => {
        applySSEEvent(event);
        reconnectCountRef.current = 0; // Reset on successful message
      },
      () => {
        if (isClosedRef.current || eventSourceRef.current !== es) {
          return;
        }

        // Clear streaming state on disconnect to avoid stale partial content
        clearStreamingState();

        // On error, close and reconnect
        es.close();
        eventSourceRef.current = null;

        if (reconnectCountRef.current < 10) {
          const delay = Math.min(1000 * Math.pow(2, reconnectCountRef.current), 30000);
          reconnectCountRef.current++;
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            connect();
          }, delay);
        }
      },
    );

    eventSourceRef.current = es;
  }, [sessionId, enabled, applySSEEvent]);

  useEffect(() => {
    isClosedRef.current = false;

    if (enabled) {
      connect();
    } else {
      close();
    }

    return () => {
      close();
    };
  }, [enabled, connect, close]);

  return {
    reconnect: () => {
      isClosedRef.current = false;
      reconnectCountRef.current = 0;
      connect();
    },
    close,
  };
}
