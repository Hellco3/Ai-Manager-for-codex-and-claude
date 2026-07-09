import { create } from 'zustand';
import { uploadFiles, type FileAttachment } from '../api/upload.js';
import { usePipelineStore } from './pipeline-store.js';

export type UploadStatus = 'queued' | 'uploading' | 'ready' | 'failed';

export interface UploadItem {
  id: string;
  file: File;
  status: UploadStatus;
  attachment: FileAttachment | null;
  error: string | null;
  progress: number; // 0-100
  previewUrl: string | null;
}

interface UploadStore {
  items: UploadItem[];
  isUploading: boolean;

  enqueue: (files: File[], sessionId: string) => Promise<FileAttachment[]>;
  stageFiles: (files: File[]) => void;
  uploadStaged: (sessionId: string) => Promise<FileAttachment[]>;
  removeItem: (id: string) => void;
  clearReady: () => void;
  cancelAll: () => void;
  retryItem: (id: string, sessionId: string) => Promise<FileAttachment | null>;
}

let idCounter = 0;

export const useUploadStore = create<UploadStore>((set, get) => ({
  items: [],
  isUploading: false,

  enqueue: async (files: File[], sessionId: string) => {
    const items: UploadItem[] = files.map((file) => ({
      id: `upload-${++idCounter}`,
      file,
      status: 'queued',
      attachment: null,
      error: null,
      progress: 0,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    }));

    set((s) => ({ items: [...s.items, ...items], isUploading: true }));

    try {
      const attachments = await uploadFiles(files, sessionId);
      usePipelineStore.getState().upsertAttachments(attachments);

      set((s) => ({
        items: s.items.map((item) => {
          if (item.status === 'queued') {
            const match = attachments.find(
              (a) => a.originalName === item.file.name,
            ) as FileAttachment | undefined;
            if (match) {
              return {
                ...item,
                status: 'ready' as UploadStatus,
                attachment: match,
                progress: 100,
              };
            }
            return { ...item, status: 'failed' as UploadStatus, error: 'Upload failed' };
          }
          return item;
        }),
        isUploading: false,
      }));

      return attachments;
    } catch (err: any) {
      set((s) => ({
        items: s.items.map((item) =>
          item.status === 'queued'
            ? { ...item, status: 'failed' as UploadStatus, error: err.message || 'Upload error' }
            : item,
        ),
        isUploading: false,
      }));
      throw err;
    }
  },

  stageFiles: (files: File[]) => {
    const items: UploadItem[] = files.map((file) => ({
      id: `upload-${++idCounter}`,
      file,
      status: 'ready',
      attachment: null,
      error: null,
      progress: 100,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    }));

    set((s) => ({ items: [...s.items, ...items] }));
  },

  uploadStaged: async (sessionId: string) => {
    const stagedItems = get().items.filter((item) => item.status === 'ready' && !item.attachment);
    if (stagedItems.length === 0) {
      return [];
    }

    set((s) => ({
      items: s.items.map((item) =>
        stagedItems.some((staged) => staged.id === item.id)
          ? { ...item, status: 'uploading' as UploadStatus, progress: 0, error: null }
          : item,
      ),
      isUploading: true,
    }));

    try {
      const attachments = await uploadFiles(stagedItems.map((item) => item.file), sessionId);
      usePipelineStore.getState().upsertAttachments(attachments);

      set((s) => ({
        items: s.items.map((item) => {
          const staged = stagedItems.find((candidate) => candidate.id === item.id);
          if (!staged) {
            return item;
          }

          const match = attachments.find((attachment) => attachment.originalName === staged.file.name);
          if (!match) {
            return { ...item, status: 'failed' as UploadStatus, error: 'Upload failed', progress: 0 };
          }

          return {
            ...item,
            status: 'ready' as UploadStatus,
            attachment: match,
            progress: 100,
          };
        }),
        isUploading: false,
      }));

      return attachments;
    } catch (err: any) {
      set((s) => ({
        items: s.items.map((item) =>
          stagedItems.some((staged) => staged.id === item.id)
            ? { ...item, status: 'failed' as UploadStatus, error: err.message || 'Upload error', progress: 0 }
            : item,
        ),
        isUploading: false,
      }));
      throw err;
    }
  },

  removeItem: (id: string) => {
    const item = get().items.find((entry) => entry.id === id);
    if (item?.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }
    set((s) => ({
      items: s.items.filter((item) => item.id !== id),
      isUploading: s.items.length <= 1 && s.isUploading ? false : s.isUploading,
    }));
  },

  clearReady: () => {
    get().items.forEach((item) => {
      if (item.status === 'ready' && item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
    });
    set((s) => ({
      items: s.items.filter((item) => item.status !== 'ready'),
    }));
  },

  cancelAll: () => {
    set((s) => ({
      items: s.items.map((item) =>
        item.status === 'queued' || item.status === 'uploading'
          ? { ...item, status: 'failed' as UploadStatus, error: 'Cancelled' }
          : item,
      ),
      isUploading: false,
    }));
  },

  retryItem: async (id: string, sessionId: string) => {
    const item = get().items.find((i) => i.id === id);
    if (!item) return null;

    set((s) => ({
      items: s.items.map((i) =>
        i.id === id ? { ...i, status: 'uploading' as UploadStatus, error: null, progress: 0 } : i,
      ),
      isUploading: true,
    }));

    try {
      const attachments = await uploadFiles([item.file], sessionId);
      const attachment = attachments[0] ?? null;
      set((s) => ({
        items: s.items.map((i) =>
          i.id === id
            ? {
                ...i,
                status: attachment ? ('ready' as UploadStatus) : ('failed' as UploadStatus),
                attachment,
                progress: attachment ? 100 : 0,
                error: attachment ? null : 'Upload returned no file',
              }
            : i,
        ),
        isUploading: false,
      }));
      return attachment;
    } catch (err: any) {
      set((s) => ({
        items: s.items.map((i) =>
          i.id === id
            ? { ...i, status: 'failed' as UploadStatus, error: err.message || 'Retry failed' }
            : i,
        ),
        isUploading: false,
      }));
      return null;
    }
  },
}));
