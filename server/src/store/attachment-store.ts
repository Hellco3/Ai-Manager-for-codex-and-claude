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
