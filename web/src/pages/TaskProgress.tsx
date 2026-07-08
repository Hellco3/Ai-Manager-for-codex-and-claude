import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSSE } from '../hooks/useSSE.js';
import { usePipelineStore } from '../store/pipeline-store.js';
import { useSessionStore } from '../store/session-store.js';
import { cancelTask, getTask } from '../api/client.js';
import { t } from '../i18n.js';
import PipelineView from '../components/pipeline/PipelineView.js';
import SubtaskList from '../components/pipeline/SubtaskList.js';
import DecompositionReview from '../components/task/DecompositionReview.js';
import LogDrawer from '../components/pipeline/LogDrawer.js';
import CostPanel from '../components/stats/CostPanel.js';
import TimePanel from '../components/stats/TimePanel.js';

function useElapsedSince(startedAt: number | undefined): string {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (!startedAt) { setElapsed(''); return; }
    const tick = () => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [startedAt]);

  return elapsed;
}

export default function TaskProgress() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { close } = useSSE(sessionId ?? null);

  const stages = usePipelineStore((s) => s.stages);
  const subtasks = usePipelineStore((s) => s.subtasks);
  const currentStage = usePipelineStore((s) => s.currentStage);
  const decomposition = usePipelineStore((s) => s.decomposition);
  const isComplete = usePipelineStore((s) => s.isComplete);
  const isError = usePipelineStore((s) => s.isError);
  const errorMessage = usePipelineStore((s) => s.errorMessage);
  const costStats = usePipelineStore((s) => s.costStats);
  const totalCost = usePipelineStore((s) => s.totalCost);
  const totalDurationMs = usePipelineStore((s) => s.totalDurationMs);
  const hydrateFromSession = usePipelineStore((s) => s.hydrateFromSession);
  const reset = usePipelineStore((s) => s.reset);

  const [hydrated, setHydrated] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logSubtaskId, setLogSubtaskId] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || hydrated) return;
    (async () => {
      try {
        const session = await getTask(sessionId);
        hydrateFromSession(session);
      } catch { setTimeout(() => setHydrated(false), 2000); }
      finally { setHydrated(true); }
    })();
  }, [sessionId, hydrated, hydrateFromSession]);

  const currentStageEntry = currentStage ? stages[currentStage] : null;
  const elapsed = useElapsedSince(currentStageEntry?.startedAt);

  const handleCancel = async () => {
    if (sessionId && confirm('Cancel this task?')) {
      try { await cancelTask(sessionId); close(); } catch { /* ignore */ }
    }
  };

  const handleNewTask = () => { close(); reset(); useSessionStore.getState().reset(); navigate('/'); };

  const openLog = (subtaskId: string) => { setLogSubtaskId(subtaskId); setLogOpen(true); };

  const stageLabels = t.stages;
  const stageIcons: Record<string, string> = { decompose: '🔍', review: '👁️', execute: '⚡', aggregate: '📋' };

  const logSubtask = logSubtaskId ? subtasks[logSubtaskId] : null;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <button onClick={handleNewTask} className="text-sm text-slate-500 hover:text-slate-300 inline-flex items-center gap-1 mb-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            {t.progress.newTask}
          </button>
          <h2 className="text-2xl font-bold text-white">{t.progress.title}</h2>
          {elapsed && <span className="text-xs text-slate-600 font-mono ml-2">{elapsed}</span>}
        </div>
        <div className="flex items-center gap-4">
          {costStats.length > 0 && (
            <div className="text-right">
              <div className="text-xs text-slate-500">{t.progress.cost}</div>
              <div className="text-sm font-mono text-green-400">${totalCost.toFixed(4)}</div>
            </div>
          )}
          {!isComplete && !isError && (
            <button onClick={handleCancel} className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm hover:bg-red-500/20">{t.progress.cancel}</button>
          )}
        </div>
      </div>

      {/* Pipeline */}
      <PipelineView stages={stages} currentStage={currentStage} stageLabels={stageLabels} stageIcons={stageIcons} subtasks={subtasks} />

      {/* Semi-Auto Review */}
      {decomposition && currentStage === 'review' && !isComplete && (
        <DecompositionReview decomposition={decomposition} sessionId={sessionId!} onApproved={() => {}} onRejected={handleCancel} />
      )}

      {/* Error */}
      {isError && (
        <div className="mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
          <div className="flex items-center gap-2 mb-1"><span className="font-medium">{t.error.failed}</span></div>
          {errorMessage}
        </div>
      )}

      {/* Complete */}
      {isComplete && (
        <div className="mt-6 p-4 rounded-xl bg-green-500/10 border border-green-500/20">
          <div className="flex items-center gap-2 text-green-400 mb-2"><span className="font-medium">{t.status.completed}</span></div>
          <p className="text-sm text-slate-400">{t.error.allDone}. {t.progress.cost}: ${totalCost.toFixed(4)}.</p>
          <button onClick={handleNewTask} className="mt-3 px-4 py-2 rounded-lg bg-blue-500/20 text-blue-400 text-sm hover:bg-blue-500/30">{t.progress.startNew}</button>
        </div>
      )}

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <CostPanel costStats={costStats} totalCost={totalCost} totalDurationMs={totalDurationMs} />
        <TimePanel totalDurationMs={totalDurationMs} />
      </div>

      {/* Subtasks */}
      {Object.keys(subtasks).length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-white mb-4">{t.subtask.title}</h3>
          <SubtaskList subtasks={subtasks} onOpenLog={openLog} />
        </div>
      )}

      {/* Log Drawer */}
      <LogDrawer isOpen={logOpen && !!logSubtask} onClose={() => setLogOpen(false)} title={logSubtask?.subtask?.description ?? 'Log'}>
        {logSubtask && (
          <div>
            <div className="mb-3"><StatusBadge status={logSubtask.status} /></div>
            {logSubtask.progressChunks.length > 0 ? (
              <pre className="text-xs text-slate-400 whitespace-pre-wrap font-mono">{logSubtask.progressChunks.join('')}</pre>
            ) : (
              <p className="text-xs text-slate-600">{t.subtask.noOutput}</p>
            )}
          </div>
        )}
      </LogDrawer>
    </div>
  );
}

// Inline StatusBadge for LogDrawer
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-slate-500/20 text-slate-400', queued: 'bg-cyan-500/20 text-cyan-400',
    running: 'bg-blue-500/20 text-blue-400', completed: 'bg-green-500/20 text-green-400',
    failed: 'bg-red-500/20 text-red-400', timed_out: 'bg-orange-500/20 text-orange-400',
    cancelled: 'bg-purple-500/20 text-purple-400',
  };
  const c = map[status] ?? map.pending;
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${c}`}>{status}</span>;
}
