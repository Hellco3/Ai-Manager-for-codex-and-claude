import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { t } from '../../i18n.js';
import FilePreview from './FilePreview.jsx';
import type { AggregatedResult, SubtaskState } from '@ai_manager/shared';
import type { FileAttachment } from '../../api/upload.js';

interface CompletionCardProps {
  aggregatedResult: AggregatedResult;
  subtaskStates: Record<string, SubtaskState>;
  attachments: FileAttachment[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function CompletionCard({
  aggregatedResult,
  subtaskStates,
  attachments,
}: CompletionCardProps) {
  const reduceMotion = useReducedMotion();

  const states = Object.values(subtaskStates);
  const succeededCount = states.filter((s) => s.status === 'completed').length;
  const failedCount = states.filter((s) => s.status === 'failed' || s.status === 'timed_out').length;
  const totalCount = states.length || (succeededCount + failedCount);

  const initial = reduceMotion ? false : { opacity: 0, y: 12 };
  const animate = { opacity: 1, y: 0 };

  return (
    <motion.div
      initial={initial}
      animate={animate}
      className="subtle-panel-strong rounded-2xl border border-green-500/20 bg-green-500/5 p-5"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-green-500/30 bg-green-500/15">
          <svg className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-green-300">{t.completion.title}</p>
          <p className="text-xs text-slate-400">{aggregatedResult.summary}</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 px-3 py-2.5">
          <p className="text-[11px] text-slate-500">
            {t.completion.succeeded} / {t.completion.failed}
          </p>
          <p className="text-sm font-semibold tabular-nums">
            <span className="text-green-400">{succeededCount}</span>
            <span className="text-slate-500"> / </span>
            <span className={failedCount > 0 ? 'text-red-400' : 'text-slate-400'}>{failedCount}</span>
            {totalCount > 0 && (
              <span className="text-xs text-slate-500"> {t.completion.subtasks}</span>
            )}
          </p>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 px-3 py-2.5">
          <p className="text-[11px] text-slate-500">
            {t.completion.cost} / {t.completion.duration}
          </p>
          <p className="text-sm font-semibold tabular-nums text-slate-200">
            ${aggregatedResult.totalCost.toFixed(4)} / {formatDuration(aggregatedResult.totalDurationMs)}
          </p>
        </div>
      </div>

      {/* Deliverable files */}
      {attachments.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            {t.completion.downloadFiles} ({attachments.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <FilePreview key={attachment.id} attachment={attachment} status="ready" />
            ))}
          </div>
        </div>
      )}

      {attachments.length === 0 && (
        <div className="mb-4 rounded-xl border border-dashed border-slate-700/50 bg-slate-900/40 px-4 py-3 text-center">
          <p className="text-xs text-slate-500">{t.completion.noFiles}</p>
        </div>
      )}

      {/* Key results from completed subtasks */}
      {succeededCount > 0 && (
        <div className="border-t border-slate-700/50 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
            {t.completion.keyResults}
          </p>
          <ul className="space-y-1.5">
            {states
              .filter((s) => s.status === 'completed' && s.result)
              .slice(0, 3)
              .map((state) => {
                const snippet = (state.result ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
                return (
                  <li key={state.subtask.id} className="text-xs leading-5 text-slate-400">
                    <span className="font-medium text-slate-300">{state.subtask.description}</span>
                    {snippet ? ` — ${snippet}${snippet.length >= 160 ? '…' : ''}` : ''}
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      {/* Failed subtasks summary */}
      {failedCount > 0 && (
        <div className="border-t border-slate-700/50 pt-3 mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-red-400/80 mb-2">
            {t.completion.failed} ({failedCount})
          </p>
          <ul className="space-y-1">
            {states
              .filter((s) => s.status === 'failed' || s.status === 'timed_out')
              .slice(0, 3)
              .map((state) => (
                <li key={state.subtask.id} className="text-xs leading-5 text-red-400/80">
                  <span className="font-medium">{state.subtask.description}</span>
                  {state.error ? ` — ${state.error.slice(0, 120)}` : ''}
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Hint: view in panel */}
      <p className="mt-4 text-center text-[11px] text-slate-500">
        {t.completion.viewInPanel}
      </p>
    </motion.div>
  );
}
