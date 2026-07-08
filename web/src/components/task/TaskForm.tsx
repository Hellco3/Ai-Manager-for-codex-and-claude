import React, { useState } from 'react';

interface TaskFormProps {
  onSubmit: (task: string, mode: 'auto' | 'semi-auto') => void;
  isSubmitting: boolean;
}

export default function TaskForm({ onSubmit, isSubmitting }: TaskFormProps) {
  const [task, setTask] = useState('');
  const [mode, setMode] = useState<'auto' | 'semi-auto'>('auto');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (task.trim() && !isSubmitting) {
      onSubmit(task.trim(), mode);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="stage-card active">
        {/* Mode Toggle */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs text-slate-500">Mode:</span>
          <div className="flex rounded-lg bg-slate-900/50 p-0.5">
            <button
              type="button"
              onClick={() => setMode('auto')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                mode === 'auto'
                  ? 'bg-blue-500/20 text-blue-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Auto
            </button>
            <button
              type="button"
              onClick={() => setMode('semi-auto')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                mode === 'semi-auto'
                  ? 'bg-purple-500/20 text-purple-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Semi-Auto
            </button>
          </div>
          <span className="text-xs text-slate-600">
            {mode === 'auto'
              ? 'Fully automatic decomposition and execution'
              : 'Review and approve decomposition before execution'}
          </span>
        </div>

        {/* Textarea */}
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="Describe your task in detail...&#10;&#10;Example: Create a React dashboard with user authentication, a data table with sorting/pagination, and real-time chart updates via WebSocket."
          rows={5}
          className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3 text-slate-200 placeholder-slate-600 text-sm resize-none focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
          disabled={isSubmitting}
        />

        {/* Submit */}
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-slate-600">
            {task.length > 0 ? `${task.length} characters` : 'Be specific for best results'}
          </span>
          <button
            type="submit"
            disabled={!task.trim() || isSubmitting}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:from-blue-500 hover:to-purple-500 transition-all shadow-lg shadow-blue-500/20"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Decomposing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Execute Task
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
