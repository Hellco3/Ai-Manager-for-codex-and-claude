import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePipelineStore } from '../store/pipeline-store.js';
import { useSessionStore } from '../store/session-store.js';
import { useSSE } from '../hooks/useSSE.js';
import { postTask, sendMessage, confirmTask, updateWorkspace, getTask } from '../api/client.js';
import { t } from '../i18n.js';
import ChatMessage from '../components/chat/ChatMessage.js';
import ChatInput from '../components/chat/ChatInput.js';
import WorkspaceSelector from '../components/chat/WorkspaceSelector.js';
import PipelineView from '../components/pipeline/PipelineView.js';
import SubtaskList from '../components/pipeline/SubtaskList.js';
import CostPanel from '../components/stats/CostPanel.js';
import TimePanel from '../components/stats/TimePanel.js';

export default function ChatFirst() {
  const navigate = useNavigate();

  // Pipeline store
  const messages = usePipelineStore((s) => s.messages);
  const isStreaming = usePipelineStore((s) => s.isStreaming);
  const streamingContent = usePipelineStore((s) => s.streamingContent);
  const addUserMessage = usePipelineStore((s) => s.addUserMessage);
  const removeLastUserMessage = usePipelineStore((s) => s.removeLastUserMessage);
  const hydrateFromSession = usePipelineStore((s) => s.hydrateFromSession);
  const reset = usePipelineStore((s) => s.reset);
  const sessionId = useSessionStore((s) => s.sessionId);
  const setSession = useSessionStore((s) => s.setSession);
  const stages = usePipelineStore((s) => s.stages);
  const subtasks = usePipelineStore((s) => s.subtasks);
  const currentStage = usePipelineStore((s) => s.currentStage);
  const isComplete = usePipelineStore((s) => s.isComplete);
  const isError = usePipelineStore((s) => s.isError);
  const errorMessage = usePipelineStore((s) => s.errorMessage);
  const costStats = usePipelineStore((s) => s.costStats);
  const totalCost = usePipelineStore((s) => s.totalCost);
  const totalDurationMs = usePipelineStore((s) => s.totalDurationMs);
  const workspaceDir = usePipelineStore((s) => s.workspaceDir);

  const { close } = useSSE(sessionId, !!sessionId);

  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Hydrate from existing session
  useEffect(() => {
    if (!sessionId || hydrated) return;
    (async () => {
      try {
        const session = await getTask(sessionId);
        hydrateFromSession(session);
      } catch { /* ignore */ }
      finally { setHydrated(true); }
    })();
  }, [sessionId, hydrated, hydrateFromSession]);

  const scrollToBottom = useCallback((force = false) => {
    const el = containerRef.current;
    if (!el) return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 120;
    if (force || nearBottom) {
      messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, streamingContent, scrollToBottom]);

  const handleSend = async (message: string) => {
    setSendError(null);
    setIsSending(true);
    scrollToBottom(true);

    // If no session yet, create one in chat-first mode
    if (!sessionId) {
      try {
        const result = await postTask(message, 'chat-first', workspaceDir ?? undefined);
        setSession(result.sessionId, message, 'chat-first');
        addUserMessage(message);
        // Start SSE connection by navigating (triggers useSSE)
      } catch (err: any) {
        setSendError(err.message || t.chat.error);
      } finally {
        setIsSending(false);
      }
      return;
    }

    // Existing session — send message
    addUserMessage(message);
    try {
      await sendMessage(sessionId, message);
    } catch (err: any) {
      setSendError(err.message || t.chat.error);
      removeLastUserMessage();
    } finally {
      setIsSending(false);
    }
  };

  const handleConfirmTask = async () => {
    if (!sessionId) return;
    setSendError(null);
    try {
      await confirmTask(sessionId, undefined, workspaceDir ?? undefined);
    } catch (err: any) {
      setSendError(err.message || t.chat.error);
    }
  };

  const handleUpdateWorkspace = async (dir: string) => {
    if (sessionId) {
      try {
        await updateWorkspace(sessionId, dir);
      } catch { /* ignore — workspace is saved client-side */ }
    }
    usePipelineStore.setState({ workspaceDir: dir });
  };

  const handleNewSession = () => {
    close();
    reset();
    useSessionStore.getState().reset();
  };

  const hasPipelineStarted = currentStage && currentStage !== 'decompose' && Object.keys(subtasks).length > 0;
  const showConfirm = sessionId && !hasPipelineStarted && !isComplete;

  const stageLabels = t.stages;
  const stageIcons: Record<string, string> = { decompose: '🔍', review: '👁️', execute: '⚡', aggregate: '📋' };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
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
          {sessionId && (
            <button onClick={handleNewSession} className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded bg-slate-800/50">
              + {t.progress.newTask}
            </button>
          )}
          <button onClick={() => navigate('/submit')} className="text-xs text-slate-600 hover:text-slate-400">
            {t.form.execute}
          </button>
        </div>
      </div>

      {/* Chat Panel */}
      <div className="stage-card p-0 overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 140px)', minHeight: '500px' }}>
        {/* Workspace selector */}
        <WorkspaceSelector
          workspaceDir={workspaceDir}
          onUpdate={handleUpdateWorkspace}
          disabled={isSending || !!hasPipelineStarted}
        />

        {/* Messages area */}
        <div ref={containerRef} className="flex-1 overflow-y-auto py-3 scroll-smooth">
          {/* Greeting */}
          {messages.length === 0 && !isStreaming && (
            <div className="flex justify-center px-4 py-8">
              <div className="max-w-md text-center">
                <div className="text-4xl mb-4">🤖</div>
                <p className="text-sm text-slate-400 leading-relaxed">{t.chatFirst.greeting}</p>
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <ChatMessage
              key={`${msg.timestamp}-${idx}`}
              role={msg.role}
              content={msg.content}
              timestamp={msg.timestamp}
            />
          ))}

          {/* Streaming message */}
          {isStreaming && streamingContent && (
            <ChatMessage role="assistant" content={streamingContent} timestamp={Date.now()} isStreaming />
          )}

          {/* Typing indicator */}
          {isStreaming && !streamingContent && (
            <div className="flex gap-2 px-3 py-2 justify-start">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {/* Pipeline inline view */}
          {hasPipelineStarted && (
            <div className="px-4 py-3 mx-3 my-2 rounded-xl bg-slate-800/30 border border-slate-700/30">
              <p className="text-xs text-slate-400 mb-2 font-medium">{t.progress.title}</p>
              <PipelineView stages={stages} currentStage={currentStage} stageLabels={stageLabels} stageIcons={stageIcons} subtasks={subtasks} />
              <div className="mt-3 grid grid-cols-2 gap-3">
                <CostPanel costStats={costStats} totalCost={totalCost} totalDurationMs={totalDurationMs} />
                <TimePanel totalDurationMs={totalDurationMs} />
              </div>
              {Object.keys(subtasks).length > 0 && (
                <div className="mt-3">
                  <SubtaskList subtasks={subtasks} />
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {isError && (
            <div className="px-4 py-2 mx-3 my-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              {t.error.failed}: {errorMessage}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Error display */}
        {sendError && (
          <div className="px-4 py-2 mx-3 mb-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            {sendError}
            <button onClick={() => setSendError(null)} className="ml-2 text-red-300 hover:text-red-200">✕</button>
          </div>
        )}

        {/* Confirm task button */}
        {showConfirm && (
          <div className="px-4 py-2 border-t border-slate-700/50 bg-slate-800/30">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">{t.chatFirst.startTaskHint}</span>
              <button
                onClick={handleConfirmTask}
                disabled={isSending || isStreaming}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-medium hover:from-blue-500 hover:to-purple-500 transition-all disabled:opacity-40"
              >
                {t.chatFirst.startTask}
              </button>
            </div>
          </div>
        )}

        {/* Input */}
        <ChatInput onSend={handleSend} isDisabled={isStreaming || isSending} />
      </div>
    </div>
  );
}
