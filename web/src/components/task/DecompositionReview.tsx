import React, { useState } from 'react';
import type { TaskDecomposition, Subtask, SubtaskKind } from '@ai_manager/shared';
import { approveDecomposition } from '../../api/client.js';
import StatusBadge from '../common/StatusBadge.js';

interface Props {
  decomposition: TaskDecomposition;
  sessionId: string;
  onApproved: () => void;
  onRejected: () => void;
}

const KIND_COLORS: Record<SubtaskKind, string> = {
  code: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  analysis: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  design: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  research: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  integration: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
};

export default function DecompositionReview({ decomposition, sessionId, onApproved, onRejected }: Props) {
  const [subtasks, setSubtasks] = useState<Subtask[]>(decomposition.subtasks);
  const [approving, setApproving] = useState(false);

  const handleApprove = async () => {
    setApproving(true);
    try {
      await approveDecomposition(sessionId, subtasks);
      onApproved();
    } catch {
      setApproving(false);
    }
  };

  return (
    <div className="mt-6 stage-card active">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Review Decomposition</h3>
          <p className="text-sm text-slate-400 mt-1">{decomposition.overview}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onRejected}
            className="px-4 py-2 rounded-lg bg-slate-700/50 text-slate-400 text-sm hover:bg-slate-700 transition-all"
          >
            Reject
          </button>
          <button
            onClick={handleApprove}
            disabled={approving}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-medium hover:from-blue-500 hover:to-purple-500 transition-all disabled:opacity-40"
          >
            {approving ? 'Approving...' : 'Approve & Execute'}
          </button>
        </div>
      </div>

      {/* Subtask Cards */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {subtasks.map((st, idx) => (
          <div key={st.id} className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/50 border border-slate-700/30">
            <span className="text-xs text-slate-600 font-mono mt-0.5 w-6">{idx + 1}.</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase border ${KIND_COLORS[st.kind]}`}>
                  {st.kind}
                </span>
                <span className="text-xs text-slate-500">Priority: {st.priority}</span>
                <span className="text-xs text-slate-500">Complexity: {st.estimatedComplexity}</span>
              </div>
              <p className="text-sm text-slate-300">{st.description}</p>
              {st.dependencies.length > 0 && (
                <p className="text-xs text-slate-600 mt-1">Depends on: {st.dependencies.join(', ')}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Execution Order */}
      <div className="mt-4 pt-3 border-t border-slate-700/50">
        <span className="text-xs text-slate-500">Execution order: </span>
        <span className="text-xs text-slate-400 font-mono">
          {decomposition.executionOrder.join(' → ')}
        </span>
        {decomposition.estimatedTimeMinutes && (
          <span className="text-xs text-slate-600 ml-2">
            (est. {decomposition.estimatedTimeMinutes} min)
          </span>
        )}
      </div>
    </div>
  );
}
