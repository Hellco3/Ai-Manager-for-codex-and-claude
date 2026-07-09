import React, { useState, useRef, useCallback, useEffect } from 'react';
import { t } from '../../i18n.js';
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
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const { items, enqueue, removeItem, clearReady, retryItem } = useUploadStore();

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, []);

  useEffect(() => {
    autoResize();
  }, [text, autoResize]);

  useEffect(() => {
    const handleOffline = () => setText((value) => value);
    const handleOnline = () => setText((value) => value);
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

  const acceptFiles = useCallback(
    async (files: File[]) => {
      if (!sessionId || files.length === 0) return;
      try {
        await enqueue(files, sessionId);
      } catch {
      }
    },
    [sessionId, enqueue],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const pastedFiles = e.clipboardData?.files;
      if (pastedFiles && pastedFiles.length > 0) {
        e.preventDefault();
        acceptFiles(Array.from(pastedFiles));
      }
    },
    [acceptFiles],
  );

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
      const droppedFiles = e.dataTransfer?.files;
      if (droppedFiles && droppedFiles.length > 0) {
        acceptFiles(Array.from(droppedFiles));
      }
    },
    [acceptFiles],
  );

  const handleFileButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleCameraButtonClick = () => {
    cameraInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      acceptFiles(Array.from(selectedFiles));
    }
    e.target.value = '';
  };

  const handleRetry = async (id: string) => {
    if (!sessionId) return;
    await retryItem(id, sessionId);
  };

  const pendingItems = items.filter(
    (item) => item.status === 'queued' || item.status === 'uploading' || item.status === 'failed',
  );
  const readyItems = items.filter((item) => item.status === 'ready');

  return (
    <div
      className="sticky bottom-0 z-20 border-t border-slate-700/60 bg-slate-950/85 px-3 pt-3 backdrop-blur-xl md:px-5"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      aria-describedby="upload-hint"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {!isOnline && (
        <div className="mb-3 rounded-2xl border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-center text-xs text-amber-300">
          Offline - uploads paused
        </div>
      )}

      {isDragOver && (
        <div
          className="drag-overlay absolute inset-x-3 bottom-3 z-10 hidden min-h-[132px] items-center justify-center md:flex md:inset-x-5"
          aria-describedby="upload-hint"
        >
          <div className="flex flex-col items-center gap-2 text-purple-200">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16V5m0 0l-4 4m4-4l4 4M5 17v1a2 2 0 002 2h10a2 2 0 002-2v-1" />
            </svg>
            <span className="text-sm font-medium">{t.upload?.dropHere ?? 'Drop to upload'}</span>
          </div>
        </div>
      )}

      {(pendingItems.length > 0 || readyItems.length > 0) && (
        <div
          className="chat-scroll mb-3 flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible"
          role="status"
          aria-live="polite"
        >
          {pendingItems.map((item) => (
            <FilePreview
              key={item.id}
              fileName={item.file.name}
              fileSize={item.file.size}
              mimeType={item.file.type}
              status={item.status}
              progress={item.progress}
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

      <div className="surface-outline-strong flex items-end gap-2 rounded-[30px] border p-2 shadow-[0_-8px_30px_rgba(2,6,23,0.28)]">
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleFileButtonClick}
            disabled={isDisabled || !isOnline}
            className="icon-button h-10 w-10"
            title={t.upload?.addFile ?? 'Add file'}
            aria-label={t.upload?.addFile ?? 'Add file'}
          >
            <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 5v14m7-7H5" />
            </svg>
          </button>

          <button
            type="button"
            onClick={handleCameraButtonClick}
            disabled={isDisabled || !isOnline}
            className="icon-button h-10 w-10 md:hidden"
            title="Camera"
            aria-label="Camera"
          >
            <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9a2 2 0 012-2h2l1.2-2h7.6L17 7h2a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V9zm9 8a4 4 0 100-8 4 4 0 000 8z" />
            </svg>
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.txt,.json,.zip,.xml,.md,.csv,.js,.ts,.py,.html,.css"
          className="hidden"
          onChange={handleFileInputChange}
        />

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileInputChange}
        />

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={t.chat.placeholder}
          rows={1}
          className="min-h-[40px] max-h-[200px] flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-6 text-slate-100 placeholder-slate-500 outline-none"
          disabled={isDisabled}
          aria-label="Message input"
        />

        <button
          onClick={handleSend}
          disabled={hasUploading || (!text.trim() && readyIds.length === 0) || isDisabled}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-purple-500 text-white shadow-[0_8px_22px_rgba(168,85,247,0.3)] transition-colors hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-40"
          title={t.chat.send}
          aria-label={t.chat.send}
        >
          {hasUploading || isDisabled ? (
            <svg className="h-[18px] w-[18px] animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 12h12m0 0l-4-4m4 4l-4 4" />
            </svg>
          )}
        </button>
      </div>

      <p id="upload-hint" className="mt-2 px-1 text-[11px] text-slate-500">
        {t.upload?.pasteHint ?? 'Paste images/files supported'} | Shift+Enter for new line
      </p>
    </div>
  );
}
