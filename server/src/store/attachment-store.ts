import { v4 as uuid } from 'uuid';
import type { FileAttachment } from '@ai_manager/shared';
import { logger } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

const UPLOAD_ROOT = path.resolve('uploads');

interface AttachmentRecord {
  attachment: FileAttachment;
  messageId?: string;
}

const MIME_BY_EXT: Record<string, string> = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
  '.xml': 'application/xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

function inferMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

export class AttachmentStore {
  private attachments = new Map<string, AttachmentRecord>();

  create(sessionId: string, file: Express.Multer.File, storageKey: string): FileAttachment {
    const id = uuid();
    const mimeType = file.mimetype;
    const type: FileAttachment['type'] = mimeType.startsWith('image/') ? 'image' : 'file';
    const attachment: FileAttachment = {
      id,
      sessionId,
      storageKey,
      originalName: file.originalname,
      mimeType,
      size: file.size,
      status: 'ready',
      type,
      createdAt: Date.now(),
    };
    this.attachments.set(id, { attachment });
    logger.info({ id, sessionId, storageKey, originalName: file.originalname }, 'Attachment created');
    return attachment;
  }

  async importFile(sessionId: string, sourcePath: string, originalName?: string): Promise<FileAttachment> {
    const resolvedSource = path.resolve(sourcePath);
    const stats = await fs.stat(resolvedSource);
    const storageKey = `${uuid()}${path.extname(resolvedSource).toLowerCase() || '.bin'}`;
    const targetPath = path.resolve(UPLOAD_ROOT, storageKey);

    await fs.mkdir(UPLOAD_ROOT, { recursive: true });
    await fs.copyFile(resolvedSource, targetPath);

    const mimeType = inferMimeType(resolvedSource);
    const type: FileAttachment['type'] = mimeType.startsWith('image/') ? 'image' : 'file';
    const attachment: FileAttachment = {
      id: uuid(),
      sessionId,
      storageKey,
      originalName: originalName ?? path.basename(resolvedSource),
      mimeType,
      size: stats.size,
      status: 'ready',
      type,
      createdAt: Date.now(),
    };

    this.attachments.set(attachment.id, { attachment });
    logger.info({ id: attachment.id, sessionId, sourcePath: resolvedSource, storageKey }, 'Attachment imported from workspace file');
    return attachment;
  }

  get(id: string): FileAttachment | undefined {
    return this.attachments.get(id)?.attachment;
  }

  getBySession(sessionId: string): FileAttachment[] {
    return Array.from(this.attachments.values())
      .filter((r) => r.attachment.sessionId === sessionId)
      .map((r) => r.attachment);
  }

  getByIds(ids: string[]): FileAttachment[] {
    return ids
      .map((id) => this.attachments.get(id)?.attachment)
      .filter((a): a is FileAttachment => a != null);
  }

  getLocalPath(attachment: FileAttachment): string | undefined {
    const resolved = path.resolve(UPLOAD_ROOT, attachment.storageKey);
    return resolved.startsWith(UPLOAD_ROOT + path.sep) ? resolved : undefined;
  }

  bindToMessage(ids: string[], messageId: string): void {
    for (const id of ids) {
      const record = this.attachments.get(id);
      if (record) {
        record.messageId = messageId;
      }
    }
  }

  assertAttachable(sessionId: string, ids: string[]): void {
    if (!ids || ids.length === 0) return;
    for (const id of ids) {
      const record = this.attachments.get(id);
      if (!record) {
        throw new Error(`Attachment ${id} not found`);
      }
      if (record.attachment.sessionId !== sessionId) {
        throw new Error(`Attachment ${id} does not belong to session ${sessionId}`);
      }
      if (record.attachment.status !== 'ready') {
        throw new Error(`Attachment ${id} is not ready (status: ${record.attachment.status})`);
      }
    }
  }

  async cleanupBySession(sessionId: string): Promise<void> {
    const attachments = this.getBySession(sessionId);
    for (const att of attachments) {
      try {
        const filePath = path.resolve(UPLOAD_ROOT, att.storageKey);
        if (filePath.startsWith(UPLOAD_ROOT + path.sep)) {
          await fs.rm(filePath, { force: true });
        }
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          logger.warn({ error: err, storageKey: att.storageKey }, 'Failed to delete attachment file');
        }
      }
      this.attachments.delete(att.id);
    }
    logger.info({ sessionId, count: attachments.length }, 'Cleaned up session attachments');
  }

  async cleanupOrphans(): Promise<number> {
    const now = Date.now();
    const uploadingTimeout = 6 * 60 * 60 * 1000; // 6 hours for stuck uploads
    const unboundTimeout = 24 * 60 * 60 * 1000; // 24 hours for ready-but-unbound
    let cleaned = 0;

    for (const [id, record] of this.attachments) {
      const att = record.attachment;
      const age = now - att.createdAt;
      const shouldClean =
        (att.status === 'uploading' && age > uploadingTimeout) ||
        (att.status === 'ready' && !record.messageId && age > unboundTimeout);

      if (shouldClean) {
        try {
          const filePath = path.resolve(UPLOAD_ROOT, att.storageKey);
          if (filePath.startsWith(UPLOAD_ROOT + path.sep)) {
            await fs.rm(filePath, { force: true });
          }
        } catch (err: any) {
          if (err.code !== 'ENOENT') {
            logger.warn({ error: err, storageKey: att.storageKey }, 'Failed to delete orphan attachment file');
          }
        }
        this.attachments.delete(id);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.info({ cleaned }, 'Cleaned up orphan attachments');
    }
    return cleaned;
  }
}

export const attachmentStore = new AttachmentStore();
