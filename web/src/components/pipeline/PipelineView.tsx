import React from 'react';
import { motion } from 'framer-motion';
import type { SubtaskState } from '@ai_manager/shared';
import SwimLaneView from './SwimLaneView.js';

interface Stage {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: number;
  completedAt?: number;
}

interface PipelineViewProps {
  stages: Record<string, Stage>;
  currentStage: string | null;
  stageLabels: Record<string, string>;
  stageIcons: Record<string, string>;
  subtasks: Record<string, SubtaskState & { kind?: string }>;
}

export default function PipelineView({
  stages,
  currentStage,
  stageLabels,
  stageIcons,
  subtasks,
}: PipelineViewProps) {
  const stageOrder = ['decompose', 'review', 'execute', 'aggregate'];

  return (
    <div className="space-y-6">
      <div className="stage-card">
        <div className="flex items-center justify-between gap-3">
          {stageOrder.map((key, idx) => {
            const stage = stages[key];
            const label = stageLabels[key] ?? key;
            const icon = stageIcons[key] ?? '•';
            const isActive = currentStage === key;
            const isComplete = stage?.status === 'completed';
            const isFailed = stage?.status === 'failed';

            return (
              <React.Fragment key={key}>
                <motion.div
                  className="flex flex-col items-center gap-2"
                  initial={{ opacity: 0.5 }}
                  animate={{ opacity: 1, scale: isActive ? 1.05 : 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <div
                    className={`
                      relative flex h-14 w-14 items-center justify-center rounded-xl text-xl transition-all duration-500
                      ${isActive ? 'stage-card active shadow-lg shadow-blue-500/20' : ''}
                      ${isComplete ? 'border-green-500/30 bg-green-500/10' : ''}
                      ${isFailed ? 'border-red-500/30 bg-red-500/10' : ''}
                      ${stage?.status === 'running' ? 'border-blue-500/30 bg-blue-500/10' : ''}
                      ${stage?.status === 'pending' ? 'border-slate-700/50 bg-slate-800/50' : ''}
                      ${stage?.status === 'skipped' ? 'border-slate-800 bg-slate-900/60 opacity-60' : ''}
                    `}
                  >
                    {stage?.status === 'running' && (
                      <svg className="absolute h-16 w-16" viewBox="0 0 64 64">
                        <circle className="text-blue-500/20" strokeWidth="2" stroke="currentColor" fill="none" r="28" cx="32" cy="32" />
                        <circle
                          className="text-blue-400 animate-spin"
                          strokeWidth="2"
                          stroke="currentColor"
                          fill="none"
                          r="28"
                          cx="32"
                          cy="32"
                          strokeDasharray="176"
                          strokeDashoffset="100"
                          strokeLinecap="round"
                        />
                      </svg>
                    )}
                    <span className="relative z-10">{icon}</span>
                  </div>

                  <div className="text-center">
                    <div
                      className={`text-xs font-medium ${
                        isActive ? 'text-blue-400' :
                        isComplete ? 'text-green-400' :
                        isFailed ? 'text-red-400' :
                        stage?.status === 'skipped' ? 'text-slate-600' :
                        'text-slate-500'
                      }`}
                    >
                      {label}
                    </div>
                  </div>

                  <div
                    className={`h-2 w-2 rounded-full ${
                      stage?.status === 'completed' ? 'bg-green-400' :
                      stage?.status === 'running' ? 'bg-blue-400 animate-pulse' :
                      stage?.status === 'failed' ? 'bg-red-400' :
                      stage?.status === 'skipped' ? 'bg-slate-600' :
                      'bg-slate-700'
                    }`}
                  />
                </motion.div>

                {idx < stageOrder.length - 1 && (
                  <div className="mx-2 mb-8 flex-1">
                    <div
                      className={`h-0.5 rounded-full transition-all duration-500 ${
                        stages[stageOrder[idx + 1]]?.status === 'completed' ||
                        stages[stageOrder[idx + 1]]?.status === 'running'
                          ? 'bg-blue-500'
                          : stages[key]?.status === 'completed'
                            ? 'bg-green-500/50'
                            : 'bg-slate-700/50'
                      }`}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {currentStage && stages[currentStage]?.status === 'running' && (
          <div className="mt-6 border-t border-slate-700/50 pt-4">
            <div className="flex items-center gap-2 text-sm">
              <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-slate-400">
                Running: <span className="text-blue-400">{stageLabels[currentStage]}</span>
              </span>
              <span className="ml-auto text-xs text-slate-600">
                {stages[currentStage]?.startedAt
                  ? `${Math.round((Date.now() - stages[currentStage].startedAt!) / 1000)}s`
                  : ''}
              </span>
            </div>
          </div>
        )}
      </div>

      <SwimLaneView subtasks={subtasks} currentStage={currentStage} />
    </div>
  );
}
