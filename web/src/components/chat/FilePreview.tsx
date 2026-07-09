import React, { useState, useCallback, useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { FileAttachment } from '../../api/upload.js';
import { getUploadUrl } from '../../api/upload.js';
import { langName } from '../../i18n.js';

interface FilePreviewProps {
  attachment?: FileAttachment;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  status?: 'queued' | 'uploading' | 'ready' | 'failed';
  progress?: number;
  previewUrl?: string | null;
  onRemove?: () => void;
  onRetry?: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function getFileIcon(mimeType: string): React.ReactNode {
  if (mimeType.startsWith('image/')) return 'IMG';
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('zip')) return 'ZIP';
  if (mimeType.startsWith('text/')) return 'TXT';
  if (mimeType.includes('json')) return 'JSON';
  return 'FILE';
}

export default function FilePreview({
  attachment,
  fileName,
  fileSize,
  mimeType,
  status = 'ready',
  progress = 0,
  previewUrl,
  onRemove,
  onRetry,
}: FilePreviewProps) {
  const isZh = langName === 'zh';
  const reduceMotion = useReducedMotion();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
  const name = attachment?.originalName ?? fileName ?? 'unknown';
  const size = attachment?.size ?? fileSize ?? 0;
  const mime = attachment?.mimeType ?? mimeType ?? 'application/octet-stream';
  const isImage = mime.startsWith('image/');
  const imageSrc = attachment ? getUploadUrl(attachment.storageKey) : previewUrl ?? undefined;

  const openLightbox = useCallback(() => {
    if (isImage && attachment) {
      setLightboxOpen(true);
    }
  }, [attachment, isImage]);

  const handlePreviewKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openLightbox();
      }
    },
    [openLightbox],
  );

  const handleLightboxKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setLightboxOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!lightboxOpen) return;
    const originalOverflow = document.body.style.overflow;
    lastFocusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusables?.[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setLightboxOpen(false);
        return;
      }

      if (event.key !== 'Tab') return;
      // 审计结论：将 Tab 焦点限制在灯箱可交互元素内，避免穿透到底层页面。
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const focusableElements = nodes ? Array.from(nodes).filter((node) => !node.hasAttribute('disabled')) : [];
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
      lastFocusedElementRef.current?.focus?.();
    };
  }, [lightboxOpen]);

  useEffect(() => {
    if (!attachment && lightboxOpen) {
      // 审计结论：附件被移除、会话重置或视图卸载时主动关闭灯箱，避免残留遮罩。
      setLightboxOpen(false);
    }
  }, [attachment, lightboxOpen]);

  const lightboxMotion = reduceMotion
    ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

  const cardMotion = reduceMotion
    ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 1 } }
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 } };

  const uploadProgress = status === 'uploading' ? progress : status === 'queued' ? 15 : 100;

  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        {(status === 'queued' || status === 'uploading') && (
          <motion.div
            key={`${name}-uploading`}
            {...cardMotion}
            className="file-card group relative min-w-[220px] shrink-0 flex-col items-stretch"
            role="status"
            aria-live="polite"
            aria-label={`${isZh ? '上传中' : 'Uploading'} ${name}`}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-700/60 bg-slate-800/70 text-[11px] font-semibold tracking-[0.12em] text-slate-300">
                {getFileIcon(mime)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-200">{name}</p>
                <p className="text-[11px] text-slate-500">{isZh ? '上传中...' : 'Uploading...'}</p>
              </div>
              {onRemove && (
                <button
                  type="button"
                  onClick={onRemove}
                  className="icon-button h-7 w-7 rounded-full"
                  aria-label={isZh ? '移除附件' : 'Remove'}
                >
                  <svg className="h-[14px] w-[14px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800/95">
              <div
                className="h-full rounded-full bg-purple-500 transition-[width] duration-300 ease-linear"
                style={{ width: `${Math.min(Math.max(uploadProgress, 0), 100)}%` }}
              />
            </div>
          </motion.div>
        )}

        {status === 'failed' && (
          <motion.div
            key={`${name}-failed`}
            {...cardMotion}
            className="file-card min-w-[220px] shrink-0 flex-col items-stretch border-red-500/25 bg-red-500/6"
            role="alert"
            aria-live="assertive"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-[11px] font-semibold tracking-[0.12em] text-red-200">
                FAIL
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-200">{name}</p>
                <p className="text-[11px] text-red-300">{isZh ? '上传失败' : 'Upload failed'}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2 text-[11px]">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded-full border border-purple-500/25 bg-purple-500/10 px-2.5 py-1 text-purple-200 transition-colors hover:bg-purple-500/18"
                >
                  {isZh ? '重试' : 'Retry'}
                </button>
              )}
              {onRemove && (
                <button type="button" onClick={onRemove} className="rounded-full border border-slate-700/55 bg-slate-900/70 px-2.5 py-1 text-slate-300 transition-colors hover:border-slate-600/70">
                  {isZh ? '移除' : 'Remove'}
                </button>
              )}
            </div>
          </motion.div>
        )}

        {status === 'ready' && isImage && imageSrc && (
          <motion.div key={`${name}-image`} {...cardMotion} className="relative shrink-0">
            <button
              type="button"
              className="file-card group min-w-[220px] cursor-pointer items-center gap-3"
              onClick={openLightbox}
              onKeyDown={handlePreviewKeyDown}
              aria-label={`${isZh ? '预览' : 'Preview'} ${name}`}
            >
              <img src={imageSrc} alt={name} className="h-14 w-14 rounded-2xl border border-slate-700/60 object-cover" />
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-xs font-medium text-slate-200">{name}</p>
                <p className="text-[11px] text-slate-500">{isZh ? `图片 · ${formatSize(size)}` : `Image · ${formatSize(size)}`}</p>
              </div>
            </button>
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full border border-slate-700/60 bg-slate-950/92 text-slate-300 transition-colors hover:border-red-500/40 hover:text-red-200"
                aria-label={isZh ? '移除附件' : 'Remove'}
              >
                <svg className="h-[14px] w-[14px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </motion.div>
        )}

        {status === 'ready' && (!isImage || !imageSrc) && (
          <motion.div key={`${name}-file`} {...cardMotion} className="relative shrink-0">
            <div className="file-card min-w-[220px]">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-700/60 bg-slate-800/75 text-[11px] font-semibold tracking-[0.12em] text-slate-300">
                {getFileIcon(mime)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-200">{name}</p>
                <p className="text-[11px] text-slate-500">{formatSize(size)}</p>
              </div>
              {attachment && (
                <a
                  href={getUploadUrl(attachment.storageKey)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-purple-500/25 bg-purple-500/10 px-2.5 py-1 text-[11px] text-purple-200 transition-colors hover:bg-purple-500/18"
                  download={name}
                >
                  {isZh ? '打开' : 'Open'}
                </a>
              )}
            </div>
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full border border-slate-700/60 bg-slate-950/92 text-slate-300 transition-colors hover:border-red-500/40 hover:text-red-200"
                aria-label={isZh ? '移除附件' : 'Remove'}
              >
                <svg className="h-[14px] w-[14px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {lightboxOpen && attachment && imageSrc && (
          <motion.div
            {...lightboxMotion}
            className="lightbox-backdrop cursor-default md:cursor-zoom-out"
            onClick={() => setLightboxOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label={`${isZh ? '查看中' : 'Viewing'} ${name}`}
            tabIndex={-1}
            onKeyDown={handleLightboxKeyDown}
          >
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
              transition={{ duration: reduceMotion ? 0 : 0.18 }}
              className="relative flex h-full w-full items-center justify-center md:h-auto md:w-auto"
              onClick={(e) => e.stopPropagation()}
              ref={dialogRef}
            >
              <img src={imageSrc} alt={name} className="h-full w-full object-contain md:max-h-[90vh] md:max-w-[90vw]" />
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setLightboxOpen(false)}
                className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full border border-slate-700/60 bg-slate-950/88 text-slate-100 transition-colors hover:border-slate-500/70"
                aria-label={isZh ? '关闭预览' : 'Close'}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
