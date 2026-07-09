import React, { useState, useRef, useCallback, useEffect } from 'react';
import { t } from '../../i18n.js';
import type { FileAttachment } from '../../api/upload.js';
import { useUploadStore } from '../../store/upload-store.js';
import FilePreview from './FilePreview.jsx';

interface ChatInputProps {
  onSend: (message: string, attachmentIds: string[]) => void;
  isDisabled: boolean;
  sessionId: string | null;
}

export default function ChatInput({ onSend, isDisabled, sessionId }: ChatInputProps) {
  const [text, setText] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const { items, enqueue, removeItem, clearReady, retryItem, isUploading } = useUploadStore();

  // Auto-resize textarea
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, []);

  useEffect(() => {
    autoResize();
  }, [text, autoResize]);

  // Offline detection
  useEffect(() => {
    const handleOffline = () => setText((t2) => t2); // trigger re-render with banner state
    const handleOnline = () => setText((t2) => t2);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  const readyIds = items
    .filter((item) => item.status === 'ready' && item.attachment)
    .map((item) => item.attachment!.id);

  const hasUploading = items.some((item) => item.status === 'queued' || item.status === 'uploading');

  const handleSend = () => {
    const trimmed = text.trim();
    if (isDisabled || hasUploading) return;
    if (!trimmed && readyIds.length === 0) return;
    onSend(trimmed, readyIds);
    setText('');
    clearReady();
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Accept files (from paste, drop, or file picker)
  const acceptFiles = useCallback(
    async (files: File[]) => {
      if (!sessionId || files.length === 0) return;
      try {
        await enqueue(files, sessionId);
      } catch {
        // Error handled by store
      }
    },
    [sessionId, enqueue],
  );

  // Paste handler
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items2 = e.clipboardData?.files;
      if (items2 && items2.length > 0) {
        e.preventDefault();
        acceptFiles(Array.from(items2));
      }
    },
    [acceptFiles],
  );

  // Drag handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      dragCounterRef.current = 0;
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        acceptFiles(Array.from(files));
      }
    },
    [acceptFiles],
  );

  // File picker
  const handleFileButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      acceptFiles(Array.from(files));
    }
    // Reset input so the same file can be selected again
    e.target.value = '';
  };

  // Retry a failed upload
  const handleRetry = async (id: string) => {
    if (!sessionId) return;
    await retryItem(id, sessionId);
  };

  const pendingItems = items.filter(
    (item) => item.status === 'queued' || item.status === 'uploading' || item.status === 'failed',
  );
  const readyItems = items.filter((item) => item.status === 'ready');

  return (
    <div className="border-t border-slate-700/30 p-4" aria-describedby="upload-hint">
      {/* Gradient accent line */}
      <div className="h-px bg-gradient-to-r from-blue-500/50 via-purple-500/50 to-transparent -mt-4 mb-3" />

      {/* Offline banner */}
      {!isOnline && (
        <div className="mb-2 px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-400 text-center">
          Offline — uploads paused
        </div>
      )}

      {/* Drag overlay */}
      {isDragOver && (
        <div
          className="drag-overlay absolute inset-x-0 bottom-0 z-10 mx-4 mb-4 rounded-xl"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center gap-2 text-blue-300">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span className="text-sm font-medium">{t.upload?.dropHere ?? 'Drop to upload'}</span>
          </div>
        </div>
      )}

      {/* Attachment previews row */}
      {(pendingItems.length > 0 || readyItems.length > 0) && (
        <div className="flex gap-2 mb-2 overflow-x-auto pb-1 scrollbar-thin" role="status" aria-live="polite">
          {pendingItems.map((item) => (
            <FilePreview
              key={item.id}
              fileName={item.file.name}
              fileSize={item.file.size}
              mimeType={item.file.type}
              status={item.status === 'uploading' ? 'uploading' : 'failed'}
              onRemove={() => removeItem(item.id)}
              onRetry={item.status === 'failed' ? () => handleRetry(item.id) : undefined}
            />
          ))}
          {readyItems.map((item) => (
            <FilePreview
              key={item.id}
              attachment={item.attachment ?? undefined}
              status="ready"
              onRemove={() => removeItem(item.id)}
            />
          ))}
        </div>
      )}

      {/* Main input area */}
      <div className="flex items-end gap-2">
        {/* File button */}
        <button
          type="button"
          onClick={handleFileButtonClick}
          disabled={isDisabled || !isOnline}
          className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-slate-800/60 border border-slate-700/40 text-slate-400 hover:text-blue-400 hover:border-blue-500/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
          title={t.upload?.addFile ?? 'Add file'}
          aria-label={t.upload?.addFile ?? 'Add file'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.txt,.json,.zip,.xml,.md,.csv,.js,.ts,.py,.html,.css"
          className="hidden"
          onChange={handleFileInputChange}
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={t.chat.placeholder}
          rows={1}
          className="flex-1 bg-slate-800/60 border border-slate-700/40 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all min-h-[36px] max-h-[200px]"
          disabled={isDisabled}
          aria-label="Message input"
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={hasUploading || (!text.trim() && readyIds.length === 0) || isDisabled}
          className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-500/25 transition-all shrink-0"
          title={t.chat.send}
          aria-label={t.chat.send}
        >
          {hasUploading || isDisabled ? (
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </button>
      </div>

      {/* Hint text */}
      <p id="upload-hint" className="mt-1.5 text-[10px] text-slate-600 text-center">
        {t.upload?.pasteHint ?? 'Paste images/files supported'} · Shift+Enter for new line
      </p>
    </div>
  );
}
