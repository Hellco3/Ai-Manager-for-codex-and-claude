import React, { useState } from 'react';
import type { SubtaskState } from '@ai_manager/shared';
import StatusBadge from '../common/StatusBadge.js';

interface Props {
  subtask: SubtaskState & { kind?: string };
  index: number;
}

export default function SubtaskCard({ subtask, index }: Props) {
  const [expanded, setExpanded] = useState(false);
  const state = subtask;
  const st = state.subtask;

  return (
    <div
      className="stage-card cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-600 font-mono w-6">{index + 1}.</span>
        <StatusBadge status={state.status} size="sm" />
        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-700/50 text-slate-400 uppercase">
          {st.kind}
        </span>
        <span className="text-sm text-slate-300 flex-1 truncate">{st.description}</span>
        {state.startedAt && (
          <span className="text-xs text-slate-600 font-mono">
            {state.completedAt
              ? `${((state.completedAt - state.startedAt) / 1000).toFixed(1)}s`
              : `${((Date.now() - state.startedAt) / 1000).toFixed(0)}s`}
          </span>
        )}
        <svg
          className={`w-4 h-4 text-slate-600 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-700/50">
          {state.status === 'running' && state.progressChunks.length > 0 && (
            <div className="mb-3 max-h-48 overflow-y-auto rounded-lg bg-slate-950/50 p-3">
              <pre className="text-xs text-slate-400 whitespace-pre-wrap font-mono">
                {state.progressChunks.join('')}
              </pre>
            </div>
          )}
          {state.result && (
            <div className="mb-3 max-h-64 overflow-y-auto rounded-lg bg-slate-950/50 p-3">
              <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono">
                {state.result.slice(0, 2000)}
                {state.result.length > 2000 && '\n... (truncated)'}
              </pre>
            </div>
          )}
          {state.error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
              <div className="text-xs text-red-400 font-medium mb-1">Error</div>
              <pre className="text-xs text-red-300 whitespace-pre-wrap font-mono">{state.error}</pre>
            </div>
          )}
          <div className="flex gap-4 text-xs text-slate-600">
            <span>P:{st.priority}</span>
            <span>{st.estimatedComplexity}</span>
            <span>Retries:{state.retryCount}</span>
            {st.dependencies.length > 0 && <span>Deps:{st.dependencies.join(',')}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
