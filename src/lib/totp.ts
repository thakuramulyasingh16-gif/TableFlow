import crypto from 'node:crypto';
import { sha256Hex } from './crypto';

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

// Verify 6-digit TOTP token with +/- window tolerance (default 1 window = 30s)
export function verifyTotp(
  token: string,
  secretBase32: string,
  window = 1,
  time = Date.now(),
  step = 30
): boolean {
  const cleanToken = token.trim();
  if (cleanToken.length !== 6 || !/^\d{6}$/.test(cleanToken)) return false;

  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    const calc = generateTotp(secretBase32, time + errorWindow * step * 1000, step);
    if (crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(cleanToken))) {
      return true;
    }
  }
  return false;
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

// Generate single-use recovery codes
export function generateRecoveryCodes(count = 8): { plainCodes: string[]; hashedCodes: string[] } {
  const plainCodes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < count; i++) {
    const part1 = crypto.randomBytes(2).toString('hex');
    const part2 = crypto.randomBytes(2).toString('hex');
    const code = `${part1}-${part2}`.toUpperCase();
    plainCodes.push(code);
    hashedCodes.push(sha256Hex(code));
  }

  return { plainCodes, hashedCodes };
}

// Verify and consume a recovery code (returns updated hashed list, or null if invalid)
export function consumeRecoveryCode(code: string, hashedListJson: string | null): string[] | null {
  if (!hashedListJson) return null;
  const clean = code.trim().toUpperCase();
  const hash = sha256Hex(clean);

  let existing: string[];
  try {
    existing = JSON.parse(hashedListJson) as string[];
  } catch {
    return null;
  }

  const idx = existing.indexOf(hash);
  if (idx === -1) return null;

  // Consume code
  const remaining = existing.filter((_, i) => i !== idx);
  return remaining;
}
