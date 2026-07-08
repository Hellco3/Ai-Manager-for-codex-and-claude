import React, { useState } from 'react';
import type { SubtaskState } from '@ai_manager/shared';

interface SubtaskListProps {
  subtasks: Record<string, SubtaskState & { kind?: string }>;
  onOpenLog?: (subtaskId: string) => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: 'text-slate-500', bg: 'bg-slate-500/10' },
  queued: { label: 'Queued', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  running: { label: 'Running', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  completed: { label: 'Completed', color: 'text-green-400', bg: 'bg-green-500/10' },
  failed: { label: 'Failed', color: 'text-red-400', bg: 'bg-red-500/10' },
  timed_out: { label: 'Timed Out', color: 'text-orange-400', bg: 'bg-orange-500/10' },
  cancelled: { label: 'Cancelled', color: 'text-purple-400', bg: 'bg-purple-500/10' },
};

export default function SubtaskList({ subtasks, onOpenLog }: SubtaskListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {Object.entries(subtasks).map(([id, state]) => {
        const config = STATUS_CONFIG[state.status] ?? STATUS_CONFIG.pending;
        const isExpanded = expandedId === id;

        return (
          <div
            key={id}
            className="stage-card cursor-pointer"
            onClick={() => setExpandedId(isExpanded ? null : id)}
          >
            {/* Header */}
            <div className="flex items-center gap-3">
              {/* Status Dot */}
              <div className={`w-2.5 h-2.5 rounded-full ${
                state.status === 'running' ? 'bg-blue-400 animate-pulse' :
                state.status === 'completed' ? 'bg-green-400' :
                state.status === 'failed' ? 'bg-red-400' :
                state.status === 'timed_out' ? 'bg-orange-400' :
                state.status === 'queued' ? 'bg-cyan-400' :
                'bg-slate-600'
              }`} />

              {/* Kind Badge */}
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-700/50 text-slate-400 uppercase">
                {state.subtask.kind}
              </span>

              {/* Description */}
              <span className="text-sm text-slate-300 flex-1 truncate">
                {state.subtask.description}
              </span>

              {/* Status */}
              <span className={`text-xs ${config.color}`}>{config.label}</span>

              {/* Duration */}
              {state.startedAt && (
                <span className="text-xs text-slate-600 font-mono">
                  {state.completedAt
                    ? `${((state.completedAt - state.startedAt) / 1000).toFixed(1)}s`
                    : `${((Date.now() - state.startedAt) / 1000).toFixed(0)}s`}
                </span>
              )}

              {/* Expand Arrow */}
              <svg
                className={`w-4 h-4 text-slate-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="mt-3 pt-3 border-t border-slate-700/50">
                {/* Progress */}
                {state.status === 'running' && state.progressChunks.length > 0 && (
                  <div className="mb-3 max-h-48 overflow-y-auto rounded-lg bg-slate-950/50 p-3">
                    <pre className="text-xs text-slate-400 whitespace-pre-wrap font-mono">
                      {state.progressChunks.join('')}
                    </pre>
                  </div>
                )}

                {/* Result */}
                {state.result && (
                  <div className="mb-3 max-h-64 overflow-y-auto rounded-lg bg-slate-950/50 p-3">
                    <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono">
                      {state.result.slice(0, 2000)}
                      {state.result.length > 2000 && '\n... (truncated)'}
                    </pre>
                  </div>
                )}

                {/* Error */}
                {state.error && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                    <div className="text-xs text-red-400 font-medium mb-1">Error</div>
                    <pre className="text-xs text-red-300 whitespace-pre-wrap font-mono">
                      {state.error}
                    </pre>
                  </div>
                )}

                {/* Meta */}
                <div className="flex gap-4 text-xs text-slate-600 items-center">
                  <span>Priority: {state.subtask.priority}</span>
                  <span>Complexity: {state.subtask.estimatedComplexity}</span>
                  <span>Retries: {state.retryCount}</span>
                  {state.subtask.dependencies.length > 0 && (
                    <span>Deps: {state.subtask.dependencies.join(', ')}</span>
                  )}
                  {onOpenLog && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onOpenLog(id); }}
                      className="ml-auto px-3 py-1 rounded text-xs bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-all"
                    >
                      View Log
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {Object.keys(subtasks).length === 0 && (
        <div className="text-center py-8 text-slate-600 text-sm">
          No subtasks yet...
        </div>
      )}
    </div>
  );
}
