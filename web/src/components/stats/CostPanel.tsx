import React from 'react';
import type { CostStats } from '@ai_manager/shared';

interface Props {
  costStats: CostStats[];
  totalCost: number;
  totalDurationMs: number;
}

export default function CostPanel({ costStats, totalCost, totalDurationMs }: Props) {
  if (costStats.length === 0) return null;

  return (
    <div className="stage-card p-4">
      <h3 className="text-sm font-semibold text-white mb-3">Cost & Duration</h3>
      <div className="space-y-2">
        {costStats.map((s) => (
          <div key={s.model} className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-mono">{s.model}</span>
            <div className="flex gap-3 text-right">
              <span className="text-slate-500">{s.inputTokens + s.outputTokens} tok</span>
              <span className="text-slate-500">{s.durationMs}ms</span>
              <span className="text-green-400 font-mono">${s.costUSD.toFixed(4)}</span>
            </div>
          </div>
        ))}
        <div className="pt-2 border-t border-slate-700/50 flex justify-between text-xs font-medium">
          <span className="text-slate-400">Total</span>
          <div className="flex gap-3 text-right">
            <span className="text-slate-300">{totalDurationMs}ms</span>
            <span className="text-green-400 font-mono">${totalCost.toFixed(4)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
