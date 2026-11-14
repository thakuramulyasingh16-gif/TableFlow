import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_IMAGE_MIMES,
  generateSafeImageFilename,
  MAX_IMAGE_SIZE_BYTES,
  uploadDishImageToStorage,
  validateImageMagicBytes,
} from '../src/lib/storage';

// Basic environment variables for test suite
Object.assign(process.env, {
  NODE_ENV: 'test',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  CORS_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/tableflow',
  AUTH_SECRET: 'dummy-auth'.padEnd(48, 'a'),
  GUEST_COOKIE_SECRET: 'dummy-guest'.padEnd(48, 'b'),
  PAYMENTS_MOCK: 'true',
});

test('validateImageMagicBytes identifies authentic JPEG, PNG, and WebP headers', () => {
  // 1. JPEG: FF D8 FF
  const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const jpegRes = validateImageMagicBytes(jpegHeader);
  assert.equal(jpegRes.valid, true);
  assert.equal(jpegRes.detectedMime, 'image/jpeg');

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const pngRes = validateImageMagicBytes(pngHeader);
  assert.equal(pngRes.valid, true);
  assert.equal(pngRes.detectedMime, 'image/png');

  // 3. WebP: RIFF .... WEBP
  const webpHeader = Buffer.from([
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x24, 0x00, 0x00, 0x00, // file size
    0x57, 0x45, 0x42, 0x50, // WEBP
  ]);
  const webpRes = validateImageMagicBytes(webpHeader);
  assert.equal(webpRes.valid, true);
  assert.equal(webpRes.detectedMime, 'image/webp');
});

test('validateImageMagicBytes strictly rejects executables, scripts, and spoofed extensions', () => {
  // Shell script / text disguised as image
  const shellScript = Buffer.from('#!/bin/bash\necho "exploit"\n');
  assert.equal(validateImageMagicBytes(shellScript).valid, false);

  // HTML / SVG with XSS vector
  const svgContent = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.equal(validateImageMagicBytes(svgContent).valid, false);

  // Windows PE / EXE: MZ header
  const peHeader = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
  assert.equal(validateImageMagicBytes(peHeader).valid, false);

  // PHP script
  const phpScript = Buffer.from('<?php phpinfo(); ?>');
  assert.equal(validateImageMagicBytes(phpScript).valid, false);

  // Short buffer (< 12 bytes)
  assert.equal(validateImageMagicBytes(Buffer.from([0xff, 0xd8])).valid, false);
});

test('generateSafeImageFilename generates cryptographically random UUID filenames with safe extensions', () => {
  const jpgName = generateSafeImageFilename('image/jpeg');
  assert.ok(jpgName.endsWith('.jpg'));
  assert.equal(jpgName.includes('..'), false);
  assert.equal(jpgName.includes('/'), false);
  assert.equal(jpgName.includes('\\'), false);

  const pngName = generateSafeImageFilename('image/png');
  assert.ok(pngName.endsWith('.png'));

  const webpName = generateSafeImageFilename('image/webp');
  assert.ok(webpName.endsWith('.webp'));

  // Ensure two consecutive calls generate unique names
  const another = generateSafeImageFilename('image/jpeg');
  assert.notEqual(jpgName, another);
});

test('Storage parameters enforce 3 MB max size and strictly allowed MIME types', () => {
  assert.equal(MAX_IMAGE_SIZE_BYTES, 3 * 1024 * 1024);
  assert.deepEqual([...ALLOWED_IMAGE_MIMES], ['image/jpeg', 'image/png', 'image/webp']);
});

test('uploadDishImageToStorage returns valid HTTPS URL matching allowed Supabase Storage pattern', async () => {
  const dummyBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const filename = generateSafeImageFilename('image/jpeg');

  const url = await uploadDishImageToStorage({
    buffer: dummyBuffer,
    mimeType: 'image/jpeg',
    filename,
  });

  assert.ok(url.startsWith('https://'));
  assert.ok(url.includes('.supabase.co/storage/v1/object/public/dish-images/'));
  assert.ok(url.endsWith(filename));
});
