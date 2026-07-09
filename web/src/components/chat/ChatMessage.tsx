import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { t } from '../../i18n.js';
import FilePreview from './FilePreview.jsx';
import type { FileAttachment } from '../../api/upload.js';
import { usePipelineStore } from '../../store/pipeline-store.js';

interface ChatMessageProps {
  role: string;
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  attachmentIds?: string[];
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return t.chat.justNow;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}${t.chat.minutesAgo}`;
  return new Date(ts).toLocaleTimeString();
}

export default function ChatMessage({ role, content, timestamp, isStreaming, attachmentIds }: ChatMessageProps) {
  const reduceMotion = useReducedMotion();
  const isUser = role === 'user';
  const isSystem = role === 'system';
  const isAssistant = role === 'assistant';
  const attachmentsById = usePipelineStore((s) => s.attachmentsById);

  const attachments: FileAttachment[] = attachmentIds
    ? attachmentIds
        .map((id) => attachmentsById[id])
        .filter((a): a is FileAttachment => a != null)
    : [];

  const initial = reduceMotion ? false : { opacity: 0, y: 12 };
  const animate = { opacity: 1, y: 0 };

  if (isSystem) {
    return (
      <motion.div initial={initial} animate={animate} className="flex justify-center px-4 py-2">
        <div className="max-w-[80%] rounded-full border border-slate-700/50 bg-slate-900/65 px-3 py-1 text-center text-xs italic text-slate-500">
          {content}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={initial}
      animate={animate}
      className={`flex gap-3 px-3 py-2 md:px-5 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {isAssistant && (
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-purple-500/15 bg-slate-900/80 text-purple-200 shadow-lg shadow-purple-500/20">
          <svg className="h-[18px] w-[18px] text-purple-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 3v2m6-2v2m-8 8h10m-9 5h8a2 2 0 002-2V9a2 2 0 00-2-2H8a2 2 0 00-2 2v7a2 2 0 002 2zm-3-5h2m10 0h2" />
          </svg>
        </div>
      )}

      <div className={`max-w-[88%] space-y-1.5 md:max-w-[80%] ${isUser ? 'order-first items-end' : ''}`}>
        <div
          className={`rounded-3xl px-4 py-3 text-sm leading-6 ${
            isUser
              ? 'message-bubble-user rounded-br-lg border'
              : 'message-bubble-assistant rounded-bl-lg border border-l-2'
          } ${isStreaming ? 'streaming-cursor' : ''}`}
        >
          <div className="whitespace-pre-wrap break-words">{content}</div>
        </div>

        {attachments.length > 0 && (
          <div className="chat-scroll flex flex-wrap gap-2 overflow-x-auto pb-1 md:overflow-visible">
            {attachments.map((att) => (
              <FilePreview key={att.id} attachment={att} status="ready" />
            ))}
          </div>
        )}

        <div className={`text-[10px] text-slate-500 ${isUser ? 'text-right' : 'text-left'}`}>
          {isUser ? t.chat.user : t.chat.assistant} | {formatTime(timestamp)}
        </div>
      </div>

      {isUser && (
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-700/60 bg-slate-900/85 text-slate-200 shadow-lg shadow-slate-950/10">
          <svg className="h-[18px] w-[18px] text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 8a3 3 0 11-6 0 3 3 0 016 0zm-9 9a6 6 0 1112 0H6z" />
          </svg>
        </div>
      )}
    </motion.div>
  );
}
