import React from 'react';
import { Routes, Route } from 'react-router-dom';
import ChatFirst from './pages/ChatFirst.js';
import TaskSubmit from './pages/TaskSubmit.js';
import TaskProgress from './pages/TaskProgress.js';
import SessionSidebar from './components/layout/SessionSidebar.js';
import { t } from './i18n.js';

export default function App() {
  return (
    <div className="min-h-screen bg-grid">
      <header className="border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-3 ml-0 md:ml-[224px]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold">
              <span className="gradient-text">{t.app.title}</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">{t.app.subtitle}</span>
          </div>
        </div>
      </header>

      {/* Main Content — full viewport height, no gaps */}
      <main className="flex" style={{ height: 'calc(100dvh - 64px)' }}>
        <SessionSidebar />
        <div className="flex-1 min-w-0 overflow-hidden">
          <Routes>
            <Route path="/" element={<ChatFirst />} />
            <Route path="/task/:sessionId" element={<TaskProgress />} />
            <Route path="/submit" element={<TaskSubmit />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
