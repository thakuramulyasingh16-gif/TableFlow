import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { AppError } from './api-error';
import { getEnv } from './env';

export const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIMES)[number];

export const MAX_IMAGE_SIZE_BYTES = 3 * 1024 * 1024; // 3 MB

/**
 * Validates image header magic bytes to prevent file upload polyglots or malicious executables.
 */
export function validateImageMagicBytes(buffer: Buffer): { valid: boolean; detectedMime?: AllowedImageMime } {
  if (buffer.length < 12) {
    return { valid: false };
  }

  // JPEG: starts with FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, detectedMime: 'image/jpeg' };
  }

  // PNG: starts with 89 50 4E 47 0D 0A 1A 0A
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
    return { valid: true, detectedMime: 'image/png' };
  }

  // WebP: starts with "RIFF" (52 49 46 46) and bytes 8..11 are "WEBP" (57 45 42 50)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { valid: true, detectedMime: 'image/webp' };
  }

  return { valid: false };
}

/**
 * Generates a cryptographically random filename with an extension derived strictly from validated MIME.
 * Never uses or preserves client-supplied filenames.
 */
export function generateSafeImageFilename(mimeType: AllowedImageMime): string {
  const extensionMap: Record<AllowedImageMime, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  const ext = extensionMap[mimeType] || 'jpg';
  const uniqueId = crypto.randomUUID();
  return `${uniqueId}.${ext}`;
}

/**
 * Uploads a validated dish image buffer to Supabase Storage bucket 'dish-images'.
 * Falls back to mock storage URL in test or local unconfigured environments.
 */
export async function uploadDishImageToStorage({
  buffer,
  mimeType,
  filename,
}: {
  buffer: Buffer;
  mimeType: AllowedImageMime;
  filename: string;
}): Promise<string> {
  const env = getEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const bucket = 'dish-images';

  if (!supabaseUrl || !serviceKey || env.isPaymentsMock || process.env.NODE_ENV === 'test') {
    // Clean fallback matching next.config.ts remotePattern (*.supabase.co)
    return `https://demo.supabase.co/storage/v1/object/public/${bucket}/${filename}`;
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.storage.from(bucket).upload(filename, buffer, {
    contentType: mimeType,
    upsert: false,
  });

  if (error) {
    if (error.message?.includes('not found') || (error as { statusCode?: number }).statusCode === 404) {
      await supabase.storage.createBucket(bucket, { public: true });
      const retry = await supabase.storage.from(bucket).upload(filename, buffer, {
        contentType: mimeType,
        upsert: false,
      });
      if (retry.error) {
        throw new AppError(500, `Storage upload failed: ${retry.error.message}`, 'STORAGE_ERROR');
      }
    } else {
      throw new AppError(500, `Storage upload failed: ${error.message}`, 'STORAGE_ERROR');
    }
  }

  const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filename);
  return publicUrlData.publicUrl;
}
