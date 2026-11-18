import crypto from 'node:crypto';

// Encryption key for AES-256-GCM at rest (32 bytes)
export function getMfaEncryptionKey(): Buffer {
  const envKey = process.env.MFA_ENCRYPTION_KEY;
  if (envKey) {
    try {
      const buf = Buffer.from(envKey, 'base64');
      if (buf.length === 32) return buf;
    } catch {
      // fallback if invalid format
    }
  }
  // In development or test, derive a deterministic 32-byte key from AUTH_SECRET
  const fallback = process.env.AUTH_SECRET || 'tableflow-dev-fallback-mfa-encryption-key-32b';
  return crypto.createHash('sha256').update(fallback).digest();
}

/**
 * Encrypt MFA secret using AES-256-GCM.
 * Output format: enc:v1:<iv_b64>:<tag_b64>:<ciphertext_b64>
 */
export function encryptMfaSecret(plaintext: string): string {
  const key = getMfaEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `enc:v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt MFA secret using AES-256-GCM.
 * Handles legacy unencrypted secrets gracefully (if string does not start with enc:v1:).
 */
export function decryptMfaSecret(storedValue: string): string {
  if (!storedValue.startsWith('enc:v1:')) {
    // Unencrypted legacy secret
    return storedValue;
  }

  const parts = storedValue.split(':');
  if (parts.length !== 5) {
    throw new Error('Invalid encrypted MFA secret format');
  }

  const [, , ivB64, tagB64, cipherB64] = parts;
  const key = getMfaEncryptionKey();
  const iv = Buffer.from(ivB64!, 'base64');
  const tag = Buffer.from(tagB64!, 'base64');
  const encrypted = Buffer.from(cipherB64!, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  return decrypted.toString('utf8');
}

// Standard Base32 decoding (RFC 4648)
function base32Decode(base32: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  const clean = base32.replace(/=+$/, '').toUpperCase().replace(/[\s-]/g, '');

  for (let i = 0; i < clean.length; i++) {
    const idx = alphabet.indexOf(clean[i]!);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

// Generate 6-digit TOTP token (RFC 6238)
export function generateTotp(secretBase32: string, time = Date.now(), step = 30): string {
  const counter = Math.floor(time / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter), 0);

  const key = base32Decode(secretBase32);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();

  const offset = hmac[hmac.length - 1]! & 0x0f;
  const codeInt =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  return (codeInt % 1000000).toString().padStart(6, '0');
}

export interface VerifyTotpResult {
  valid: boolean;
  timeStep?: number;
}

/**
 * Verify 6-digit TOTP token with +/- window tolerance and replay protection.
 * If lastAcceptedTimeStep is provided, rejects any matched time-step <= lastAcceptedTimeStep.
 */
export function verifyTotpWithReplay(
  token: string,
  secretBase32: string,
  lastAcceptedTimeStep?: number | null,
  window = 1,
  time = Date.now(),
  step = 30
): VerifyTotpResult {
  const cleanToken = token.trim();
  if (cleanToken.length !== 6 || !/^\d{6}$/.test(cleanToken)) {
    return { valid: false };
  }

  const baseStep = Math.floor(time / 1000 / step);

  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    const currentStep = baseStep + errorWindow;
    const calc = generateTotp(secretBase32, currentStep * step * 1000, step);
    if (crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(cleanToken))) {
      // Replay protection: reject if current step <= last accepted step
      if (
        lastAcceptedTimeStep !== undefined &&
        lastAcceptedTimeStep !== null &&
        currentStep <= lastAcceptedTimeStep
      ) {
        return { valid: false };
      }
      return { valid: true, timeStep: currentStep };
    }
  }

  return { valid: false };
}

// Verify 6-digit TOTP token with +/- window tolerance (default 1 window = 30s)
export function verifyTotp(
  token: string,
  secretBase32: string,
  window = 1,
  time = Date.now(),
  step = 30
): boolean {
  return verifyTotpWithReplay(token, secretBase32, null, window, time, step).valid;
}

// Generate base32 secret for TOTP
export function generateTotpSecret(length = 20): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    result += alphabet[bytes[i]! % 32];
  }
  return result;
}

/**
 * Generate single-use recovery codes.
 * Each code is at least 10 chars of base32 (50+ bits of entropy), formatted as XXXXX-XXXXX.
 * Stored as HMAC-SHA256 using the server key.
 */
export function generateRecoveryCodes(count = 8): { plainCodes: string[]; hashedCodes: string[] } {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const plainCodes: string[] = [];
  const hashedCodes: string[] = [];
  const hmacKey = getMfaEncryptionKey();

  for (let i = 0; i < count; i++) {
    const bytes = crypto.randomBytes(10);
    let codeStr = '';
    for (let j = 0; j < 10; j++) {
      codeStr += alphabet[bytes[j]! % 32];
    }
    const formatted = `${codeStr.slice(0, 5)}-${codeStr.slice(5)}`;
    plainCodes.push(formatted);

    const hmacHex = crypto.createHmac('sha256', hmacKey).update(formatted).digest('hex');
    hashedCodes.push(hmacHex);
  }

  return { plainCodes, hashedCodes };
}

/**
 * Verify and consume a recovery code using timingSafeEqual.
 * Supports both new HMAC-SHA256 hashes and legacy SHA-256 hashes for seamless migration.
 * Returns updated hashed list, or null if invalid.
 */
export function consumeRecoveryCode(code: string, hashedListJson: string | null): string[] | null {
  if (!hashedListJson) return null;
  const clean = code.trim().toUpperCase();

  let existing: string[];
  try {
    existing = JSON.parse(hashedListJson) as string[];
  } catch {
    return null;
  }

  const hmacKey = getMfaEncryptionKey();
  const candidateHmac = crypto.createHmac('sha256', hmacKey).update(clean).digest('hex');
  const candidateSha256 = crypto.createHash('sha256').update(clean).digest('hex');

  let matchIndex = -1;

  for (let i = 0; i < existing.length; i++) {
    const stored = existing[i]!;
    // Check HMAC-SHA256 match using constant-time comparison
    if (stored.length === candidateHmac.length) {
      if (crypto.timingSafeEqual(Buffer.from(stored, 'hex'), Buffer.from(candidateHmac, 'hex'))) {
        matchIndex = i;
        break;
      }
    }
    // Check legacy SHA-256 match using constant-time comparison
    if (stored.length === candidateSha256.length) {
      if (crypto.timingSafeEqual(Buffer.from(stored, 'hex'), Buffer.from(candidateSha256, 'hex'))) {
        matchIndex = i;
        break;
      }
    }
  }

  if (matchIndex === -1) return null;

  return existing.filter((_, i) => i !== matchIndex);
}
