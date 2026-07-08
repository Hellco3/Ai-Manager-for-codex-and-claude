import React from 'react';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  pending: { color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', label: 'Pending' },
  queued: { color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30', label: 'Queued' },
  running: { color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', label: 'Running' },
  completed: { color: 'bg-green-500/20 text-green-400 border-green-500/30', label: 'Completed' },
  failed: { color: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'Failed' },
  timed_out: { color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', label: 'Timed Out' },
  cancelled: { color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', label: 'Cancelled' },
};

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = STATUS_MAP[status] ?? STATUS_MAP.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.color} ${size === 'sm' ? 'px-2 py-0.5 text-[10px]' : ''}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        status === 'running' ? 'bg-blue-400 animate-pulse' :
        status === 'completed' ? 'bg-green-400' :
        status === 'failed' ? 'bg-red-400' :
        'bg-current'
      }`} />
      {config.label}
    </span>
  );
}
