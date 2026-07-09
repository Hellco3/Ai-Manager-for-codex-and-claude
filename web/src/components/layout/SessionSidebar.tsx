import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { listSessions, getTask, type SessionSummary } from '../../api/client.js';
import { useSessionStore } from '../../store/session-store.js';
import { usePipelineStore } from '../../store/pipeline-store.js';
import { langName } from '../../i18n.js';

export default function SessionSidebar() {
  const isZh = langName === 'zh';
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const currentSessionId = useSessionStore((s) => s.sessionId);
  const lastSessionId = useSessionStore((s) => s.lastSessionId);
  const setSession = useSessionStore((s) => s.setSession);
  const reset = useSessionStore((s) => s.reset);
  const clearLastSession = useSessionStore((s) => s.clearLastSession);
  const hydrateFromSession = usePipelineStore((s) => s.hydrateFromSession);
  const pipelineReset = usePipelineStore((s) => s.reset);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listSessions();
      setSessions(list);
    } catch {
      // backend may be down
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    // Refresh every 30s
    const t = setInterval(fetchSessions, 30000);
    return () => clearInterval(t);
  }, [fetchSessions]);

  // Restore last session on mount if no active session
  useEffect(() => {
    if (!currentSessionId && lastSessionId) {
      (async () => {
        try {
          const session = await getTask(lastSessionId);
          setSession(lastSessionId, session.task, (session as any).mode || 'chat-first');
          hydrateFromSession(session);
        } catch {
          // session may have expired
          clearLastSession();
        }
      })();
    }
  }, []); // only on mount — eslint-ignore react-hooks/exhaustive-deps

  const handleSelectSession = async (id: string) => {
    if (id === currentSessionId) return;
    setMobileOpen(false);
    try {
      const session = await getTask(id);
      setSession(id, session.task, (session as any).mode || 'chat-first');
      hydrateFromSession(session);
      navigate('/');
    } catch {
      // expired — refresh list
      fetchSessions();
    }
  };

  const handleNewSession = () => {
    pipelineReset();
    reset();
    navigate('/');
    setMobileOpen(false);
  };

  const activeId = currentSessionId || lastSessionId;

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      chatting: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300',
      decomposing: 'border-purple-400/30 bg-purple-400/10 text-purple-300',
      awaiting_review: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
      executing: 'border-blue-400/30 bg-blue-400/10 text-blue-300',
      aggregating: 'border-teal-400/30 bg-teal-400/10 text-teal-300',
      completed: 'border-green-400/30 bg-green-400/10 text-green-300',
      failed: 'border-red-400/30 bg-red-400/10 text-red-300',
      cancelled: 'border-slate-400/30 bg-slate-400/10 text-slate-400',
      timed_out: 'border-orange-400/30 bg-orange-400/10 text-orange-300',
    };
    const c = map[status] ?? 'border-slate-700/50 bg-slate-800/50 text-slate-500';
    return (
      <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${c}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return isZh ? '刚刚' : 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return `${Math.floor(diff / 86400000)}d`;
  };

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-slate-700/50 px-3 py-4">
        <button
          onClick={handleNewSession}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-3 py-2.5 text-xs font-medium text-purple-300 transition-colors hover:bg-purple-500/20"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m7-7H5" />
          </svg>
          {isZh ? '新会话' : 'New Session'}
        </button>
      </div>

      {/* List */}
      <div className="chat-scroll flex-1 overflow-y-auto px-2 py-2">
        {loading && sessions.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-purple-400" />
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <p className="px-2 py-8 text-center text-[11px] text-slate-600">
            {isZh ? '暂无历史会话' : 'No sessions yet'}
          </p>
        )}

        {sessions.map((s) => {
          const isActive = s.sessionId === activeId;
          return (
            <button
              key={s.sessionId}
              onClick={() => handleSelectSession(s.sessionId)}
              className={`mb-1 w-full rounded-xl px-2.5 py-2.5 text-left transition-all ${
                isActive
                  ? 'border border-purple-400/20 bg-purple-500/8'
                  : 'border border-transparent hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-start justify-between gap-1">
                <p className="text-[12px] leading-5 text-slate-300 line-clamp-2">{s.task || (isZh ? '未命名任务' : 'Untitled')}</p>
                <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                  s.status === 'completed' ? 'bg-green-400' :
                  s.status === 'failed' || s.status === 'cancelled' ? 'bg-red-400' :
                  'bg-blue-400 animate-pulse'
                }`} />
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                {statusBadge(s.status)}
                <span className="text-[10px] text-slate-600">{formatTime(s.updatedAt)}</span>
                {s.messageCount > 0 && (
                  <span className="text-[10px] text-slate-600">· {s.messageCount} msgs</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="flex h-[100dvh] w-[224px] shrink-0 flex-col border-r border-slate-700/50 bg-slate-900/50 backdrop-blur-sm pt-16 max-md:hidden">
        {sidebarContent}
      </aside>

      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-50 rounded-lg border border-slate-700/50 bg-slate-900/80 p-2 text-slate-400 backdrop-blur-sm transition-colors hover:text-slate-200 md:hidden"
        aria-label={isZh ? '打开会话列表' : 'Open sessions'}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="absolute left-0 top-0 h-full w-72 border-r border-slate-700/50 bg-slate-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <div className="flex items-center justify-between border-b border-slate-700/50 px-3 py-3">
              <span className="text-xs font-medium text-slate-400">
                {isZh ? '会话列表' : 'Sessions'}
              </span>
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-1 text-slate-500 hover:text-slate-300"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="h-full pb-16">
              {sidebarContent}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
