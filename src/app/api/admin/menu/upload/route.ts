import { NextResponse } from 'next/server';
import { withStaffAuth } from '@/lib/auth-guard';
import { AppError } from '@/lib/api-error';
import { recordAuditLog } from '@/lib/audit';
import {
  ALLOWED_IMAGE_MIMES,
  AllowedImageMime,
  generateSafeImageFilename,
  MAX_IMAGE_SIZE_BYTES,
  uploadDishImageToStorage,
  validateImageMagicBytes,
} from '@/lib/storage';

export const POST = withStaffAuth(['owner', 'manager'], async (req, { actor }) => {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    throw new AppError(400, 'Invalid multipart form data', 'INVALID_FORM_DATA');
  }

  const file = formData.get('file');
  if (!file || !(file instanceof Blob)) {
    throw new AppError(400, 'No image file provided in "file" field', 'FILE_REQUIRED');
  }

  // 1. File size check (3 MB max)
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new AppError(400, 'Image exceeds maximum allowed size of 3 MB', 'FILE_TOO_LARGE');
  }

  if (file.size < 12) {
    throw new AppError(400, 'File is too small to be a valid image', 'FILE_TOO_SMALL');
  }

  // 2. MIME type check
  const rawType = (file.type || '').toLowerCase();
  if (!ALLOWED_IMAGE_MIMES.includes(rawType as AllowedImageMime)) {
    throw new AppError(
      400,
      'Only JPEG, PNG, and WebP images are allowed. Executable and vector files are strictly forbidden.',
      'INVALID_IMAGE_TYPE'
    );
  }

  // 3. Inspect magic bytes
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const magicValidation = validateImageMagicBytes(buffer);

  if (!magicValidation.valid || !magicValidation.detectedMime) {
    throw new AppError(
      400,
      'File content does not match a valid JPEG, PNG, or WebP image signature',
      'INVALID_IMAGE_SIGNATURE'
    );
  }

  // 4. Generate cryptographically safe random filename (ignoring any client-supplied name)
  const safeFilename = generateSafeImageFilename(magicValidation.detectedMime);

  // 5. Upload to storage bucket
  const publicUrl = await uploadDishImageToStorage({
    buffer,
    mimeType: magicValidation.detectedMime,
    filename: safeFilename,
  });

  // 6. Audit log
  await recordAuditLog({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'DISH_IMAGE_UPLOADED',
    entityType: 'MenuItemImage',
    metadata: {
      filename: safeFilename,
      sizeBytes: file.size,
      mimeType: magicValidation.detectedMime,
      publicUrl,
    },
  });

  return NextResponse.json(
    {
      url: publicUrl,
      filename: safeFilename,
      size: file.size,
      mimeType: magicValidation.detectedMime,
    },
    { status: 201 }
  );
});
