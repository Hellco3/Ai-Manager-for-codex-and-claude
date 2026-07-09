import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { v4 as uuid } from 'uuid';
import { fileTypeFromFile } from 'file-type';
import { attachmentStore } from '../store/attachment-store.js';
import { logger } from '../utils/logger.js';

const UPLOAD_ROOT = path.resolve('uploads');

// Allowed MIME types (detected, not claimed)
const ALLOWED_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'application/json',
  'application/zip',
  'application/xml',
  'text/markdown',
  'text/csv',
]);

// Tiered size limits
const SIZE_LIMITS: Record<string, number> = {
  image: 8 * 1024 * 1024,    // 8MB
  pdf: 20 * 1024 * 1024,     // 20MB
  text: 2 * 1024 * 1024,     // 2MB
  default: 10 * 1024 * 1024, // 10MB
};

function getSizeLimit(mimeType: string): number {
  if (mimeType.startsWith('image/')) return SIZE_LIMITS.image;
  if (mimeType === 'application/pdf') return SIZE_LIMITS.pdf;
  if (mimeType.startsWith('text/') || mimeType === 'application/json') return SIZE_LIMITS.text;
  return SIZE_LIMITS.default;
}

// Multer configuration
const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    await fs.mkdir(UPLOAD_ROOT, { recursive: true });
    cb(null, UPLOAD_ROOT);
  },
  filename: (_req, _file, cb) => {
    const ext = path.extname(_file.originalname).toLowerCase() || '.bin';
    cb(null, `${uuid()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB hard cap
  fileFilter: (_req, file, cb) => {
    // Accept common types for initial filtering; magic number check follows
    const allowed = /^(image\/(jpeg|png|gif|webp|svg\+xml)|text\/|application\/(pdf|json|zip|xml))/;
    if (allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

const router = Router();

// POST /api/uploads - Upload files
router.post('/uploads', upload.array('files', 5), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const sessionId = req.body?.sessionId as string;
    if (!sessionId) {
      // Clean up files without session
      for (const f of files) {
        await fs.rm(f.path, { force: true });
      }
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const results: Array<{ id: string; originalName: string; mimeType: string; size: number; storageKey: string; type: 'image' | 'file'; status: string; createdAt: number; sessionId: string }> = [];
    const errors: Array<{ originalName: string; error: string }> = [];

    for (const file of files) {
      try {
        // Magic number detection
        const detected = await fileTypeFromFile(file.path);
        const effectiveMime = detected?.mime ?? file.mimetype;

        if (!ALLOWED_MIMES.has(effectiveMime)) {
          await fs.rm(file.path, { force: true });
          errors.push({ originalName: file.originalname, error: `Unsupported file type: ${effectiveMime}` });
          continue;
        }

        // Size check per type
        const limit = getSizeLimit(effectiveMime);
        if (file.size > limit) {
          await fs.rm(file.path, { force: true });
          errors.push({ originalName: file.originalname, error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB > ${(limit / 1024 / 1024).toFixed(1)}MB limit)` });
          continue;
        }

        // Path traversal prevention
        const storageKey = path.basename(file.filename);
        const resolved = path.resolve(UPLOAD_ROOT, storageKey);
        if (!resolved.startsWith(UPLOAD_ROOT + path.sep)) {
          await fs.rm(file.path, { force: true });
          errors.push({ originalName: file.originalname, error: 'Invalid file path' });
          continue;
        }

        const attachment = attachmentStore.create(sessionId, file, storageKey);
        results.push({
          id: attachment.id,
          sessionId: attachment.sessionId,
          originalName: attachment.originalName,
          mimeType: attachment.mimeType,
          size: attachment.size,
          storageKey: attachment.storageKey,
          type: attachment.type,
          status: attachment.status,
          createdAt: attachment.createdAt,
        });
      } catch (err: any) {
        await fs.rm(file.path, { force: true }).catch(() => {});
        errors.push({ originalName: file.originalname, error: err.message || 'Processing failed' });
      }
    }

    logger.info({ results: results.length, errors: errors.length }, 'Upload completed');
    res.json({ files: results, errors: errors.length > 0 ? errors : undefined });
  } catch (err: any) {
    logger.error({ error: err }, 'Upload failed');
    // Clean up on unexpected error
    const files = (req.files as Express.Multer.File[]) || [];
    for (const f of files) {
      await fs.rm(f.path, { force: true }).catch(() => {});
    }
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// GET /api/uploads/:storageKey - Serve uploaded file
router.get('/uploads/:storageKey', async (req: Request, res: Response) => {
  try {
    const rawKey = req.params.storageKey;
    const storageKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    // Path traversal prevention
    const resolved = path.resolve(UPLOAD_ROOT, storageKey);
    if (!resolved.startsWith(UPLOAD_ROOT + path.sep)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Verify file exists
    try {
      await fs.access(resolved);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }

    // Detect MIME type for proper Content-Type
    const detected = await fileTypeFromFile(resolved);
    const mimeType = detected?.mime ?? 'application/octet-stream';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(resolved);
  } catch (err: any) {
    logger.error({ error: err, storageKey: req.params.storageKey }, 'Serve file failed');
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

export default router;
