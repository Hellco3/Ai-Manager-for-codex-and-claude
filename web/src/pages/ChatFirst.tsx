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
import { useUploadStore } from '../store/upload-store.js';

export default function ChatFirst() {
  const navigate = useNavigate();
  const messages = usePipelineStore((s) => s.messages);
  const isStreaming = usePipelineStore((s) => s.isStreaming);
  const streamingContent = usePipelineStore((s) => s.streamingContent);
  const addUserMessage = usePipelineStore((s) => s.addUserMessage);
  const removeLastUserMessage = usePipelineStore((s) => s.removeLastUserMessage);
  const hydrateFromSession = usePipelineStore((s) => s.hydrateFromSession);
  const reset = usePipelineStore((s) => s.reset);
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
  const sessionId = useSessionStore((s) => s.sessionId);
  const setSession = useSessionStore((s) => s.setSession);
  const { close } = useSSE(sessionId, !!sessionId);

  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionId || hydrated) return;
    (async () => {
      try {
        const session = await getTask(sessionId);
        hydrateFromSession(session);
      } catch {
      } finally {
        setHydrated(true);
      }
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

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  const handleSend = async (message: string, attachmentIds: string[]) => {
    setSendError(null);
    setIsSending(true);
    scrollToBottom(true);

    if (!sessionId) {
      try {
        const result = await postTask(message, 'chat-first', workspaceDir ?? undefined);
        setSession(result.sessionId, message, 'chat-first');
        addUserMessage(message, attachmentIds.length > 0 ? attachmentIds : undefined);
      } catch (err: any) {
        setSendError(err.message || t.chat.error);
      } finally {
        setIsSending(false);
      }
      return;
    }

    addUserMessage(message, attachmentIds.length > 0 ? attachmentIds : undefined);
    try {
      await sendMessage(sessionId, message, attachmentIds.length > 0 ? attachmentIds : undefined);
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
      setIsMobilePanelOpen(false);
    } catch (err: any) {
      setSendError(err.message || t.chat.error);
    }
  };

  const handleUpdateWorkspace = async (dir: string) => {
    if (sessionId) {
      try {
        await updateWorkspace(sessionId, dir);
      } catch {
      }
    }
    usePipelineStore.setState({ workspaceDir: dir });
  };

  const handleNewSession = () => {
    close();
    // 审计结论：重置会话时同步清理上传预览，避免输入区残留旧附件卡片。
    useUploadStore.setState({ items: [], isUploading: false });
    reset();
    useSessionStore.getState().reset();
    setSendError(null);
    setIsMobilePanelOpen(false);
  };

  const hasPipelineStarted = !!currentStage && currentStage !== 'decompose' && Object.keys(subtasks).length > 0;
  const showConfirm = !!sessionId && !hasPipelineStarted && !isComplete;
  const stageLabels = t.stages;
  const stageIcons: Record<string, string> = { decompose: 'D', review: 'R', execute: 'E', aggregate: 'A' };

  const renderExecutionPanel = () => (
    <div className="panel-surface flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-700/60 px-4 py-4">
        <div>
          <div className="panel-badge">Execution</div>
          <p className="mt-2 text-sm font-medium text-slate-100">{t.progress.title}</p>
        </div>
        <button
          type="button"
          onClick={() => setIsMobilePanelOpen(false)}
          className="icon-button h-10 w-10 rounded-full md:hidden"
          aria-label="Close execution panel"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="chat-scroll flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {showConfirm && (
          <div className="rounded-2xl border border-purple-500/18 bg-purple-500/8 p-4">
            <p className="text-sm font-medium text-slate-100">{t.chatFirst.startTask}</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">{t.chatFirst.startTaskHint}</p>
            <button
              onClick={handleConfirmTask}
              disabled={isSending || isStreaming}
              className="mt-4 inline-flex items-center rounded-2xl bg-purple-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-400 disabled:opacity-40"
            >
              {t.chatFirst.startTask}
            </button>
          </div>
        )}

        {hasPipelineStarted ? (
          <>
            <div className="rounded-2xl border border-slate-700/55 bg-slate-900/55 p-4">
              <PipelineView
                stages={stages}
                currentStage={currentStage}
                stageLabels={stageLabels}
                stageIcons={stageIcons}
                subtasks={subtasks}
              />
            </div>
            <div className="grid gap-3">
              <CostPanel costStats={costStats} totalCost={totalCost} totalDurationMs={totalDurationMs} />
              <TimePanel totalDurationMs={totalDurationMs} />
            </div>
            {Object.keys(subtasks).length > 0 && (
              <div className="rounded-2xl border border-slate-700/55 bg-slate-900/55 p-4">
                <SubtaskList subtasks={subtasks} />
              </div>
            )}
          </>
        ) : (
          <div className="empty-state-card rounded-[28px] border p-5 text-sm text-slate-400">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-purple-500/18 bg-purple-500/10 text-purple-200">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6v6l4 2m4-2a8 8 0 11-16 0 8 8 0 0116 0z" />
              </svg>
            </div>
            {sessionId ? t.chatFirst.startTaskHint : t.chatFirst.greeting}
          </div>
        )}

        {isError && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-xs text-red-300" role="alert" aria-live="assertive">
            {t.error.failed}: {errorMessage}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl px-3 pb-4 pt-4 md:px-5 md:pb-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{t.chatFirst.taskLabel}</div>
          <div className="mt-1 text-sm text-slate-300">{workspaceDir ?? t.workspace.default}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPanelOpen((open) => !open)}
            className="hidden rounded-2xl border border-slate-700/60 bg-slate-900/70 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-slate-600/70 hover:text-slate-100 md:inline-flex"
          >
            {isPanelOpen ? 'Hide Panel' : 'Show Panel'}
          </button>
          <button
            type="button"
            onClick={() => setIsMobilePanelOpen(true)}
            className="inline-flex rounded-2xl border border-slate-700/60 bg-slate-900/70 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-slate-600/70 hover:text-slate-100 md:hidden"
          >
            Execution
          </button>
          {sessionId && (
            <button
              onClick={handleNewSession}
              className="rounded-2xl border border-slate-700/60 bg-slate-900/70 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-slate-600/70 hover:text-slate-100"
            >
              + {t.progress.newTask}
            </button>
          )}
          <button onClick={() => navigate('/submit')} className="text-xs text-slate-500 transition-colors hover:text-slate-300">
            {t.form.execute}
          </button>
        </div>
      </div>

      <div className={`grid gap-4 ${isPanelOpen ? 'md:grid-cols-[minmax(0,1fr)_320px]' : 'md:grid-cols-[minmax(0,1fr)_48px]'}`}>
        <div className="chat-shell stage-card flex min-h-[calc(100dvh-8rem)] flex-col overflow-hidden p-0" style={{ minHeight: '560px' }}>
          <WorkspaceSelector
            workspaceDir={workspaceDir}
            onUpdate={handleUpdateWorkspace}
            disabled={isSending || hasPipelineStarted}
          />

          <div ref={containerRef} className="chat-scroll flex-1 overflow-y-auto py-4">
            {messages.length === 0 && !isStreaming && (
              <div className="flex justify-center px-5 py-10">
                <div className="empty-state-card max-w-md rounded-[32px] border p-8 text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-3xl border border-purple-500/15 bg-slate-900/90 shadow-lg shadow-purple-500/10">
                    <svg className="h-7 w-7 text-purple-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 3v2m6-2v2m-7 9h8m-9 5h10a2 2 0 002-2V9a2 2 0 00-2-2H7a2 2 0 00-2 2v7a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-sm leading-7 text-slate-400">{t.chatFirst.greeting}</p>
                </div>
              </div>
            )}

            {messages.map((msg, idx) => (
              <ChatMessage
                key={`${msg.timestamp}-${idx}`}
                role={msg.role}
                content={msg.content}
                timestamp={msg.timestamp}
                attachmentIds={msg.attachmentIds}
              />
            ))}

            {isStreaming && streamingContent && (
              <ChatMessage role="assistant" content={streamingContent} timestamp={Date.now()} isStreaming />
            )}

            {isStreaming && !streamingContent && (
              <div className="flex items-start gap-3 px-4 py-2 md:px-5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-purple-500/15 bg-slate-900/80 shadow-lg shadow-purple-500/20">
                  <svg className="h-[18px] w-[18px] text-purple-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 3v2m6-2v2m-8 8h10m-9 5h8a2 2 0 002-2V9a2 2 0 00-2-2H8a2 2 0 00-2 2v7a2 2 0 002 2zm-3-5h2m10 0h2" />
                  </svg>
                </div>
                <div className="message-bubble-assistant rounded-3xl rounded-bl-lg border border-l-2 px-4 py-3 text-sm">
                  {t.chat.streaming}
                </div>
              </div>
            )}

            {sendError && (
              <div className="px-4 pb-3 md:px-5">
                <div className="flex items-center justify-between rounded-2xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-xs text-red-300" role="alert" aria-live="assertive">
                  <span>{sendError}</span>
                  <button onClick={() => setSendError(null)} className="rounded-full p-1 text-red-200 transition-colors hover:bg-red-500/10" aria-label="Dismiss error">
                    <svg className="h-[14px] w-[14px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <ChatInput onSend={handleSend} isDisabled={isStreaming || isSending} sessionId={sessionId} />
        </div>

        {isPanelOpen && (
          <aside className="hidden overflow-hidden rounded-[24px] border border-slate-700/60 shadow-[0_22px_50px_rgba(2,6,23,0.24)] md:block">
            {renderExecutionPanel()}
          </aside>
        )}

        {!isPanelOpen && (
          <aside className="hidden md:flex">
            <button
              type="button"
              onClick={() => setIsPanelOpen(true)}
              className="panel-surface flex h-full min-h-[560px] w-12 items-center justify-center rounded-[24px] border border-slate-700/60 text-slate-300 shadow-[0_22px_50px_rgba(2,6,23,0.24)] transition-colors hover:border-slate-600/70 hover:text-slate-100"
              aria-label="Show execution panel"
            >
              <span className="[writing-mode:vertical-rl] text-[11px] uppercase tracking-[0.24em]">Execution</span>
            </button>
          </aside>
        )}
      </div>

      <div
        className={`fixed inset-0 z-40 bg-slate-950/60 transition-opacity duration-200 md:hidden ${
          isMobilePanelOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setIsMobilePanelOpen(false)}
        aria-hidden={!isMobilePanelOpen}
      />
      <div
        className={`drawer-shell fixed inset-x-0 bottom-0 z-50 max-h-[78vh] rounded-t-[28px] border border-slate-700/60 transition-[transform,opacity] duration-300 md:hidden ${
          isMobilePanelOpen ? 'translate-y-0 opacity-100' : 'translate-y-[104%] opacity-0'
        }`}
        aria-hidden={!isMobilePanelOpen}
      >
        <button
          type="button"
          onClick={() => setIsMobilePanelOpen(false)}
          className="mx-auto mt-3 flex w-full items-center justify-center pb-2"
          aria-label="Close execution panel"
        >
          <span className="drawer-handle h-1.5 w-14 rounded-full" />
        </button>
        {renderExecutionPanel()}
      </div>
    </div>
  );
}
