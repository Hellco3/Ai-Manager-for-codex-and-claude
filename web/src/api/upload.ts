const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

async function wait(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

interface FileAttachment {
  id: string;
  sessionId: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  size: number;
  status: string;
  type: 'image' | 'file';
  createdAt: number;
}

interface UploadResult {
  files: FileAttachment[];
  errors?: Array<{ originalName: string; error: string }>;
}

export async function uploadFiles(
  files: File[],
  sessionId: string,
  signal?: AbortSignal,
): Promise<FileAttachment[]> {
  const formData = new FormData();
  files.forEach(f => formData.append('files', f));
  formData.append('sessionId', sessionId);

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch('/api/uploads', {
        method: 'POST',
        body: formData,
        signal,
      });

      const data: UploadResult = await res.json();

      if (!res.ok) {
        // Check if retryable
        if (attempt < maxRetries && isRetryableStatus(res.status)) {
          await wait(500 * 2 ** attempt + Math.random() * 300);
          continue;
        }
        throw new Error(data.errors?.[0]?.error || `Upload failed (${res.status})`);
      }

      return data.files;
    } catch (err: any) {
      if (err.name === 'AbortError') throw err;
      lastError = err;
      if (attempt < maxRetries && isRetryableStatus(err.status)) {
        await wait(500 * 2 ** attempt + Math.random() * 300);
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error('Upload failed');
}

export function getUploadUrl(storageKey: string): string {
  return `/api/uploads/${encodeURIComponent(storageKey)}`;
}

export type { FileAttachment };
