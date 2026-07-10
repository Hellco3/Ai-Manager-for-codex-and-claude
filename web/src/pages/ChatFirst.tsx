import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePipelineStore } from '../store/pipeline-store.js';
import { useSessionStore } from '../store/session-store.js';
import { useSSE } from '../hooks/useSSE.js';
import { postTask, sendMessage, confirmTask, updateWorkspace, getTask } from '../api/client.js';
import { langName, t } from '../i18n.js';
import ChatMessage from '../components/chat/ChatMessage.js';
import ChatInput from '../components/chat/ChatInput.js';
import WorkspaceSelector from '../components/chat/WorkspaceSelector.js';
import PipelineView from '../components/pipeline/PipelineView.js';
import SubtaskList from '../components/pipeline/SubtaskList.js';
import DecompositionReview from '../components/task/DecompositionReview.js';
import CostPanel from '../components/stats/CostPanel.js';
import TimePanel from '../components/stats/TimePanel.js';
import { useUploadStore } from '../store/upload-store.js';

export default function ChatFirst() {
  const isZh = langName === 'zh';
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
  const decomposition = usePipelineStore((s) => s.decomposition);
  const isComplete = usePipelineStore((s) => s.isComplete);
  const isError = usePipelineStore((s) => s.isError);
  const errorMessage = usePipelineStore((s) => s.errorMessage);
  const statusMessage = usePipelineStore((s) => s.statusMessage);
  const statusStep = usePipelineStore((s) => s.statusStep);
  const statusProgress = usePipelineStore((s) => s.statusProgress);
  const statusStartedAt = usePipelineStore((s) => s.statusStartedAt);
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

  // Poll for updates when the pipeline hasn't received decomposition yet,
  // but ONLY while decomposing (not during execution where SSE is sufficient)
  useEffect(() => {
    if (!sessionId) return;
    if (decomposition) return;  // already have decomposition, SSE handles the rest
    if (currentStage && currentStage !== 'decompose' && currentStage !== '') return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (cancelled) return;
      try {
        const session = await getTask(sessionId);
        if (!cancelled) hydrateFromSession(session);
      } catch {
      }
    }, 1500);

    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [sessionId, !!decomposition, currentStage, hydrateFromSession]);

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

  // Elapsed time counter: ticks every second while processing
  const elapsedRef = useRef(0);
  const [elapsedDisplay, setElapsedDisplay] = useState<string>('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (statusStartedAt) {
      elapsedRef.current = 0;
      const tick = () => {
        elapsedRef.current++;
        const s = elapsedRef.current;
        if (s < 60) {
          setElapsedDisplay(`${s}s`);
        } else {
          setElapsedDisplay(`${Math.floor(s / 60)}m ${s % 60}s`);
        }
      };
      tick();
      timerRef.current = setInterval(tick, 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    } else {
      setElapsedDisplay('');
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
  }, [statusStartedAt]);

  const handleSend = async (message: string, attachmentIds: string[]) => {
    setSendError(null);
    setIsSending(true);
    scrollToBottom(true);

    // Detect confirmation keywords in user message
    const confirmPattern = /开始执行|开始拆解|开始吧|执行任务|拆解并执行|开始任务|确认执行|run it|start it|execute/i;
    if (sessionId && confirmPattern.test(message.trim()) && !hasPipelineStarted) {
      addUserMessage(message, attachmentIds.length > 0 ? attachmentIds : undefined);
      try {
        await confirmTask(sessionId, undefined, workspaceDir ?? undefined, message.trim());
        window.setTimeout(async () => {
          try {
            const session = await getTask(sessionId);
            hydrateFromSession(session);
          } catch {
          }
        }, 1200);
        setIsMobilePanelOpen(false);
      } catch (err: any) {
        setSendError(err.message || t.chat.error);
      } finally {
        setIsSending(false);
      }
      return true;
    }

    // Auto-confirm guard: if the user has been discussing but hasn't confirmed yet,
    // the AI should be asking for confirmation. Do NOT bypass with the keyword detection.
    // If no keywords match, just send the message normally — AI will guide to confirm.

    if (!sessionId) {
      try {
        const hasStagedAttachments = useUploadStore.getState().items.some(
          (item) => item.status === 'ready' && !item.attachment,
        );

        if (hasStagedAttachments) {
          const initialTask = message || 'Attachment message';
          const result = await postTask(initialTask, 'chat-first', workspaceDir ?? undefined, true);
          const uploaded = await useUploadStore.getState().uploadStaged(result.sessionId);
          const uploadedIds = uploaded.map((attachment) => attachment.id);
          await sendMessage(result.sessionId, message, uploadedIds.length > 0 ? uploadedIds : undefined);
          setSession(result.sessionId, initialTask, 'chat-first');
          addUserMessage(message, uploadedIds.length > 0 ? uploadedIds : undefined);
        } else {
          const result = await postTask(message, 'chat-first', workspaceDir ?? undefined);
          setSession(result.sessionId, message, 'chat-first');
          addUserMessage(message, attachmentIds.length > 0 ? attachmentIds : undefined);
        }
        return true;
      } catch (err: any) {
        setSendError(err.message || t.chat.error);
        return false;
      } finally {
        setIsSending(false);
      }
    }

    addUserMessage(message, attachmentIds.length > 0 ? attachmentIds : undefined);
    try {
      await sendMessage(sessionId, message, attachmentIds.length > 0 ? attachmentIds : undefined);
      return true;
    } catch (err: any) {
      setSendError(err.message || t.chat.error);
      removeLastUserMessage();
      return false;
    } finally {
      setIsSending(false);
    }
  };

  const handleConfirmTask = async () => {
    if (!sessionId) return;
    setSendError(null);
    try {
      await confirmTask(sessionId, undefined, workspaceDir ?? undefined, '开始执行');
      window.setTimeout(async () => {
        try {
          const session = await getTask(sessionId);
          hydrateFromSession(session);
        } catch {
        }
      }, 1200);
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
    useUploadStore.getState().clearReady();
    useUploadStore.setState({ items: [], isUploading: false });
    reset();
    useSessionStore.getState().reset();
    setSendError(null);
    setIsMobilePanelOpen(false);
  };

  const hasPipelineStarted = !!currentStage && currentStage !== 'decompose' && Object.keys(subtasks).length > 0;
  const hasExecutionActivity = !!currentStage || !!decomposition || !!statusMessage;
  const showConfirm = !!sessionId && !hasExecutionActivity && !isComplete;
  const showDecomposition = !!decomposition && (currentStage === 'decompose' || currentStage === 'execute' || currentStage === 'aggregate' || hasPipelineStarted || isComplete);
  const stageLabels = t.stages;
  const stageIcons: Record<string, string> = { decompose: 'D', review: 'R', execute: 'E', aggregate: 'A' };
  const executionLabel = isZh ? '执行面板' : 'Execution';
  const closeExecutionLabel = isZh ? '关闭执行面板' : 'Close execution panel';
  const hidePanelLabel = isZh ? '收起面板' : 'Hide Panel';
  const showPanelLabel = isZh ? '展开面板' : 'Show Panel';

  const renderExecutionPanel = () => (
    <div className="panel-surface flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-700/60 px-4 py-4">
        <div>
          <div className="panel-badge">{executionLabel}</div>
          <p className="mt-2 text-sm font-medium text-slate-100">{t.progress.title}</p>
        </div>
        <button
          type="button"
          onClick={() => setIsMobilePanelOpen(false)}
          className="icon-button h-10 w-10 rounded-full md:hidden"
          aria-label={closeExecutionLabel}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="chat-scroll flex-1 min-h-0 space-y-4 overflow-y-auto px-4 py-4">
        {showConfirm && (
          <div className="subtle-panel-strong rounded-2xl border p-4">
            <p className="text-sm font-medium text-slate-100">{t.chatFirst.startTask}</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">{t.chatFirst.startTaskHint}</p>
            <button
              onClick={handleConfirmTask}
              disabled={isSending || isStreaming}
              className="surface-chip-strong mt-4 disabled:opacity-40"
            >
              {t.chatFirst.startTask}
            </button>
          </div>
        )}

        {showDecomposition && decomposition ? (
          <div className="space-y-4">
            {/* Decomposition overview */}
            <div className="subtle-panel-strong rounded-2xl border p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-purple-300/80 mb-2">{t.stages.decompose}</p>
              <p className="text-sm leading-6 text-slate-300">{decomposition.overview}</p>
              <p className="mt-2 text-[11px] text-slate-500">
                {decomposition.executionOrder.join(' -> ')}
                {decomposition.estimatedTimeMinutes && (
                  <span className="ml-2">· est. {decomposition.estimatedTimeMinutes}min</span>
                )}
              </p>
            </div>

            {hasPipelineStarted ? (
              <>
                <div className="subtle-panel rounded-2xl border p-4">
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
                  <div className="subtle-panel rounded-2xl border p-4">
                    <SubtaskList subtasks={subtasks} />
                  </div>
                )}
              </>
            ) : (
              <div className="subtle-panel rounded-2xl border p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-3">{t.subtask.title}</p>
                <div className="space-y-2">
                  {decomposition.subtasks.map((st, idx) => {
                    const kindColors: Record<string, string> = {
                      code: 'border-cyan-500/20 bg-cyan-500/8 text-cyan-300',
                      analysis: 'border-purple-500/20 bg-purple-500/8 text-purple-300',
                      design: 'border-pink-500/20 bg-pink-500/8 text-pink-300',
                      research: 'border-amber-500/20 bg-amber-500/8 text-amber-300',
                      integration: 'border-teal-500/20 bg-teal-500/8 text-teal-300',
                    };
                    const kindClass = kindColors[st.kind] ?? 'border-slate-700/30 bg-slate-800/30';
                    return (
                      <div key={st.id} className={`rounded-xl border px-3 py-2.5 ${kindClass}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-mono text-slate-500">{idx + 1}.</span>
                          <span className="text-[10px] uppercase font-semibold tracking-wider">{st.kind}</span>
                          {st.dependencies.length > 0 && (
                            <span className="text-[10px] text-slate-500">deps: {st.dependencies.join(', ')}</span>
                          )}
                        </div>
                        <p className="text-xs leading-5">{st.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : hasPipelineStarted ? (
          <>
            <div className="subtle-panel rounded-2xl border p-4">
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
              <div className="subtle-panel rounded-2xl border p-4">
                <SubtaskList subtasks={subtasks} />
              </div>
            )}
          </>
        ) : (
          <div className="empty-state-card rounded-[28px] border p-5 text-sm text-slate-400">
            <div className="accent-icon-surface mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border">
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Processing indicator */}
      {statusMessage && (
        <div className="mb-1 flex items-center gap-2 px-4 pt-3">
          <div className="flex items-center gap-1.5 text-sm text-purple-300/80">
            <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>{statusMessage}</span>
            {elapsedDisplay && (
              <span className="text-[11px] text-purple-400/60 ml-0.5 tabular-nums">{elapsedDisplay}</span>
            )}
          </div>
          <span className="inline-flex gap-0.5">
            <span className="w-1 h-1 rounded-full bg-purple-400/60 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-1 rounded-full bg-purple-400/60 animate-bounce" style={{ animationDelay: '200ms' }} />
            <span className="w-1 h-1 rounded-full bg-purple-400/60 animate-bounce" style={{ animationDelay: '400ms' }} />
          </span>
        </div>
      )}
      {/* Top bar — compact */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-700/30">
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500 shrink-0">{t.chatFirst.taskLabel}</div>
          <div className="text-xs text-slate-400 truncate">{workspaceDir ?? t.workspace.default}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsPanelOpen((open) => !open)}
            className="surface-chip text-[11px] hidden md:inline-flex"
          >
            {isPanelOpen ? hidePanelLabel : showPanelLabel}
          </button>
          <button
            type="button"
            onClick={() => setIsMobilePanelOpen(true)}
            className="surface-chip text-[11px] md:hidden"
          >
            {executionLabel}
          </button>
          {sessionId && (
            <button onClick={handleNewSession} className="surface-chip text-[11px]">
              + {t.progress.newTask}
            </button>
          )}
        </div>
      </div>

      {/* Grid: right panel width adapts — 344px idle, 420px decomposition, 520px execution */}
      <div
        className={`grid min-h-0 flex-1 gap-4 overflow-hidden transition-[grid-template-columns] duration-500 ease-out ${
          isPanelOpen
            ? hasPipelineStarted
              ? 'md:grid-cols-[minmax(0,1fr)_minmax(460px,560px)]'
              : showDecomposition && decomposition
                ? 'md:grid-cols-[minmax(0,1fr)_minmax(420px,500px)]'
                : 'md:grid-cols-[minmax(0,1fr)_360px]'
            : 'md:grid-cols-[minmax(0,1fr)_48px]'
        }`}
      >
        <div className="chat-shell stage-card flex h-full min-h-0 flex-col overflow-hidden p-0">
          <WorkspaceSelector
            workspaceDir={workspaceDir}
            onUpdate={handleUpdateWorkspace}
            disabled={isSending || hasPipelineStarted}
          />

          <div ref={containerRef} className="chat-scroll flex-1 min-h-0 overflow-y-auto px-4 py-3">
            {messages.length === 0 && !isStreaming && (
              <div className="flex justify-center px-5 py-10">
                <div className="empty-state-card max-w-md rounded-[32px] border p-8 text-center">
                  <div className="accent-icon-surface mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-3xl border">
                    <svg className="h-7 w-7 text-current" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 3v2m6-2v2m-7 9h8m-9 5h10a2 2 0 002-2V9a2 2 0 00-2-2H7a2 2 0 00-2 2v7a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-sm leading-7 text-slate-400">{t.chatFirst.greeting}</p>
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <ChatMessage
                key={msg.id ?? `${msg.role}-${msg.timestamp}-${msg.content.slice(0, 32)}`}
                role={msg.role}
                content={msg.content}
                timestamp={msg.timestamp}
                attachmentIds={msg.attachmentIds}
                messageType={(msg as any).messageType}
              />
            ))}

            {isStreaming && streamingContent && (
              <ChatMessage role="assistant" content={streamingContent} timestamp={Date.now()} isStreaming />
            )}

            {isStreaming && !streamingContent && (
              <div className="flex items-start gap-3 px-4 py-2 md:px-5">
                <div className="accent-icon-surface flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border">
                  <svg className="h-[18px] w-[18px] text-current" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
          <aside className="subtle-panel hidden h-full min-h-0 overflow-hidden rounded-[24px] border md:block">
            {renderExecutionPanel()}
          </aside>
        )}

        {!isPanelOpen && (
          <aside className="hidden h-full min-h-0 md:flex">
            <button
              type="button"
              onClick={() => setIsPanelOpen(true)}
              className="panel-surface flex h-full w-12 items-center justify-center rounded-[24px] border text-slate-300 transition-colors hover:text-slate-100"
              aria-label={showPanelLabel}
            >
              <span className="[writing-mode:vertical-rl] text-[11px] uppercase tracking-[0.24em]">{executionLabel}</span>
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
          aria-label={closeExecutionLabel}
        >
          <span className="drawer-handle h-1.5 w-14 rounded-full" />
        </button>
        {renderExecutionPanel()}
      </div>
    </div>
  );
}
