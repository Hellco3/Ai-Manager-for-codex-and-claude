import React from 'react';
import { Routes, Route } from 'react-router-dom';
import TaskSubmit from './pages/TaskSubmit.js';
import TaskProgress from './pages/TaskProgress.js';

export default function App() {
  return (
    <div className="min-h-screen bg-grid">
      {/* Header */}
      <header className="border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold">
              <span className="text-white">AI</span>{' '}
              <span className="gradient-text">Orchestrator</span>
            </h1>
          </div>
          <span className="text-xs text-slate-500">Task Orchestration Platform</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Routes>
          <Route path="/" element={<TaskSubmit />} />
          <Route path="/task/:sessionId" element={<TaskProgress />} />
        </Routes>
      </main>
    </div>
  );
}
