import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { SubtaskState } from '@ai_manager/shared';
import { langName } from '../../i18n.js';

type LaneId = 'claude' | 'codex';
type LaneStatus = 'pending' | 'running' | 'completed' | 'failed';

interface SwimLaneViewProps {
  subtasks: Record<string, SubtaskState & { kind?: string }>;
  currentStage: string | null;
}

interface LaneCardProps {
  state: SubtaskState & { kind?: string };
  index: number;
}

const LANE_META: Record<LaneId, { label: string; accent: string; glow: string; chip: string }> = {
  claude: {
    label: 'Claude Lane',
    accent: 'text-cyan-300',
    glow: 'shadow-[0_0_40px_rgba(34,211,238,0.16)]',
    chip: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200',
  },
  codex: {
    label: 'Codex Lane',
    accent: 'text-blue-300',
    glow: 'shadow-[0_0_40px_rgba(59,130,246,0.16)]',
    chip: 'border-blue-400/30 bg-blue-400/10 text-blue-200',
  },
};

const KIND_LABELS: Record<string, string> = {
  analysis: 'analysis',
  research: 'research',
  design: 'design',
  code: 'code',
  vision: 'vision',
  image_generation: 'image generation',
  integration: 'integration',
};

const STATUS_META: Record<LaneStatus, {
  label: string;
  ring: string;
  card: string;
  badge: string;
}> = {
  pending: {
    label: 'Pending',
    ring: 'border-slate-700/80',
    card: 'bg-slate-900/85',
    badge: 'border-slate-700/80 bg-slate-800/80 text-slate-300',
  },
  running: {
    label: 'Running',
    ring: 'border-blue-400/40',
    card: 'bg-blue-500/8',
    badge: 'border-blue-400/30 bg-blue-500/10 text-blue-200',
  },
  completed: {
    label: 'Completed',
    ring: 'border-emerald-400/35',
    card: 'bg-emerald-500/8',
    badge: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
  },
  failed: {
    label: 'Failed',
    ring: 'border-rose-400/40',
    card: 'bg-rose-500/8',
    badge: 'border-rose-400/30 bg-rose-500/10 text-rose-200',
  },
};

function mapStatus(status: string): LaneStatus {
  if (status === 'completed') return 'completed';
  if (status === 'failed' || status === 'timed_out' || status === 'cancelled') return 'failed';
  if (status === 'running') return 'running';
  return 'pending';
}

function getLane(kind: string | undefined, index: number): LaneId {
  if (kind === 'code' || kind === 'analysis' || kind === 'research' || kind === 'design' || kind === 'integration') return 'claude';
  if (kind === 'vision' || kind === 'image_generation') return 'codex';
  // Default: alternate between lanes
  return index % 2 === 0 ? 'claude' : 'codex';
}

function formatDuration(startedAt?: number, completedAt?: number): string | null {
  if (!startedAt) return null;
  const end = completedAt ?? Date.now();
  const seconds = Math.max(0, Math.round((end - startedAt) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function getLaneSummary(items: Array<SubtaskState & { kind?: string }>) {
  return {
    total: items.length,
    running: items.filter((item) => mapStatus(item.status) === 'running').length,
    completed: items.filter((item) => mapStatus(item.status) === 'completed').length,
    failed: items.filter((item) => mapStatus(item.status) === 'failed').length,
  };
}

function PendingGlyph() {
  return (
    <motion.div
      className="h-3 w-3 rounded-full bg-slate-400"
      animate={{ opacity: [0.35, 0.9, 0.35], scale: [1, 1.15, 1] }}
      transition={{ duration: 1.8, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
    />
  );
}

function RunningGlyph() {
  return (
    <motion.div
      className="relative h-4 w-4"
      animate={{ rotate: 360 }}
      transition={{ duration: 1.2, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
    >
      <div className="absolute inset-0 rounded-full border-2 border-blue-400/25" />
      <div className="absolute inset-[1px] rounded-full border-2 border-transparent border-t-blue-300 border-r-cyan-300" />
    </motion.div>
  );
}

function CompletedGlyph() {
  return (
    <motion.svg
      className="h-4 w-4 text-emerald-300"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      <path d="M5 13l4 4L19 7" />
    </motion.svg>
  );
}

function FailedGlyph() {
  return (
    <motion.div
      className="flex h-4 w-4 items-center justify-center text-rose-300"
      animate={{ opacity: [1, 0.35, 1] }}
      transition={{ duration: 0.65, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M7 7l10 10M17 7L7 17" />
      </svg>
    </motion.div>
  );
}

function StatusGlyph({ status }: { status: LaneStatus }) {
  if (status === 'running') return <RunningGlyph />;
  if (status === 'completed') return <CompletedGlyph />;
  if (status === 'failed') return <FailedGlyph />;
  return <PendingGlyph />;
}

function LaneCard({ state, index }: LaneCardProps) {
  const status = mapStatus(state.status);
  const meta = STATUS_META[status];
  const duration = formatDuration(state.startedAt, state.completedAt);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      transition={{ duration: 0.28, delay: index * 0.04 }}
      className={`group relative overflow-hidden rounded-2xl border p-4 ${meta.ring} ${meta.card} backdrop-blur-sm`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.12),transparent_34%)] opacity-60" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-slate-500/50 to-transparent" />

      <div className="relative space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] ${meta.badge}`}>
            <StatusGlyph status={status} />
            <span>{meta.label}</span>
          </span>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-700/70 bg-slate-950/80 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">
              {state.subtask.id}
            </span>
            <span className="rounded-full border border-slate-800/90 bg-slate-900/90 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-300">
              {KIND_LABELS[state.subtask.kind] ?? state.subtask.kind}
            </span>
          </div>
        </div>

        <div className="text-sm font-medium leading-6 text-slate-100 break-words [overflow-wrap:anywhere]">
          {state.subtask.description}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span className="rounded-full border border-slate-800 bg-slate-950/80 px-2 py-1">
            P{state.subtask.priority}
          </span>
          <span className="rounded-full border border-slate-800 bg-slate-950/80 px-2 py-1 uppercase">
            {state.subtask.estimatedComplexity}
          </span>
          {state.subtask.dependencies.length > 0 && (
            <span className="rounded-full border border-slate-800 bg-slate-950/80 px-2 py-1">
              deps {state.subtask.dependencies.length}
            </span>
          )}
          {duration && (
            <span className="rounded-full border border-slate-800 bg-slate-950/80 px-2 py-1 font-mono text-slate-300">
              {duration}
            </span>
          )}
        </div>
      </div>

      <AnimatePresence>
        {status === 'running' && state.progressChunks.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 14 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.22 }}
            className="relative overflow-hidden rounded-xl border border-blue-400/20 bg-slate-950/80"
          >
            <div className="max-h-28 overflow-y-auto p-3">
              <pre className="whitespace-pre-wrap font-mono text-[11px] leading-5 text-slate-300">
                {state.progressChunks.join('').slice(-600)}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function EmptyLane({ label }: { label: string }) {
  const isZh = langName === 'zh';
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-500"
    >
      {isZh ? `${label} 等待编排中...` : `${label} awaiting orchestration...`}
    </motion.div>
  );
}

export default function SwimLaneView({ subtasks, currentStage }: SwimLaneViewProps) {
  const isZh = langName === 'zh';
  const entries = Object.values(subtasks);
  const claude = entries.filter((item, index) => getLane(item.subtask.kind, index) === 'claude');
  const codex = entries.filter((item, index) => getLane(item.subtask.kind, index) === 'codex');
  const lanes: Record<LaneId, Array<SubtaskState & { kind?: string }>> = { claude, codex };

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-slate-800/90 bg-slate-950 text-slate-100 shadow-[0_24px_80px_rgba(2,6,23,0.55)]">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.07)_1px,transparent_1px)] bg-[size:32px_32px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.14),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.14),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(20,184,166,0.09),transparent_30%)]" />

      <div className="relative border-b border-slate-800/80 px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.34em] text-cyan-300/80">{isZh ? '并行编排' : 'Parallel Orchestration'}</div>
            <h3 className="mt-1 text-lg font-semibold text-white">{isZh ? 'Claude 与 Codex 泳道' : 'Claude and Codex swimlanes'}</h3>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-[11px] uppercase tracking-[0.28em] text-slate-300">
            <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.8)]" />
            {currentStage === 'execute'
              ? (isZh ? '执行中' : 'Execution Live')
              : currentStage
                ? (isZh ? `${currentStage} 阶段` : `${currentStage} stage`)
                : (isZh ? '空闲' : 'Idle')}
          </div>
        </div>
      </div>

      <div className="relative space-y-4 p-4 sm:p-6">
        {(['claude', 'codex'] as LaneId[]).map((laneId) => {
          const laneItems = lanes[laneId];
          const laneMeta = LANE_META[laneId];
          const summary = getLaneSummary(laneItems);

          return (
            <motion.section
              key={laneId}
              layout
              className={`relative overflow-hidden rounded-[24px] border border-slate-800/90 bg-slate-900/80 ${laneMeta.glow}`}
            >
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.96),rgba(2,6,23,0.84))]" />

              <div className="relative flex flex-col xl:flex-row">
                <div className="border-b border-slate-800/80 p-4 xl:w-[184px] xl:shrink-0 xl:border-b-0 xl:border-r xl:border-slate-800/80 xl:p-5">
                  <div className="flex items-center gap-3">
                    <div className={`h-3 w-3 rounded-full ${laneId === 'claude' ? 'bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,0.9)]' : 'bg-blue-300 shadow-[0_0_16px_rgba(147,197,253,0.9)]'}`} />
                    <div>
                      <div className={`text-sm font-semibold ${laneMeta.accent}`}>{laneMeta.label}</div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        {laneId === 'claude'
                          ? (isZh ? '代码 / 推理 / 研究 / 集成' : 'code / reasoning / research / integration')
                          : (isZh ? '读图 / 生图' : 'vision / image generation')}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] ${laneMeta.chip}`}>
                      {summary.total} {isZh ? '任务' : 'tasks'}
                    </span>
                    {summary.running > 0 && (
                      <span className="rounded-full border border-blue-400/25 bg-blue-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-blue-200">
                        {summary.running} {isZh ? '执行中' : 'running'}
                      </span>
                    )}
                    {summary.completed > 0 && (
                      <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-emerald-200">
                        {summary.completed} {isZh ? '完成' : 'done'}
                      </span>
                    )}
                    {summary.failed > 0 && (
                      <span className="rounded-full border border-rose-400/25 bg-rose-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-rose-200">
                        {summary.failed} {isZh ? '失败' : 'failed'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="min-w-0 flex-1 p-4 sm:p-5">
                  <AnimatePresence mode="popLayout">
                    <div className="grid min-w-0 gap-3">
                      {laneItems.length > 0 ? (
                        laneItems.map((item, index) => (
                          <LaneCard key={item.subtask.id} state={item} index={index} />
                        ))
                      ) : (
                        <EmptyLane label={laneMeta.label} />
                      )}
                    </div>
                  </AnimatePresence>
                </div>
              </div>
            </motion.section>
          );
        })}
      </div>
    </div>
  );
}
