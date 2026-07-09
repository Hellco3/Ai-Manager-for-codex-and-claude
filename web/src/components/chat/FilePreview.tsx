import React, { useState, useCallback } from 'react';
import type { FileAttachment } from '../../api/upload.js';
import { getUploadUrl } from '../../api/upload.js';

interface FilePreviewProps {
  attachment?: FileAttachment;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  status?: 'queued' | 'uploading' | 'ready' | 'failed';
  onRemove?: () => void;
  onRetry?: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.includes('pdf')) return '📄';
  if (mimeType.includes('zip')) return '📦';
  if (mimeType.startsWith('text/')) return '📝';
  if (mimeType.includes('json')) return '📋';
  return '📎';
}

export default function FilePreview({
  attachment,
  fileName,
  fileSize,
  mimeType,
  status = 'ready',
  onRemove,
  onRetry,
}: FilePreviewProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const name = attachment?.originalName ?? fileName ?? 'unknown';
  const size = attachment?.size ?? fileSize ?? 0;
  const mime = attachment?.mimeType ?? mimeType ?? 'application/octet-stream';
  const isImage = mime.startsWith('image/');
  const type = isImage ? 'image' : 'file';

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
    },
    [],
  );

  // Queued / uploading state
  if (status === 'queued' || status === 'uploading') {
    return (
      <div className="file-card relative group shrink-0" role="status" aria-label={`Uploading ${name}`}>
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-slate-700/50 flex items-center justify-center">
            <svg className="animate-spin w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-300 truncate max-w-[120px]">{name}</p>
            <p className="text-[10px] text-slate-500">Uploading...</p>
          </div>
        </div>
        {onRemove && (
          <button
            onClick={onRemove}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-700 hover:bg-red-600 text-slate-400 hover:text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
            aria-label="Remove"
          >
            ×
          </button>
        )}
      </div>
    );
  }

  // Failed state
  if (status === 'failed') {
    return (
      <div className="file-card relative group shrink-0 border-red-500/30 bg-red-500/5" role="alert" aria-live="assertive">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center text-lg">
            ⚠️
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-300 truncate max-w-[120px]">{name}</p>
            <p className="text-[10px] text-red-400">Upload failed</p>
          </div>
        </div>
        <div className="flex gap-1">
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
            >
              Retry
            </button>
          )}
          {onRemove && (
            <button
              onClick={onRemove}
              className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    );
  }

  // Ready state - image
  if (isImage && attachment) {
    const imgUrl = getUploadUrl(attachment.storageKey);
    return (
      <>
        <div className="file-card relative group shrink-0 cursor-pointer" onClick={() => setLightboxOpen(true)}>
          <img
            src={imgUrl}
            alt={name}
            className="w-12 h-12 rounded-lg object-cover border border-slate-700/50"
          />
          {onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-700 hover:bg-red-600 text-slate-400 hover:text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
              aria-label="Remove"
            >
              ×
            </button>
          )}
        </div>

        {/* Lightbox */}
        {lightboxOpen && (
          <div
            className="lightbox-backdrop"
            onClick={() => setLightboxOpen(false)}
            onKeyDown={handleKeyDown}
            tabIndex={0}
            role="dialog"
            aria-label={`Viewing ${name}`}
          >
            <img
              src={imgUrl}
              alt={name}
              className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-slate-800/80 hover:bg-slate-700 text-white flex items-center justify-center text-xl transition-all"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        )}
      </>
    );
  }

  // Ready state - generic file
  return (
    <div className="file-card relative group shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-lg bg-slate-700/50 flex items-center justify-center text-lg">
          {getFileIcon(mime)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-300 truncate max-w-[120px]">{name}</p>
          <p className="text-[10px] text-slate-500">{formatSize(size)}</p>
        </div>
      </div>
      {attachment && (
        <a
          href={getUploadUrl(attachment.storageKey)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
          download={name}
        >
          Open
        </a>
      )}
      {onRemove && (
        <button
          onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-700 hover:bg-red-600 text-slate-400 hover:text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
          aria-label="Remove"
        >
          ×
        </button>
      )}
    </div>
  );
}
