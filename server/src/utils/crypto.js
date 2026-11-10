import crypto from 'node:crypto';

export function generateOpaqueToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyHmacSha256(payload, secret, providedSignature) {
  if (!payload || !secret || !providedSignature) return false;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return timingSafeEqualHex(expected, providedSignature);
}
