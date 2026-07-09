import React, { useEffect, useRef, useCallback, useState } from 'react';
import { usePipelineStore } from '../../store/pipeline-store.js';
import { sendMessage, reconstructSession } from '../../api/client.js';
import { t } from '../../i18n.js';
import ChatMessage from './ChatMessage.js';
import ChatInput from './ChatInput.js';

interface ChatPanelProps {
  sessionId: string;
  variant?: 'inline' | 'drawer';
  isOpen?: boolean;
  onClose?: () => void;
}

export default function ChatPanel({ sessionId, variant = 'inline', isOpen, onClose }: ChatPanelProps) {
  const messages = usePipelineStore((s) => s.messages);
  const isStreaming = usePipelineStore((s) => s.isStreaming);
  const streamingContent = usePipelineStore((s) => s.streamingContent);
  const addUserMessage = usePipelineStore((s) => s.addUserMessage);
  const removeLastUserMessage = usePipelineStore((s) => s.removeLastUserMessage);
  const isComplete = usePipelineStore((s) => s.isComplete);
  const isError = usePipelineStore((s) => s.isError);

  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback((force = false) => {
    const el = containerRef.current;
    if (!el) return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 120;
    if (force || nearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  const handleSend = async (message: string, attachmentIds: string[]) => {
    setSendError(null);
    setIsSending(true);
    addUserMessage(message, attachmentIds.length > 0 ? attachmentIds : undefined);
    scrollToBottom(true);

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

  const handleReconstruct = async () => {
    setSendError(null);
    try {
      await reconstructSession(sessionId);
    } catch (err: any) {
      setSendError(err.message || t.chat.error);
    }
  };

  const panelContent = (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-slate-700/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <h3 className="text-sm font-semibold text-white">{t.chat.title}</h3>
          </div>
          <div className="flex items-center gap-2">
            {isComplete && (
              <button
                onClick={handleReconstruct}
                className="rounded bg-slate-700/50 px-2.5 py-1 text-[10px] font-medium text-slate-400 transition-all hover:bg-slate-700 hover:text-slate-200"
                title={t.chat.reconstruct}
              >
                {t.chat.reconstruct}
              </button>
            )}
            {variant === 'drawer' && onClose && (
              <button onClick={onClose} className="text-slate-500 hover:text-slate-300" aria-label="Close chat">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-y-auto py-2 scroll-smooth">
        {messages.length === 0 && !isStreaming && (
          <div className="flex h-full items-center justify-center px-4">
            <p className="text-center text-xs text-slate-600">{t.chat.empty}</p>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessage
            key={(msg as any).id ?? `${msg.role}-${msg.timestamp}-${msg.content.slice(0, 32)}`}
            role={msg.role}
            content={msg.content}
            timestamp={msg.timestamp}
            attachmentIds={(msg as any).attachmentIds}
          />
        ))}

        {isStreaming && streamingContent && (
          <ChatMessage role="assistant" content={streamingContent} timestamp={Date.now()} isStreaming />
        )}

        {isStreaming && !streamingContent && (
          <div className="flex justify-start gap-2 px-3 py-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-blue-600">
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="rounded-2xl rounded-bl-md border border-slate-700/50 bg-slate-800/80 px-4 py-3">
              <div className="flex gap-1.5">
                <span className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {sendError && (
        <div className="mx-3 mb-1 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-400">
          {sendError}
          <button onClick={() => setSendError(null)} className="ml-2 text-red-300 hover:text-red-200" aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}

      {isError && (
        <div className="mx-3 mb-1 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-400">
          {t.error.failed}
          <button onClick={handleReconstruct} className="ml-2 text-red-300 underline hover:text-red-200">
            {t.chat.reconstruct}
          </button>
        </div>
      )}

      <ChatInput onSend={handleSend} isDisabled={isStreaming || isSending} sessionId={sessionId} />
    </div>
  );

  if (variant === 'drawer') {
    return (
      <>
        {isOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} />}
        <div
          className={`fixed inset-x-0 bottom-0 z-50 h-[70vh] rounded-t-2xl border-t border-slate-700/50 bg-slate-900 shadow-2xl transition-transform duration-300 lg:hidden ${
            isOpen ? 'translate-y-0' : 'translate-y-full'
          }`}
        >
          {panelContent}
        </div>
      </>
    );
  }

  return (
    <div className="stage-card flex flex-col overflow-hidden p-0" style={{ height: 'calc(100vh - 160px)', minHeight: '400px' }}>
      {panelContent}
    </div>
  );
}
