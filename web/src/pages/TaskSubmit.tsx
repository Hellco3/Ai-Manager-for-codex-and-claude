import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { postTask } from '../api/client.js';
import { useSessionStore } from '../store/session-store.js';
import { usePipelineStore } from '../store/pipeline-store.js';
import { t } from '../i18n.js';
import TaskForm from '../components/task/TaskForm.js';

export default function TaskSubmit() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { setSession } = useSessionStore();
  const { initStages } = usePipelineStore();

  const handleSubmit = async (task: string, mode: 'auto' | 'semi-auto') => {
    setIsSubmitting(true);
    setError(null);

    try {
      const { sessionId } = await postTask(task, mode);
      setSession(sessionId, task, mode);
      initStages();
      navigate(`/task/${sessionId}`);
    } catch (err: any) {
      setError(err.message || t.error.failed);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-12 pt-8">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-800/50 border border-slate-700/50 text-xs text-slate-400 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          {t.home.powered}
        </div>
        <h2 className="text-4xl font-bold mb-4">
          <span className="gradient-text">{t.home.hero}</span>
        </h2>
        <p className="text-slate-400 max-w-xl mx-auto">{t.home.desc}</p>
      </div>

      <TaskForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />

      {error && (
        <div className="mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">{t.error.failed}</span>
          </div>
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mt-16">
        {t.features.map((feat) => (
          <div key={feat.title} className="stage-card text-center">
            <div className="text-2xl mb-3">{feat.icon}</div>
            <h3 className="text-sm font-semibold text-slate-200 mb-1">{feat.title}</h3>
            <p className="text-xs text-slate-500">{feat.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
