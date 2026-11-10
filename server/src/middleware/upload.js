import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { AppError } from '../utils/AppError.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function detectImageExtension(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return '.jpg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return '.png';
  }
  // WEBP: RIFF....WEBP
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return '.webp';
  }
  return null;
}

export const uploadMenuImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2 MB
    files: 1,
  },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      return cb(new AppError(400, 'Only JPEG, PNG, and WebP images are allowed.', 'INVALID_FILE_TYPE'));
    }
    return cb(null, true);
  },
});

export async function saveValidatedImage(file) {
  if (!file || !file.buffer) {
    throw new AppError(400, 'Image file is required.', 'FILE_MISSING');
  }
  const ext = detectImageExtension(file.buffer);
  if (!ext) {
    throw new AppError(400, 'File content does not match a valid JPEG, PNG, or WebP image.', 'INVALID_IMAGE_MAGIC');
  }

  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  const filename = `${crypto.randomUUID()}${ext}`;
  const fullPath = path.join(UPLOADS_DIR, filename);
  await fs.writeFile(fullPath, file.buffer, { flag: 'wx' });

  return {
    filename,
    url: `/uploads/${filename}`,
  };
}
