import React from 'react';
import { t } from '../../i18n.js';

interface ChatMessageProps {
  role: string;
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return t.chat.justNow;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}${t.chat.minutesAgo}`;
  return new Date(ts).toLocaleTimeString();
}

export default function ChatMessage({ role, content, timestamp, isStreaming }: ChatMessageProps) {
  const isUser = role === 'user';
  const isSystem = role === 'system';
  const isAssistant = role === 'assistant';

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <div className="px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700/30 text-xs text-slate-500 italic max-w-[80%] text-center">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-2 px-3 py-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {/* Avatar (assistant side) */}
      {isAssistant && (
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shrink-0 mt-0.5">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
      )}

      <div className={`max-w-[85%] ${isUser ? 'order-first' : ''}`}>
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
            isUser
              ? 'bg-blue-600/30 border border-blue-500/30 text-blue-50 rounded-br-md'
              : 'bg-slate-800/80 border border-slate-700/50 text-slate-200 rounded-bl-md'
          } ${isStreaming ? 'streaming-cursor' : ''}`}
        >
          <div className="whitespace-pre-wrap break-words">
            {content}
            {isStreaming && (
              <span className="inline-block w-0.5 h-4 bg-blue-400 ml-0.5 animate-pulse align-text-bottom" />
            )}
          </div>
        </div>
        <div className={`text-[10px] text-slate-600 mt-1 ${isUser ? 'text-right' : 'text-left'}`}>
          {isUser ? t.chat.user : t.chat.assistant} · {formatTime(timestamp)}
        </div>
      </div>

      {/* Avatar (user side) */}
      {isUser && (
        <div className="w-7 h-7 rounded-lg bg-slate-700 border border-slate-600 flex items-center justify-center shrink-0 mt-0.5">
          <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
      )}
    </div>
  );
}
